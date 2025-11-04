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
	private async generateWarehouseStructure(warehouseId: string, warehouse: any, numZones: number, numRacks: number, numBinsPerRack: number) {
		// Standard zone types based on requirements
		const standardZoneTypes = ["Receiving", "Storage", "Picking", "Packing", "Dispatch"];

		const zones: any[] = [];

		// Calculate capacity distribution
		const capacityPerZone = Math.floor(warehouse.totalCapacity / numZones);

		// Generate zones
		for (let i = 0; i < numZones; i++) {
			let zoneName: string;

			// Use standard zone types first, then alphabetic naming
			if (i < standardZoneTypes.length) {
				zoneName = standardZoneTypes[i];
			} else {
				// Use alphabetic naming: Zone A, Zone B, Zone C, etc.
				zoneName = `Zone ${String.fromCharCode(65 + (i - standardZoneTypes.length))}`;
			}

			// Determine if this is a special zone
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

		// Distribute racks evenly across zones
		const racksPerZone = Math.ceil(numRacks / numZones);
		let globalRackCounter = 1;

		for (const zone of zones) {
			const racksForThisZone = Math.min(racksPerZone, numRacks - (globalRackCounter - 1));

			const capacityPerRack = zone.capacity ? Math.floor(zone.capacity / racksForThisZone) : null;

			// Generate racks for this zone
			for (let r = 0; r < racksForThisZone; r++) {
				const rackName = `Rack ${globalRackCounter}`;
				globalRackCounter++;

				const rack = await this.prisma.rack.create({
					data: {
						zoneId: zone.id,
						name: rackName,
						capacity: capacityPerRack,
					},
				});

				// Generate bins for this rack
				const capacityPerBin = rack.capacity ? Math.floor(rack.capacity / numBinsPerRack) : Math.floor(warehouse.totalCapacity / (numRacks * numBinsPerRack));

				for (let b = 1; b <= numBinsPerRack; b++) {
					const binName = `Bin ${b}`;

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
				structureGenerated = await this.generateWarehouseStructure(warehouse.id, warehouse, dto.numZones, dto.numRacks, dto.numBinsPerRack);
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

		if (!warehouse) {
			throw new NotFoundException("Warehouse not found");
		}

		// Build query conditions
		const binConditions: any = {
			rack: {
				zone: {
					warehouseId,
				},
			},
		};

		// Filter by special requirements
		if (options.requiresTemperature) {
			binConditions.tempMin = { not: null };
			binConditions.tempMax = { not: null };

			if (options.tempMin !== undefined && options.tempMax !== undefined) {
				binConditions.tempMin = { lte: options.tempMin };
				binConditions.tempMax = { gte: options.tempMax };
			}
		}

		if (options.isHazardous) {
			binConditions.allowsHazardous = true;
		}

		if (options.needsQuarantine) {
			binConditions.isQuarantine = true;
		}

		// Find available bins
		const availableBins = await this.prisma.bin.findMany({
			where: binConditions,
			include: {
				rack: {
					include: {
						zone: true,
					},
				},
			},
			orderBy: [
				{ currentQty: "asc" }, // Prefer bins with more available space
				{ name: "asc" },
			],
		});

		// Filter bins by available capacity
		const suitableBins = availableBins.filter((bin) => {
			const availableCapacity = bin.capacity - bin.currentQty - bin.reservedQty;
			return availableCapacity >= (options.requiredCapacity || 0);
		});

		if (suitableBins.length === 0) {
			return {
				success: false,
				message: "No suitable location found",
				suggestion: null,
			};
		}

		// Get the best suggestion
		const bestBin = suitableBins[0];
		const availableCapacity = bestBin.capacity - bestBin.currentQty - bestBin.reservedQty;

		return {
			success: true,
			message: "Location suggestion found",
			suggestion: {
				zone: bestBin.rack.zone.name,
				zoneId: bestBin.rack.zone.id,
				rack: bestBin.rack.name,
				rackId: bestBin.rack.id,
				bin: bestBin.name,
				binId: bestBin.id,
				availableCapacity,
				totalCapacity: bestBin.capacity,
				currentQty: bestBin.currentQty,
				attributes: {
					temperatureControlled: bestBin.tempMin !== null,
					temperatureRange: bestBin.tempMin ? `${bestBin.tempMin}°C - ${bestBin.tempMax}°C` : null,
					allowsHazardous: bestBin.allowsHazardous,
					isQuarantine: bestBin.isQuarantine,
				},
			},
			alternativeSuggestions: suitableBins.slice(1, 4).map((bin) => ({
				zone: bin.rack.zone.name,
				rack: bin.rack.name,
				bin: bin.name,
				availableCapacity: bin.capacity - bin.currentQty - bin.reservedQty,
			})),
		};
	}
}
