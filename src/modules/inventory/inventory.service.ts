import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, InventoryCondition, InventoryLocationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { CreateInventoryLocationDto } from "./dto/create-inventory-location.dto";
import { UpdateInventoryLocationDto } from "./dto/update-inventory-location.dto";
import { ShipmentStatus } from "../shipments/dto/update-status.dto";
import { MailService } from "../../common/mail/mail.service";
import UrlService from "../auth/url.service";

@Injectable()
export class InventoryService {
	constructor(private readonly prisma: PrismaService, private readonly mailer: MailService, private readonly urlService: UrlService) {}

	private safeParseLocation(val: any): any | null {
		if (!val && val !== 0) return null;
		if (typeof val === "object") return val;
		if (typeof val !== "string") return val;

		try {
			return JSON.parse(val);
		} catch (e) {
			const stripped = val.replace(/^"+|"+$/g, "");
			try {
				return JSON.parse(stripped);
			} catch (e2) {
				return { address: stripped };
			}
		}
	}

	private formatLocationText(loc: any) {
		if (!loc) return "";
		const address = loc.address || loc.addr || "";
		const state = loc.state || loc.region || "";
		const country = loc.country || "";
		const phone = loc.phone || loc.contact || loc.telephone || "";
		const parts = [address, state, country].filter(Boolean).join(", ");
		return parts ? `${parts}. Contact: ${phone || "N/A"}` : phone || "N/A";
	}

	private prettyDate(d?: Date | string | null) {
		if (!d) return "TBD";
		const dt = d instanceof Date ? d : new Date(d);
		return dt.toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	}

	/**
	 * Create or return an Inventory row for product+warehouse.
	 * If totalQty is provided, set it (in practice this should reflect InventoryLocation sums).
	 */
	async createInventory(dto: CreateInventoryDto, userId: string) {
		// Validate references
		const [warehouse, user, shipment] = await Promise.all([this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }), this.prisma.user.findUnique({ where: { id: userId } }), this.prisma.shipment.findUnique({ where: { orderId: dto.shipmentId } })]);

		if (!warehouse) throw new NotFoundException("Warehouse not found");
		if (!user) throw new NotFoundException("User not found");
		if (shipment) throw new BadRequestException("Shipment ID already exist");

		// Validate storage structure
		const [rack, bin] = await Promise.all([this.prisma.rack.findUnique({ where: { id: dto.rackId } }), this.prisma.bin.findUnique({ where: { id: dto.binId } })]);

		if (!rack) throw new NotFoundException("Rack not found");
		if (!bin) throw new NotFoundException("Bin not found");

		const normalizedOrigin = this.safeParseLocation(dto.origin);
		const normalizedDestination = this.safeParseLocation(dto.destination);

		// Check for existing inventory record in same slot
		const existingInventory = await this.prisma.inventory.findFirst({
			where: {
				shipmentId: dto.shipmentId,
				warehouseId: dto.warehouseId,
				rackId: dto.rackId,
				binId: dto.binId,
				zoneId: dto.zoneId,
			},
		});

		if (existingInventory) {
			// Update relevant fields if record exists
			const updatedInventory = await this.prisma.inventory.update({
				where: { id: existingInventory.id },
				data: {
					condition: dto.condition ?? existingInventory.condition,
					status: dto.status ?? existingInventory.status,
					specialHandling: dto.specialHandling ?? existingInventory.specialHandling,
					updatedAt: new Date(),
				},
			});

			// Increment bin qty since more stock is added
			await this.prisma.bin.update({
				where: { id: dto.binId },
				data: {
					currentQty: { increment: 1 },
				},
			});

			return updatedInventory;
		}

		// Create a new inventory record
		const newInventory = await this.prisma.inventory.create({
			data: {
				shipmentId: dto.shipmentId,
				warehouseId: dto.warehouseId,
				zoneId: dto.zoneId,
				rackId: dto.rackId,
				binId: dto.binId,
				condition: dto.condition,
				status: dto.status,
				specialHandling: dto.specialHandling,
				clientName: dto.clientName,
				userId: userId,
			},
		});

		const createdShipment = await this.prisma.shipment.create({
			data: {
				orderId: dto.shipmentId,
				clientName: dto.clientName as any,
				origin: normalizedOrigin,
				destination: normalizedDestination,
				pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : null,
				status: ShipmentStatus.PENDING as any,
				createdBy: userId,
				customerId: userId,
				deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,

				pickupMode: dto.pickupMode as any,
				serviceType: "",
				baseFrieght: 0.0,
				handlingFee: 0.0,
				insuranceFee: 0.0,
				totalCost: 0.0,
				cargoType: dto.cargoType as any,
				tons: 0.0,
				weight: 0.0,

				assignedWarehouseId: dto.warehouseId,
				assignedBinId: dto.binId,
				assignedRackId: dto.rackId,
				assignedZoneId: dto.zoneId,

				specialHandling: dto.specialHandling,
			},
		});

		await this.prisma.shipmentStatusHistory.create({
			data: {
				shipmentId: createdShipment.id,
				status: ShipmentStatus.PENDING as any,
				updatedBy: userId,
			},
		});

		const originObj = this.safeParseLocation(createdShipment.origin ?? dto.origin);
		const destinationObj = this.safeParseLocation(createdShipment.destination ?? dto.destination);

		const originText = this.formatLocationText(originObj);
		const destinationText = this.formatLocationText(destinationObj);

		if (user.email) {
			try {
				await this.mailer.sendShipmentCreated(user.email, {
					clientName: dto.clientName,
					trackingNumber: createdShipment.orderId,
					origin: originText,
					destination: destinationText,
					estimatedDelivery: this.prettyDate(createdShipment.deliveryDate ?? dto.deliveryDate),
					status: "Accepted",
					trackingUrl: `${this.urlService.normalizePrefix()}`,
				});
			} catch (err: any) {
				// Log and continue
				console.error("Failed to send shipment email:", err?.message || err);

				// Optionally: store failed email in DB for retry queue
				// await this.prisma.emailQueue.create({ data: { type: 'SHIPMENT_CREATED', payload: {...}, error: String(err) } });
			}
		}

		// Increment bin qty for new inventory
		await this.prisma.bin.update({
			where: { id: dto.binId },
			data: {
				currentQty: { increment: 1 },
			},
		});

		return newInventory;
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
	async listInventoryLocations(filter?: { clientId?: string; clientName?: string; shipmentId?: string; status?: string; binId?: string; warehouseId?: string; condition?: string; lotNumber?: string; isHazardous?: boolean; rackId?: string; zoneId?: string }) {
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
			include: { locations: true },
		});
	}

	// /**
	//  * NEW: Get inventory overview with real-time stock levels per warehouse
	//  * Requirement: "Allow users to view stock per warehouse and consolidate across all warehouses"
	//  */
	// async getInventoryOverview(warehouseId?: string) {
	// 	const where: any = {};
	// 	if (warehouseId) {
	// 		where.warehouseId = warehouseId;
	// 	}

	// 	const inventories = await this.prisma.inventory.findMany({
	// 		where,
	// 		include: {
	// 			shipment: true,
	// 			warehouse: true,
	// 			locations: {
	// 				include: {
	// 					bin: {
	// 						include: {
	// 							rack: {
	// 								include: {
	// 									zone: true,
	// 								},
	// 							},
	// 						},
	// 					},
	// 				},
	// 			},
	// 		},
	// 	});

	// 	return inventories.map((inv) => ({
	// 		productId: inv.shipmentId,
	// 		warehouseId: inv.warehouseId,
	// 		warehouseName: inv.warehouse.name,
	// 		availableQty: inv.locations.filter((loc) => loc.status === "AVAILABLE").reduce((sum, loc) => sum + loc.qty, 0),
	// 		reservedQty: inv.locations.filter((loc) => loc.status === "RESERVED").reduce((sum, loc) => sum + loc.qty, 0),
	// 		quarantineQty: inv.locations.filter((loc) => loc.status === "QUARANTINE").reduce((sum, loc) => sum + loc.qty, 0),
	// 		damagedQty: inv.locations.filter((loc) => loc.status === "DAMAGED").reduce((sum, loc) => sum + loc.qty, 0),
	// 		locationCount: inv.locations.length,
	// 		lastUpdated: inv.updatedAt,
	// 	}));
	// }

	// /**
	//  * NEW: Get inventory by rack location
	//  * Requirement: "track inventory levels at the rack level"
	//  */
	// async getInventoryByRack(rackId: string) {
	// 	const locations = await this.prisma.inventoryLocation.findMany({
	// 		where: {
	// 			bin: {
	// 				rackId: rackId,
	// 			},
	// 		},
	// 		include: {
	// 			bin: true,
	// 			inventory: {
	// 				include: {
	// 					shipment: true,
	// 				},
	// 			},
	// 			Company: true,
	// 		},
	// 		orderBy: {
	// 			createdAt: "desc",
	// 		},
	// 	});

	// 	return locations;
	// }

	/**
	 * NEW: Generate inventory status report
	 * Requirement: "Users should be able to generate reports showing inventory status for each rack and inventory per warehouse"
	 */
	// async generateInventoryReport(warehouseId?: string, rackId?: string) {
	// 	const where: any = {};

	// 	if (warehouseId) {
	// 		where.inventory = {
	// 			warehouseId: warehouseId,
	// 		};
	// 	}

	// 	if (rackId) {
	// 		where.bin = {
	// 			rackId: rackId,
	// 		};
	// 	}

	// 	const locations = await this.prisma.inventoryLocation.findMany({
	// 		where,
	// 		include: {
	// 			bin: {
	// 				include: {
	// 					rack: {
	// 						include: {
	// 							zone: true,
	// 						},
	// 					},
	// 				},
	// 			},
	// 			inventory: {
	// 				include: {
	// 					shipment: true,
	// 					warehouse: true,
	// 				},
	// 			},
	// 			Company: true,
	// 		},
	// 		orderBy: [{ inventory: { warehouse: { name: "asc" } } }, { bin: { rack: { zone: { name: "asc" } } } }, { bin: { rack: { name: "asc" } } }, { bin: { name: "asc" } }],
	// 	});

	// 	// Group by warehouse -> zone -> rack -> bin
	// 	const report = locations.reduce((acc, loc) => {
	// 		const warehouseName = loc.inventory.warehouse.name;
	// 		const zoneName = loc.bin.rack.zone.name;
	// 		const rackName = loc.bin.rack.name;
	// 		const binName = loc.bin.name;

	// 		if (!acc[warehouseName]) acc[warehouseName] = {};
	// 		if (!acc[warehouseName][zoneName]) acc[warehouseName][zoneName] = {};
	// 		if (!acc[warehouseName][zoneName][rackName]) acc[warehouseName][zoneName][rackName] = {};
	// 		if (!acc[warehouseName][zoneName][rackName][binName]) {
	// 			acc[warehouseName][zoneName][rackName][binName] = [];
	// 		}

	// 		acc[warehouseName][zoneName][rackName][binName].push({
	// 			qty: loc.qty,
	// 			status: loc.status,
	// 			condition: loc.condition,
	// 			clientName: loc.clientName,
	// 			lotNumber: loc.lotNumber,
	// 			expiryDate: loc.expiryDate,
	// 			specialHandling: loc.specialHandling,
	// 			arrivalDate: loc.createdAt,
	// 		});

	// 		return acc;
	// 	}, {} as any);

	// 	return report;
	// }

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
	async updateInventoryStatus(id: string, status: string, updatedBy?: string, note?: string) {
		const loc = await this.prisma.inventory.findUnique({
			where: { id },
		});

		if (!loc) throw new NotFoundException("Inventory not found");

		console.log(status);

		return this.prisma.inventory.update({
			where: { id },
			data: {
				status,
				updatedAt: new Date(),
			},
		});
	}

	/**
	 * Returns: Client Name, Shipment ID, Rack, Bin, Status, Condition, Special Handling, Arrival Date
	 */
	// async getInventoryByWarehouseFormatted(warehouseId: string) {
	// 	if (!warehouseId) {
	// 		throw new Error("warehouseId is required");
	// 	}

	// 	const inventories = await this.prisma.inventory.findMany({
	// 		where: { warehouseId },
	// 		orderBy: { createdAt: "desc" },
	// 		include: {
	// 			warehouse: true,
	// 		},
	// 	});

	// 	return await Promise.all(
	// 		inventories.map(async (inv) => {
	// 			// 🔹 Safe parse for specialHandling
	// 			let specialHandlingParsed: any = null;
	// 			if (inv.specialHandling) {
	// 				try {
	// 					specialHandlingParsed = typeof inv.specialHandling === "string" && inv.specialHandling.trim().startsWith("{") ? JSON.parse(inv.specialHandling) : inv.specialHandling;
	// 				} catch {
	// 					specialHandlingParsed = inv.specialHandling;
	// 				}
	// 			}

	// 			// 🔹 Fetch Rack and Bin names if IDs exist
	// 			let rackName = "N/A";
	// 			let binName = "N/A";

	// 			if (inv.rackId) {
	// 				const rack = await this.prisma.rack.findUnique({
	// 					where: { id: inv.rackId },
	// 					select: { name: true },
	// 				});
	// 				rackName = rack?.name || "N/A";
	// 			}

	// 			if (inv.binId) {
	// 				const bin = await this.prisma.bin.findUnique({
	// 					where: { id: inv.binId },
	// 					select: { name: true },
	// 				});
	// 				binName = bin?.name || "N/A";
	// 			}

	// 			return {
	// 				clientName: inv.clientName || "N/A",
	// 				shipmentId: inv.shipmentId || "N/A",
	// 				rack: rackName,
	// 				bin: binName,
	// 				status: inv.status || "N/A",
	// 				condition: inv.condition || "N/A",
	// 				specialHandling: specialHandlingParsed,
	// 				arrivalDate: inv.createdAt.toISOString().split("T")[0],
	// 			};
	// 		})
	// 	);
	// }

	async getInventoryByWarehouseFormatted(warehouseId: string, page = 1, limit = 10) {
		if (!warehouseId) {
			throw new Error("warehouseId is required");
		}

		const skip = (page - 1) * limit;

		// Count total inventories
		const total = await this.prisma.inventory.count({
			where: { warehouseId },
		});

		// Paginated fetch
		const inventories = await this.prisma.inventory.findMany({
			where: { warehouseId },
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: {
				warehouse: true,
			},
		});

		const formatted = await Promise.all(
			inventories.map(async (inv) => {
				// 🔹 Safe parse for specialHandling
				let specialHandlingParsed: any = null;
				if (inv.specialHandling) {
					try {
						specialHandlingParsed = typeof inv.specialHandling === "string" && inv.specialHandling.trim().startsWith("{") ? JSON.parse(inv.specialHandling) : inv.specialHandling;
					} catch {
						specialHandlingParsed = inv.specialHandling;
					}
				}

				// 🔹 Fetch Rack & Bin names
				const rack = inv.rackId
					? await this.prisma.rack.findUnique({
							where: { id: inv.rackId },
							select: { name: true },
					  })
					: null;

				const bin = inv.binId
					? await this.prisma.bin.findUnique({
							where: { id: inv.binId },
							select: { name: true },
					  })
					: null;

				return {
					inventoryId: inv.id,
					clientName: inv.clientName || "N/A",
					shipmentId: inv.shipmentId || "N/A",
					rack: rack?.name || "N/A",
					bin: bin?.name || "N/A",
					status: inv.status || "N/A",
					condition: inv.condition || "N/A",
					specialHandling: specialHandlingParsed,
					arrivalDate: inv.createdAt.toISOString().split("T")[0],
				};
			})
		);

		return {
			data: formatted,
			meta: {
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Helper method to format special handling information
	 */
	private formatSpecialHandling(specialHandling: any, isHazardous: boolean, tempMin: number | null, tempMax: number | null): string {
		const handlers: string[] = [];

		if (isHazardous) handlers.push("Hazardous");
		if (tempMin !== null || tempMax !== null) handlers.push("Temperature");
		if (specialHandling?.isFragile) handlers.push("Fragile");
		if (specialHandling?.requiresRefrigeration) handlers.push("Refrigeration");

		return handlers.length > 0 ? handlers.join(", ") : "None";
	}
}
