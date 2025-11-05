import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, InventoryCondition, InventoryLocationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { CreateInventoryLocationDto } from "./dto/create-inventory-location.dto";
import { UpdateInventoryLocationDto } from "./dto/update-inventory-location.dto";

@Injectable()
export class InventoryService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Create or return an Inventory row for product+warehouse.
	 * If totalQty is provided, set it (in practice this should reflect InventoryLocation sums).
	 */
	async createInventory(dto: CreateInventoryDto, userId: String) {
		// Validate references
		const [shipment, warehouse] = await Promise.all([this.prisma.shipment.findUnique({ where: { id: dto.shipmentId } }), this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } })]);

		if (!shipment) throw new NotFoundException("Shipment not found");
		if (!warehouse) throw new NotFoundException("Warehouse not found");

		// Validate storage structure
		const [rack, bin] = await Promise.all([this.prisma.rack.findUnique({ where: { id: dto.rackId } }), this.prisma.bin.findUnique({ where: { id: dto.binId } })]);

		if (!rack) throw new NotFoundException("Rack not found");
		if (!bin) throw new NotFoundException("Bin not found");

		// Check for existing inventory record in same slot
		const existingInventory = await this.prisma.inventory.findFirst({
			where: {
				shipmentId: dto.shipmentId,
				warehouseId: dto.warehouseId,
				rackId: dto.rackId,
				binId: dto.binId,
			},
		});

		if (existingInventory) {
			// Update relevant fields if record exists
			return this.prisma.inventory.update({
				where: { id: existingInventory.id },
				data: {
					condition: dto.condition ?? existingInventory.condition,
					status: dto.status ?? existingInventory.status,
					specialHandling: dto.specialHandling ?? existingInventory.specialHandling,
					updatedAt: new Date(),
				},
			});
		}

		// Create a new inventory record
		return this.prisma.inventory.create({
			data: {
				shipmentId: dto.shipmentId,
				warehouseId: dto.warehouseId,
				rackId: dto.rackId,
				binId: dto.binId,
				condition: dto.condition,
				status: dto.status,
				specialHandling: dto.specialHandling,
				clientName: dto.clientName,
				createdBy: userId as string,
			},
		});
	}

	/**
	 * Place qty into a given bin and create an InventoryLocation entry.
	 * This is transactional: checks bin capacity, updates bin.currentQty, updates inventory.totalQty,
	 * and inserts InventoryLocation.
	 */
	async createInventoryLocation(dto: CreateInventoryLocationDto, createdBy?: string) {
		// load bin and inventory
		const [bin, inventory] = await Promise.all([
			this.prisma.bin.findUnique({
				where: { id: dto.binId },
				include: { rack: { include: { zone: true } } },
			}),
			this.prisma.inventory.findUnique({
				where: { id: dto.inventoryId },
				include: { warehouse: true },
			}),
		]);

		if (!bin) throw new NotFoundException("Bin not found");
		if (!inventory) throw new NotFoundException("Inventory not found");

		// Derive denormalized fields from specialHandling
		const special = dto.specialHandling;
		const derivedTempMin = special?.tempMin ?? null;
		const derivedTempMax = special?.tempMax ?? null;
		const derivedIsHazardous = !!special?.isHazardous;
		const derivedCompatibility = Array.isArray(special?.compatibility) ? special.compatibility : [];

		// Validate special handling against bin/zone capabilities
		this.validateSpecialHandling(bin, derivedTempMin, derivedTempMax, derivedIsHazardous);

		// compute available capacity
		const available = bin.capacity - (bin.currentQty + bin.reservedQty);
		if (dto.qty > available) {
			throw new BadRequestException(`Bin does not have enough available space. Available: ${available}`);
		}

		// Transaction: increment bin.currentQty, increment inventory.totalQty, create inv location
		const result = await this.prisma.$transaction(async (tx) => {
			const updatedBin = await tx.bin.update({
				where: { id: bin.id },
				data: { currentQty: { increment: dto.qty } },
			});

			// Build inv location payload conditionally to satisfy Prisma types
			const invLocData: any = {
				inventoryId: inventory.id,
				binId: bin.id,
				qty: dto.qty,
				shipmentId: dto.shipmentId ?? null,
				clientId: dto.clientId ?? null,
				clientName: dto.clientName ?? null,
				lotNumber: dto.lotNumber ?? null,
				expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
				tempMin: derivedTempMin ?? null,
				tempMax: derivedTempMax ?? null,
				isHazardous: derivedIsHazardous,
				itemCompatibility: derivedCompatibility,
				createdBy: createdBy ?? null,
			};

			// Enums: cast to Prisma enum types (dto validated via DTOs)
			if (dto.status !== undefined && dto.status !== null) {
				invLocData.status = dto.status as InventoryLocationStatus;
			}
			if (dto.condition !== undefined && dto.condition !== null) {
				invLocData.condition = dto.condition as InventoryCondition;
			}

			// include specialHandling only if provided (avoid passing null which can conflict with types)
			if (special !== undefined) {
				invLocData.specialHandling = special;
			}

			const invLoc = await tx.inventoryLocation.create({
				data: invLocData,
			});

			return { updatedBin, invLoc };
		});

		return result.invLoc;
	}

	/**
	 * Validate special handling requirements against bin/zone capabilities
	 */
	private validateSpecialHandling(bin: any, tempMin: number | null, tempMax: number | null, isHazardous: boolean) {
		// Check temperature requirements
		if (tempMin !== null || tempMax !== null) {
			if (bin.tempMin === null || bin.tempMax === null) {
				throw new BadRequestException("This bin does not support temperature-controlled storage");
			}
			if (tempMin !== null && tempMin < bin.tempMin) {
				throw new BadRequestException(`Bin minimum temperature (${bin.tempMin}°C) cannot accommodate required minimum (${tempMin}°C)`);
			}
			if (tempMax !== null && tempMax > bin.tempMax) {
				throw new BadRequestException(`Bin maximum temperature (${bin.tempMax}°C) cannot accommodate required maximum (${tempMax}°C)`);
			}
		}

		// Check hazardous material requirements
		if (isHazardous && !bin.allowsHazardous) {
			throw new BadRequestException("This bin does not allow hazardous materials storage");
		}
	}

	/**
	 * Move inventory location between bins (or adjust qty).
	 * If binId is changed, this will decrement the source bin currentQty and increment target bin currentQty.
	 * All operations are done in a single transaction.
	 */
	async moveOrUpdateInventoryLocation(id: string, dto: UpdateInventoryLocationDto, updatedBy?: string) {
		const loc = await this.prisma.inventoryLocation.findUnique({
			where: { id },
		});
		if (!loc) throw new NotFoundException("InventoryLocation not found");

		// prepare fields
		const newQty = typeof dto.qty === "number" ? dto.qty : loc.qty;
		const targetBinId = dto.binId ?? loc.binId;

		// If moving bins or changing qty, we must update the two bins and the inventory total accordingly
		return this.prisma.$transaction(async (tx) => {
			// fetch bins inside tx for up-to-date quantities
			const [sourceBin, targetBin] = await Promise.all([
				tx.bin.findUnique({
					where: { id: loc.binId },
					include: { rack: { include: { zone: true } } },
				}),
				tx.bin.findUnique({
					where: { id: targetBinId },
					include: { rack: { include: { zone: true } } },
				}),
			]);

			if (!sourceBin) throw new NotFoundException("Source bin not found");
			if (!targetBin) throw new NotFoundException("Target bin not found");

			const qtyDelta = newQty - loc.qty; // positive => increase total qty; negative => decrease

			// Helper to prepare specialHandling-derived fields
			const special = dto.specialHandling;
			const derivedTempMin = special?.tempMin ?? loc.tempMin;
			const derivedTempMax = special?.tempMax ?? loc.tempMax;
			const derivedIsHazardous = special?.isHazardous ?? loc.isHazardous;
			const derivedCompatibility = Array.isArray(special?.compatibility) ? special.compatibility : loc.itemCompatibility;

			// Validate special handling if moving to different bin
			if (targetBinId !== loc.binId) {
				this.validateSpecialHandling(targetBin, derivedTempMin, derivedTempMax, derivedIsHazardous);
			}

			// If moving between different bins
			if (targetBinId !== loc.binId) {
				// check target capacity (consider targetBin.current + targetBin.reserved + newQty)
				const targetAvailable = targetBin.capacity - (targetBin.currentQty + targetBin.reservedQty);
				if (newQty > targetAvailable) {
					throw new BadRequestException(`Target bin does not have enough available space. Available: ${targetAvailable}`);
				}

				// decrement source bin currentQty by existing loc.qty
				await tx.bin.update({
					where: { id: sourceBin.id },
					data: { currentQty: { decrement: loc.qty } },
				});

				// increment target bin currentQty by newQty
				await tx.bin.update({
					where: { id: targetBin.id },
					data: { currentQty: { increment: newQty } },
				});

				// build update payload for inventoryLocation (use Prisma enum casts where needed)
				const updateData: any = {
					binId: targetBin.id,
					qty: newQty,
					lotNumber: dto.lotNumber ?? loc.lotNumber,
					expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : loc.expiryDate,
					tempMin: derivedTempMin ?? null,
					tempMax: derivedTempMax ?? null,
					isHazardous: derivedIsHazardous,
					itemCompatibility: derivedCompatibility,
					clientName: dto.clientName ?? loc.clientName,
					updatedAt: new Date(),
				};

				if (dto.status !== undefined) updateData.status = dto.status as InventoryLocationStatus;
				if (dto.condition !== undefined) updateData.condition = dto.condition as InventoryCondition;
				if (dto.specialHandling !== undefined) {
					// to clear: use Prisma.DbNull; otherwise set the provided JSON
					updateData.specialHandling = dto.specialHandling === null ? Prisma.DbNull : dto.specialHandling;
				}

				const updated = await tx.inventoryLocation.update({
					where: { id },
					data: updateData,
				});
				return updated;
			} else {
				// same bin — only adjust quantities
				const binAvailable = sourceBin.capacity - (sourceBin.currentQty + sourceBin.reservedQty);
				// If qtyDelta > 0, need to ensure there's room
				if (qtyDelta > 0 && qtyDelta > binAvailable) {
					throw new BadRequestException(`Bin does not have enough available space for increase. Available: ${binAvailable}`);
				}

				// update bin.currentQty by qtyDelta
				if (qtyDelta !== 0) {
					await tx.bin.update({
						where: { id: sourceBin.id },
						data: { currentQty: { increment: qtyDelta } },
					});
				}

				// build update data
				const updateData: any = {
					qty: newQty,
					lotNumber: dto.lotNumber ?? loc.lotNumber,
					expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : loc.expiryDate,
					tempMin: derivedTempMin ?? loc.tempMin,
					tempMax: derivedTempMax ?? loc.tempMax,
					isHazardous: derivedIsHazardous,
					itemCompatibility: derivedCompatibility,
					clientName: dto.clientName ?? loc.clientName,
					updatedAt: new Date(),
				};

				if (dto.status !== undefined) updateData.status = dto.status as InventoryLocationStatus;
				if (dto.condition !== undefined) updateData.condition = dto.condition as InventoryCondition;
				if (dto.specialHandling !== undefined) {
					updateData.specialHandling = dto.specialHandling === null ? Prisma.DbNull : dto.specialHandling;
				}

				const updated = await tx.inventoryLocation.update({
					where: { id },
					data: updateData,
				});
				return updated;
			}
		});
	}

	/**
	 * Remove an inventory location and decrement bin and inventory totals.
	 * This assumes deletion means physical removal of the qty from warehouse.
	 */
	async deleteInventoryLocation(id: string) {
		const loc = await this.prisma.inventoryLocation.findUnique({
			where: { id },
		});
		if (!loc) throw new NotFoundException("InventoryLocation not found");

		return this.prisma.$transaction(async (tx) => {
			// decrement bin currentQty
			await tx.bin.update({
				where: { id: loc.binId },
				data: { currentQty: { decrement: loc.qty } },
			});

			// delete the location
			await tx.inventoryLocation.delete({ where: { id } });

			return { ok: true };
		});
	}

	async getInventoryLocation(id: string) {
		const loc = await this.prisma.inventoryLocation.findUnique({
			where: { id },
			include: {
				bin: {
					include: {
						rack: {
							include: {
								zone: true,
							},
						},
					},
				},
				inventory: {
					include: {
						warehouse: true,
					},
				},
			},
		});
		if (!loc) throw new NotFoundException("InventoryLocation not found");
		return loc;
	}

	/**
	 * Enhanced list with comprehensive filtering per MVP requirements
	 */
	async listInventoryLocations(filter?: {
		clientId?: string;
		clientName?: string;
		shipmentId?: string;
		status?: string;
		binId?: string;
		warehouseId?: string;
		condition?: string;
		lotNumber?: string;
		isHazardous?: boolean;
		rackId?: string;
		zoneId?: string;
	}) {
		const where: any = {};

		if (filter?.clientId) where.clientId = filter.clientId;
		if (filter?.clientName) where.clientName = { contains: filter.clientName, mode: "insensitive" };
		if (filter?.shipmentId) where.shipmentId = filter.shipmentId;
		if (filter?.status) where.status = filter.status;
		if (filter?.binId) where.binId = filter.binId;
		if (filter?.condition) where.condition = filter.condition;
		if (filter?.lotNumber) where.lotNumber = { contains: filter.lotNumber, mode: "insensitive" };
		if (filter?.isHazardous !== undefined) where.isHazardous = filter.isHazardous;

		// Filter by warehouse (through inventory)
		if (filter?.warehouseId) {
			where.inventory = {
				warehouseId: filter.warehouseId,
			};
		}

		// Filter by rack or zone
		if (filter?.rackId || filter?.zoneId) {
			where.bin = {};
			if (filter.rackId) {
				where.bin.rackId = filter.rackId;
			}
			if (filter.zoneId) {
				where.bin.rack = {
					zoneId: filter.zoneId,
				};
			}
		}

		return this.prisma.inventoryLocation.findMany({
			where,
			orderBy: { createdAt: "desc" },
			include: {
				bin: {
					include: {
						rack: {
							include: {
								zone: true,
							},
						},
					},
				},
				inventory: {
					include: {
						warehouse: true,
					},
				},
				Company: true,
			},
		});
	}

	async getInventory(productId: string, warehouseId: string) {
		// Use findFirst to avoid relying on generated compound unique field typings
		return this.prisma.inventory.findFirst({
			where: { shipmentId: productId, warehouseId },
			include: { locations: true, shipment: true },
		});
	}

	/**
	 * NEW: Get inventory overview with real-time stock levels per warehouse
	 * Requirement: "Allow users to view stock per warehouse and consolidate across all warehouses"
	 */
	async getInventoryOverview(warehouseId?: string) {
		const where: any = {};
		if (warehouseId) {
			where.warehouseId = warehouseId;
		}

		const inventories = await this.prisma.inventory.findMany({
			where,
			include: {
				shipment: true,
				warehouse: true,
				locations: {
					include: {
						bin: {
							include: {
								rack: {
									include: {
										zone: true,
									},
								},
							},
						},
					},
				},
			},
		});

		return inventories.map((inv) => ({
			productId: inv.shipmentId,
			warehouseId: inv.warehouseId,
			warehouseName: inv.warehouse.name,
			availableQty: inv.locations.filter((loc) => loc.status === "AVAILABLE").reduce((sum, loc) => sum + loc.qty, 0),
			reservedQty: inv.locations.filter((loc) => loc.status === "RESERVED").reduce((sum, loc) => sum + loc.qty, 0),
			quarantineQty: inv.locations.filter((loc) => loc.status === "QUARANTINE").reduce((sum, loc) => sum + loc.qty, 0),
			damagedQty: inv.locations.filter((loc) => loc.status === "DAMAGED").reduce((sum, loc) => sum + loc.qty, 0),
			locationCount: inv.locations.length,
			lastUpdated: inv.updatedAt,
		}));
	}

	/**
	 * NEW: Get inventory by rack location
	 * Requirement: "track inventory levels at the rack level"
	 */
	async getInventoryByRack(rackId: string) {
		const locations = await this.prisma.inventoryLocation.findMany({
			where: {
				bin: {
					rackId: rackId,
				},
			},
			include: {
				bin: true,
				inventory: {
					include: {
						shipment: true,
					},
				},
				Company: true,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		return locations;
	}

	/**
	 * NEW: Generate inventory status report
	 * Requirement: "Users should be able to generate reports showing inventory status for each rack and inventory per warehouse"
	 */
	async generateInventoryReport(warehouseId?: string, rackId?: string) {
		const where: any = {};

		if (warehouseId) {
			where.inventory = {
				warehouseId: warehouseId,
			};
		}

		if (rackId) {
			where.bin = {
				rackId: rackId,
			};
		}

		const locations = await this.prisma.inventoryLocation.findMany({
			where,
			include: {
				bin: {
					include: {
						rack: {
							include: {
								zone: true,
							},
						},
					},
				},
				inventory: {
					include: {
						shipment: true,
						warehouse: true,
					},
				},
				Company: true,
			},
			orderBy: [{ inventory: { warehouse: { name: "asc" } } }, { bin: { rack: { zone: { name: "asc" } } } }, { bin: { rack: { name: "asc" } } }, { bin: { name: "asc" } }],
		});

		// Group by warehouse -> zone -> rack -> bin
		const report = locations.reduce((acc, loc) => {
			const warehouseName = loc.inventory.warehouse.name;
			const zoneName = loc.bin.rack.zone.name;
			const rackName = loc.bin.rack.name;
			const binName = loc.bin.name;

			if (!acc[warehouseName]) acc[warehouseName] = {};
			if (!acc[warehouseName][zoneName]) acc[warehouseName][zoneName] = {};
			if (!acc[warehouseName][zoneName][rackName]) acc[warehouseName][zoneName][rackName] = {};
			if (!acc[warehouseName][zoneName][rackName][binName]) {
				acc[warehouseName][zoneName][rackName][binName] = [];
			}

			acc[warehouseName][zoneName][rackName][binName].push({
				qty: loc.qty,
				status: loc.status,
				condition: loc.condition,
				clientName: loc.clientName,
				lotNumber: loc.lotNumber,
				expiryDate: loc.expiryDate,
				specialHandling: loc.specialHandling,
				arrivalDate: loc.createdAt,
			});

			return acc;
		}, {} as any);

		return report;
	}

	/**
	 * NEW: Get consolidated inventory across all warehouses
	 * Requirement: "Allow users to view stock per warehouse and consolidate across all warehouses"
	 */
	// async getConsolidatedInventory() {
	// 	const inventories = await this.prisma.inventory.findMany({
	// 		include: {
	// 			product: true,
	// 			warehouse: true,
	// 			locations: true,
	// 		},
	// 	});

	// 	// Group by product and aggregate across warehouses
	// 	const consolidated = inventories.reduce((acc, inv) => {
	// 		const productKey = inv.productId;

	// 		if (!acc[productKey]) {
	// 			acc[productKey] = {
	// 				productId: inv.productId,
	// 				productName: inv.product.name,
	// 				productSku: inv.product.sku,
	// 				totalQty: 0,
	// 				warehouses: [],
	// 			};
	// 		}

	// 		acc[productKey].totalQty += inv.totalQty;
	// 		acc[productKey].warehouses.push({
	// 			warehouseId: inv.warehouseId,
	// 			warehouseName: inv.warehouse.name,
	// 			qty: inv.totalQty,
	// 			locationCount: inv.locations.length,
	// 		});

	// 		return acc;
	// 	}, {} as any);

	// 	return Object.values(consolidated);
	// }

	/**
	 * NEW: Update inventory location status with audit trail
	 * Requirement: Status updates (Arrival → Storage → Picking → Packing → Ready for Dispatch → Dispatch)
	 */
	async updateInventoryLocationStatus(id: string, status: InventoryLocationStatus, updatedBy?: string, note?: string) {
		const loc = await this.prisma.inventoryLocation.findUnique({
			where: { id },
		});

		if (!loc) throw new NotFoundException("InventoryLocation not found");

		return this.prisma.inventoryLocation.update({
			where: { id },
			data: {
				status,
				updatedAt: new Date(),
			},
		});
	}
}
