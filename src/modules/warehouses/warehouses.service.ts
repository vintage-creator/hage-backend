// src/modules/warehouses/warehouses.service.ts
import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { CreateZoneDto } from "./dto/create-zone.dto";
import { CreateRackDto } from "./dto/create-rack.dto";
import { CreateBinDto } from "./dto/create-bin.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";

@Injectable()
export class WarehousesService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Auto-generate warehouse structure (Zones, Racks, Bins) based on provided counts
	 */
	private async generateWarehouseStructure(warehouseId: string, warehouse: any, numZones: number, numRows: number, numRacks: number, numBinsPerRack: number) {
		const standardZoneTypes = ["Zone A", "Zone B", "Zone C", "Zone D", "Zone E", "Zone F"];
		const zones: any[] = [];

		const capacityPerZone = Math.floor(warehouse.totalCapacity / numZones);

		// === Generate Zones ===
		for (let i = 0; i < numZones; i++) {
			const zoneName = standardZoneTypes[i] || `Zone ${String.fromCharCode(65 + i)}`;
			const isLastZone = i === numZones - 1;
			const isQuarantineZone = isLastZone && warehouse.allowsQuarantine;

			const zone = await this.prisma.zone.create({
				data: {
					warehouseId,
					name: zoneName,
					tempMin: warehouse.allowsTemperature ? 2.0 : null,
					tempMax: warehouse.allowsTemperature ? 8.0 : null,
					allowsHazardous: warehouse.allowsHazardous || false,
					isQuarantineZone,
					capacity: capacityPerZone,
				},
			});

			zones.push(zone);
		}

		// === Virtual Rows ===
		const racksPerZone = Math.ceil(numRacks / numZones);
		const racksPerRow = Math.ceil(racksPerZone / numRows);

		let globalRackCounter = 1;

		for (const zone of zones) {
			const capacityPerRack = Math.floor(zone.capacity / racksPerZone);
			const zoneLetter = zone.name.replace("Zone ", ""); // e.g. "Zone A" → "A"

			let rackCounterForZone = 1; // reset for each zone

			for (let rowIndex = 1; rowIndex <= numRows; rowIndex++) {
				for (let r = 0; r < racksPerRow && rackCounterForZone <= racksPerZone; r++) {
					const rackName = `Rack ${zoneLetter}${rackCounterForZone}`; // e.g. Rack A1, Rack A2, etc.

					const rack = await this.prisma.rack.create({
						data: {
							zoneId: zone.id,
							name: rackName,
							capacity: capacityPerRack,
						},
					});

					// Generate bins under each rack
					const capacityPerBin = Math.floor(rack.capacity! / numBinsPerRack);

					for (let b = 1; b <= numBinsPerRack; b++) {
						const binName = `Bin ${String(b).padStart(3, "0")}`;

						const locationCode = `${zoneLetter}-R${rowIndex}-${rackName.replace("Rack ", "R")}-B${String(b).padStart(3, "0")}`; // e.g. A-R1-RA1-B001

						await this.prisma.bin.create({
							data: {
								rackId: rack.id,
								name: binName,
								capacity: capacityPerBin,
								tempMin: zone.tempMin,
								tempMax: zone.tempMax,
								allowsHazardous: zone.allowsHazardous,
								isQuarantine: zone.isQuarantineZone,
							},
						});
					}

					rackCounterForZone++;
					globalRackCounter++;
				}
			}
		}

		return {
			zonesCreated: zones.length,
			racksCreated: numRacks,
			binsCreated: numRacks * numBinsPerRack,
		};
	}

	async createWarehouse(dto: CreateWarehouseDto, authUserId?: string) {
		let companyIdToUse = dto.companyId ?? null;

		if (!companyIdToUse) {
			if (!authUserId) {
				throw new BadRequestException("companyId missing and no authenticated user provided");
			}
			const user = await this.prisma.user.findUnique({
				where: { id: authUserId },
			});
			if (!user) throw new UnauthorizedException("Authenticated user not found");
			if (!user.companyId) {
				throw new BadRequestException("Authenticated user is not linked to a company; companyId required");
			}
			companyIdToUse = user.companyId;
		}

		const company = await this.prisma.company.findUnique({
			where: { id: companyIdToUse },
		});
		if (!company) {
			throw new NotFoundException(`Company with id "${companyIdToUse}" not found`);
		}

		if (authUserId) {
			const authUser = await this.prisma.user.findUnique({
				where: { id: authUserId },
			});
			if (!authUser) throw new UnauthorizedException("Authenticated user not found");
			if (authUser.companyId && authUser.companyId !== companyIdToUse) {
				throw new UnauthorizedException("User not authorized to create a warehouse for this company");
			}
		}

		const exists = await this.prisma.warehouse.findFirst({
			where: { companyId: companyIdToUse, name: dto.name },
		});
		if (exists) throw new BadRequestException("Warehouse with this name already exists for the company");

		const data: any = {
			companyId: companyIdToUse,
			name: dto.name,
			country: dto.country,
			city: dto.city,
			address: dto.address,
			totalCapacity: dto.totalCapacity,
			capacityUnit: dto.capacityUnit ?? "sq ft",
			allowsTemperature: dto.allowsTemperature ?? false,
			allowsHazardous: dto.allowsHazardous ?? false,
			allowsQuarantine: dto.allowsQuarantine ?? false,
      allowsNone: dto.allowsNone ?? false,
		};

		if (dto.numZones !== undefined) data.numZones = dto.numZones;
		if (dto.numRows !== undefined) data.numRows = dto.numRows;
		if (dto.numRacks !== undefined) data.numRacks = dto.numRacks;
		if (dto.numBinsPerRack !== undefined) data.numBinsPerRack = dto.numBinsPerRack;

		const warehouse = await this.prisma.warehouse.create({ data });

		// Auto-generate structure if zones, racks, and bins are specified
		let structureGenerated = null;
		if (dto.numZones && dto.numRacks && dto.numBinsPerRack && dto.numZones > 0 && dto.numRacks > 0 && dto.numBinsPerRack > 0) {
			try {
				structureGenerated = await this.generateWarehouseStructure(warehouse.id, warehouse, dto.numZones, dto.numRows!, dto.numRacks, dto.numBinsPerRack);
			} catch (error) {
				// If structure generation fails, log error but don't fail warehouse creation
				console.error("Failed to generate warehouse structure:", error);
			}
		}

		return {
			ok: true,
			message: structureGenerated ? "Warehouse created successfully with structure generated" : "Warehouse created successfully",
			warehouse,
			structure: structureGenerated,
		};
	}

	private async computeUsageForWarehouse(warehouseId: string) {
		const agg = await this.prisma.bin.aggregate({
			_sum: {
				currentQty: true,
				reservedQty: true,
			},
			where: {
				rack: {
					zone: {
						warehouseId: warehouseId,
					},
				},
			},
		});

		const used = Number(agg._sum.currentQty ?? 0);
		const reserved = Number(agg._sum.reservedQty ?? 0);
		const usedPlusReserved = used + reserved;

		return { used, reserved, usedPlusReserved };
	}

	async listWarehouses(companyId?: string, page = 1, perPage = 20) {
		const where = companyId ? { companyId } : {};

		// total count
		const total = await this.prisma.warehouse.count({ where });

		// fetch only current page
		const warehouses = await this.prisma.warehouse.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * perPage,
			take: perPage,
		});

		// compute usage for each warehouse (paginated)
		const items = await Promise.all(
			warehouses.map(async (w) => {
				const { used, reserved, usedPlusReserved } = await this.computeUsageForWarehouse(w.id);

				const computedStatus = usedPlusReserved >= w.totalCapacity ? "INACTIVE" : w.status;
				const available = Math.max(0, w.totalCapacity - usedPlusReserved);

				return {
					...w,
					usedCapacity: used,
					reservedCapacity: reserved,
					usedPlusReserved,
					availableCapacity: available,
					computedStatus,
				};
			})
		);

		return {
			items,
			meta: {
				page,
				perPage,
				total,
				totalPages: Math.ceil(total / perPage),
			},
		};
	}

	async getWarehouse(id: string) {
		const wh = await this.prisma.warehouse.findUnique({
			where: { id },
			include: {
				zones: {
					include: {
						racks: {
							include: {
								bins: true,
							},
						},
					},
				},
			},
		});
		if (!wh) throw new NotFoundException("Warehouse not found");

		const { used, reserved, usedPlusReserved } = await this.computeUsageForWarehouse(id);
		const computedStatus = usedPlusReserved >= wh.totalCapacity ? "INACTIVE" : wh.status;
		const available = Math.max(0, wh.totalCapacity - usedPlusReserved);

		return {
			...wh,
			usedCapacity: used,
			reservedCapacity: reserved,
			usedPlusReserved,
			availableCapacity: available,
			computedStatus,
		};
	}

	async updateWarehouse(id: string, dto: UpdateWarehouseDto) {
		const wh = await this.prisma.warehouse.findUnique({ where: { id } });
		if (!wh) throw new NotFoundException("Warehouse not found");

		const data: any = {
			name: dto.name ?? undefined,
			country: dto.country ?? undefined,
			city: dto.city ?? undefined,
			address: dto.address ?? undefined,
			totalCapacity: dto.totalCapacity ?? undefined,
			capacityUnit: dto.capacityUnit ?? undefined,
			status: dto.status ?? undefined,
			numZones: dto.numZones ?? undefined,
			numRows: dto.numRows ?? undefined,
			numRacks: dto.numRacks ?? undefined,
			numBinsPerRack: dto.numBinsPerRack ?? undefined,
			allowsTemperature: dto.allowsTemperature ?? undefined,
			allowsHazardous: dto.allowsHazardous ?? undefined,
			allowsQuarantine: dto.allowsQuarantine ?? undefined,
      allowsNone: dto.allowsNone ?? undefined,
		};

		Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

		return this.prisma.warehouse.update({ where: { id }, data });
	}

	async deleteWarehouse(id: string) {
		const zoneCount = await this.prisma.zone.count({
			where: { warehouseId: id },
		});
		const inventoryCount = await this.prisma.inventory.count({
			where: { warehouseId: id },
		});

		if (zoneCount > 0 || inventoryCount > 0) {
			throw new BadRequestException("Cannot delete warehouse that still has zones or inventory. Please remove zones/inventory first.");
		}

		await this.prisma.warehouse.delete({ where: { id } });
		return { ok: true };
	}

	async createZone(warehouseId: string, dto: CreateZoneDto) {
		const wh = await this.prisma.warehouse.findUnique({
			where: { id: warehouseId },
		});
		if (!wh) throw new NotFoundException("Warehouse not found");

		const exists = await this.prisma.zone.findFirst({
			where: { warehouseId, name: dto.name },
		});
		if (exists) throw new BadRequestException("Zone name must be unique within warehouse");

		return this.prisma.zone.create({
			data: {
				warehouseId,
				name: dto.name,
				tempMin: dto.tempMin ?? null,
				tempMax: dto.tempMax ?? null,
				allowsHazardous: dto.allowsHazardous ?? false,
				isQuarantineZone: dto.isQuarantineZone ?? false,
				capacity: dto.capacity ?? null,
			},
		});
	}

	async createRack(zoneId: string, dto: CreateRackDto) {
		const z = await this.prisma.zone.findUnique({ where: { id: zoneId } });
		if (!z) throw new NotFoundException("Zone not found");

		const exists = await this.prisma.rack.findFirst({
			where: { zoneId, name: dto.name },
		});
		if (exists) throw new BadRequestException("Rack name must be unique within zone");

		return this.prisma.rack.create({
			data: {
				zoneId,
				name: dto.name,
				capacity: dto.capacity ?? null,
			},
		});
	}

	async createBin(rackId: string, dto: CreateBinDto) {
		const r = await this.prisma.rack.findUnique({ where: { id: rackId } });
		if (!r) throw new NotFoundException("Rack not found");

		const exists = await this.prisma.bin.findFirst({
			where: { rackId, name: dto.name },
		});
		if (exists) throw new BadRequestException("Bin name must be unique within rack");

		return this.prisma.bin.create({
			data: {
				rackId,
				name: dto.name,
				capacity: dto.capacity,
				tempMin: dto.tempMin ?? null,
				tempMax: dto.tempMax ?? null,
				allowsHazardous: dto.allowsHazardous ?? false,
				isQuarantine: dto.isQuarantine ?? false,
			},
		});
	}

	async getBinAvailability(binId: string) {
		const bin = await this.prisma.bin.findUnique({ where: { id: binId } });
		if (!bin) throw new NotFoundException("Bin not found");
		const available = bin.capacity - (bin.currentQty + bin.reservedQty);
		return {
			binId: bin.id,
			capacity: bin.capacity,
			currentQty: bin.currentQty,
			reservedQty: bin.reservedQty,
			available,
			tempMin: bin.tempMin,
			tempMax: bin.tempMax,
			allowsHazardous: bin.allowsHazardous,
			isQuarantine: bin.isQuarantine,
		};
	}

	async getWarehouseCapacity(warehouseId: string) {
		const wh = await this.prisma.warehouse.findUnique({
			where: { id: warehouseId },
		});
		if (!wh) throw new NotFoundException("Warehouse not found");

		const { used, reserved, usedPlusReserved } = await this.computeUsageForWarehouse(warehouseId);
		const available = Math.max(0, wh.totalCapacity - usedPlusReserved);
		const computedStatus = usedPlusReserved >= wh.totalCapacity ? "INACTIVE" : wh.status;

		return {
			warehouseId,
			totalCapacity: wh.totalCapacity,
			capacityUnit: wh.capacityUnit,
			used,
			reserved,
			usedPlusReserved,
			available,
			computedStatus,
		};
	}

	/**
	 * Get intelligent location suggestion for inventory placement
	 */
	async suggestLocation(
		warehouseId: string,
		options: {
			requiredCapacity?: number;
			requiresTemperature?: boolean;
			isHazardous?: boolean;
			needsQuarantine?: boolean;
			tempMin?: number;
			tempMax?: number;
		} = {}
	) {
		const warehouse = await this.prisma.warehouse.findUnique({
			where: { id: warehouseId },
		});

		if (!warehouse) throw new NotFoundException("Warehouse not found");

		// Base query filter
		const binConditions: any = {
			rack: {
				zone: { warehouseId },
			},
		};

		// Apply conditions
		if (options.requiresTemperature) {
			binConditions.tempMin = { not: null };
			binConditions.tempMax = { not: null };
			if (options.tempMin !== undefined && options.tempMax !== undefined) {
				binConditions.tempMin = { lte: options.tempMin };
				binConditions.tempMax = { gte: options.tempMax };
			}
		}
		if (options.isHazardous) binConditions.allowsHazardous = true;
		if (options.needsQuarantine) binConditions.isQuarantine = true;

		// Fetch bins (including nested relations)
		const availableBins = await this.prisma.bin.findMany({
			where: binConditions,
			include: {
				rack: {
					include: {
						zone: true,
					},
				},
			},
		});

		// Filter bins by capacity
		const suitableBins = availableBins.filter((bin) => {
			const availableCapacity = bin.capacity - bin.currentQty - bin.reservedQty;
			return availableCapacity >= (options.requiredCapacity || 0);
		});

		if (suitableBins.length === 0) {
			return {
				success: false,
				message: "No suitable location found",
				suggested: null,
				categorized: [],
			};
		}

		// Build hierarchical structure: Zones → Racks → Bins
		const categorized: any[] = [];

		for (const bin of suitableBins) {
			const zone = bin.rack.zone;
			const rack = bin.rack;
			const availableCapacity = bin.capacity - bin.currentQty - bin.reservedQty;

			// Find or create zone
			let zoneEntry = categorized.find((z) => z.id === zone.id);
			if (!zoneEntry) {
				zoneEntry = { id: zone.id, name: zone.name, racks: [] };
				categorized.push(zoneEntry);
			}

			// Find or create rack within that zone
			let rackEntry = zoneEntry.racks.find((r: any) => r.id === rack.id);
			if (!rackEntry) {
				rackEntry = { id: rack.id, name: rack.name, bins: [] };
				zoneEntry.racks.push(rackEntry);
			}

			// Add bin under that rack
			rackEntry.bins.push({
				id: bin.id,
				name: bin.name,
				availableCapacity,
				totalCapacity: bin.capacity,
				currentQty: bin.currentQty,
				allowsHazardous: bin.allowsHazardous,
				isQuarantine: bin.isQuarantine,
				temperatureControlled: bin.tempMin !== null,
				temperatureRange: bin.tempMin ? `${bin.tempMin}°C - ${bin.tempMax}°C` : null,
			});
		}

		// Pick one best bin (e.g., most available capacity)
		const allBins = categorized.flatMap((z) => z.racks.flatMap((r: any) => r.bins.map((b: any) => ({ ...b, rackId: r.id, zoneId: z.id }))));

		const bestBin = allBins.sort((a, b) => b.availableCapacity - a.availableCapacity)[0];
		const bestZone = categorized.find((z) => z.id === bestBin.zoneId);
		const bestRack = bestZone?.racks.find((r: any) => r.id === bestBin.rackId);

		return {
			success: true,
			message: "Suitable locations found",
			suggested: {
				zone: { id: bestZone.id, name: bestZone.name },
				rack: { id: bestRack.id, name: bestRack.name },
				bin: bestBin,
			},
			categorized, // hierarchical structure for selection
		};
	}

	async getRacksForWarehouse(warehouseId: string, query: { search?: string; page?: number; perPage?: number } = {}) {
		const { search, page = 1, perPage = 20 } = query;

		// Validate warehouse exists
		const warehouse = await this.prisma.warehouse.findUnique({
			where: { id: warehouseId },
			select: { id: true, name: true, country: true, city: true, address: true },
		});
		if (!warehouse) throw new NotFoundException("Warehouse not found");

		// Filter by search term (rack name or location)
		const where: any = {
			zone: { warehouseId },
		};
		if (search) {
			where.OR = [{ name: { contains: search, mode: "insensitive" } }, { zone: { name: { contains: search, mode: "insensitive" } } }];
		}

		// Count total racks
		const total = await this.prisma.rack.count({ where });

		// Fetch paginated racks with their zone and bins
		const racks = await this.prisma.rack.findMany({
			where,
			include: {
				zone: { select: { name: true } },
				bins: { select: { currentQty: true } },
			},
			orderBy: { name: "asc" },
			skip: (page - 1) * perPage,
			take: perPage,
		});

		// Format each rack card
		const items = racks.map((rack) => {
			const totalStock = rack.bins.reduce((sum, b) => sum + (b.currentQty || 0), 0);
			const capacity = rack.capacity ?? 0;

			return {
				id: rack.id,
				name: rack.name, // e.g. Rack A4
				zone: rack.zone?.name ?? "N/A",
				capacity,
				currentStock: totalStock,
				location: `${warehouse.city}, ${warehouse.country}`,
			};
		});

		return {
			ok: true,
			warehouse: {
				id: warehouse.id,
				name: warehouse.name,
				location: `${warehouse.city}, ${warehouse.country}`,
			},
			items,
			meta: {
				page,
				perPage,
				total,
				totalPages: Math.ceil(total / perPage),
			},
		};
	}
}
