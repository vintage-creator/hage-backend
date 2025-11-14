// src/modules/shipments/shipments.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger, Inject, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { UpdateShipmentDto } from "./dto/update-shipment.dto";
import { UpdateStatusDto, ShipmentStatus } from "./dto/update-status.dto";
import { AssignShipmentDto } from "./dto/assign-shipment.dto";
import { FilterShipmentDto } from "./dto/filter-shipment.dto";
import type { Shipment } from "@prisma/client";
import type { StorageService } from "../../common/storage/storage.interface";
import { MailService } from "../../common/mail/mail.service";
import { ConfigService } from "@nestjs/config";
import { AnalyticsResponseDto } from "./dto/analytics-shipment.dto";
import UrlService from "../auth/url.service";

enum DocumentType {
	COMMERCIAL_INVOICE = "COMMERCIAL_INVOICE",
	PACKING_LIST = "PACKING_LIST",
	WAYBILL = "WAYBILL",
	BILL_OF_LADING = "BILL_OF_LADING",
	OTHER = "OTHER",
}

@Injectable()
export class ShipmentsService {
	private readonly logger = new Logger(ShipmentsService.name);

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

	constructor(private readonly prisma: PrismaService, @Inject("StorageService") private readonly storage: StorageService, private readonly mailer: MailService, private readonly cfg: ConfigService, private readonly urlService: UrlService) {}

	// CREATE SHIPMENT (Step 1: Order Creation)
	async create(dto: any, lspUserId: string, files?: Express.Multer.File[]): Promise<Shipment> {
		try {
			const requiredFields = ["clientName", "cargoType", "weight", "origin", "destination", "pickupMode", "serviceType", "baseFrieght", "handlingFee"];

			for (const field of requiredFields) {
				if (dto[field] === undefined || dto[field] === null || dto[field] === "" || (typeof dto[field] === "object" && Object.keys(dto[field]).length === 0)) {
					throw new BadRequestException(`${field} is required`);
				}
			}

			const uploadPromises = files?.map((file) => this.storage.uploadFile(file, { folder: "shipment-documents" })) ?? [];
			const uploadedDocs = await Promise.all(uploadPromises);

			const sanitizeNumber = (num?: any) => (isNaN(Number(num)) ? 0 : Number(num));

			const normalizedOrigin = this.safeParseLocation(dto.origin);
			const normalizedDestination = this.safeParseLocation(dto.destination);

			// Create shipment + documents in transaction
			const shipment = await this.prisma.$transaction(async (tx) => {
				const createdShipment = await tx.shipment.create({
					data: {
						orderId: dto.orderId ?? this.generateOrderTrackingId(),
						clientName: dto.clientName,
						email: dto.email,
						phone: dto.phone,
						cargoType: dto.cargoType,
						tons: sanitizeNumber(dto.tons),
						weight: sanitizeNumber(dto.weight),
						handlingInstructions: dto.handlingInstructions,
						origin: normalizedOrigin,
						destination: normalizedDestination,
						pickupMode: dto.pickupMode,
						pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : null,
						deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
						serviceType: dto.serviceType,
						baseFrieght: sanitizeNumber(dto.baseFrieght),
						handlingFee: sanitizeNumber(dto.handlingFee),
						insuranceFee: sanitizeNumber(dto.insuranceFee),
						totalCost: sanitizeNumber(dto.baseFrieght) + sanitizeNumber(dto.handlingFee) + sanitizeNumber(dto.insuranceFee),
						status: "PENDING_ACCEPTANCE",
						createdBy: lspUserId,
						customerId: lspUserId,
					},
				});

				await tx.shipmentStatusHistory.create({
					data: {
						shipmentId: createdShipment.id,
						status: ShipmentStatus.PENDING_ACCEPTANCE as any,
						updatedBy: lspUserId,
					},
				});

				if (uploadedDocs.length > 0) {
					await tx.shipmentDocument.createMany({
						data: uploadedDocs.map((doc, index) => ({
							shipmentId: createdShipment.id,
							docType: this.detectDocumentType(files?.[index]?.originalname) as any,
							url: doc.url,
							fileName: doc.name as any,
						})),
					});
				}

				return createdShipment;
			});

			const originObj = this.safeParseLocation(shipment.origin ?? dto.origin);
			const destinationObj = this.safeParseLocation(shipment.destination ?? dto.destination);

			const originText = this.formatLocationText(originObj);
			const destinationText = this.formatLocationText(destinationObj);

			if (dto.email) {
				await this.mailer.sendShipmentCreated(dto.email, {
					clientName: dto.clientName,
					trackingNumber: shipment.orderId,
					origin: originText,
					destination: destinationText,
					estimatedDelivery: this.prettyDate(shipment.deliveryDate ?? dto.deliveryDate),
					status: "Pending Acceptance",
					trackingUrl: `${this.urlService.normalizePrefix()}`,
				});
			}

			await this.createNotification(lspUserId, `New shipment ${shipment.orderId} created successfully`, "in-app");

			return shipment;
		} catch (err: any) {
			this.logger.error("Shipment creation failed", err);
			if (err.code === "P2002" && err.meta?.target?.includes("orderId")) {
				throw new BadRequestException(`A shipment with orderId '${dto.orderId}' already exists. Please use a different orderId.`);
			}
			throw new BadRequestException(err.message || "Shipment creation failed");
		}
	}

	// ACCEPT & ASSIGN SHIPMENT (Step 2)
	async acceptAndAssign(shipmentId: string, dto: AssignShipmentDto, lspUserId: string): Promise<Shipment> {
		// 1. Verify LSP
		const user = await this.prisma.user.findUnique({ where: { id: lspUserId } });
		if (!user) throw new NotFoundException("User not found");
		if (user.kind !== "LOGISTIC_SERVICE_PROVIDER" && user.role !== "CROSS_BORDER_LOGISTICS") {
			throw new ForbiddenException("Only LSP can accept and assign orders");
		}

		// 2. Find shipment
		const shipment = await this.prisma.shipment.findUnique({
			where: { id: shipmentId },
		});
		if (!shipment) throw new NotFoundException("Shipment not found");
		if (shipment.status !== (ShipmentStatus.PENDING_ACCEPTANCE as any)) {
			throw new BadRequestException("Shipment already accepted or not pending");
		}

		// 3. Validate transporter
		if (dto.transporterId) {
			const transporter = await this.prisma.user.findUnique({
				where: { id: dto.transporterId },
			});
			if (!transporter) throw new NotFoundException("Transporter not found");
			if (transporter.role !== "TRANSPORTER") throw new BadRequestException("Invalid transporter");
		}

		// 4. Validate warehouse
		let warehouse = null;
		if (dto.warehouseId) {
			warehouse = await this.prisma.warehouse.findUnique({
				where: { id: dto.warehouseId },
			});
			if (!warehouse) throw new BadRequestException("Invalid warehouse");
		}

		// 5. Validate and attach zone/rack/bin selection if provided
		let assignedLocation = null;
		if (dto.zoneId && dto.rackId && dto.binId) {
			const bin = await this.prisma.bin.findUnique({
				where: { id: dto.binId },
				include: {
					rack: {
						include: { zone: true },
					},
				},
			});

			if (!bin || bin.rack.zone.id !== dto.zoneId || bin.rack.id !== dto.rackId) {
				throw new BadRequestException("Invalid or mismatched location details");
			}

			assignedLocation = {
				zoneId: dto.zoneId,
				rackId: dto.rackId,
				binId: dto.binId,
			};
		}

		const bin = await this.prisma.bin.findUnique({ where: { id: dto.binId } });
		if (!bin) throw new NotFoundException("Bin not found");

		if (bin.currentQty >= bin.capacity) {
			throw new BadRequestException("Bin capacity is already full");
		}

		// 6. Perform transaction
		const updated = await this.prisma.$transaction(async (tx) => {
			// Update shipment
			const updatedShipment = await tx.shipment.update({
				where: { id: shipmentId },
				data: {
					status: ShipmentStatus.ACCEPTED as any,
					assignedTransporterId: dto.transporterId,
					assignedWarehouseId: dto.warehouseId,
					assignedZoneId: assignedLocation?.zoneId || null,
					assignedRackId: assignedLocation?.rackId || null,
					assignedBinId: assignedLocation?.binId || null,
					specialHandling: dto.special_handling,
					itemCompactibility: dto.itemCompactibility,
				},
				include: { transporter: true, warehouse: true, zone: true, rack: true, bin: true },
			});

			// Log status history
			await tx.shipmentStatusHistory.create({
				data: {
					shipmentId,
					status: ShipmentStatus.ACCEPTED as any,
					updatedBy: lspUserId,
				},
			});

			// Increment bin occupancy by 1 since a shipment is assigned
			if (assignedLocation) {
				await tx.bin.update({
					where: { id: assignedLocation.binId },
					data: {
						currentQty: {
							increment: 1,
						},
					},
				});
			}

			return updatedShipment;
		});

		// 7. Notifications
		await Promise.all([this.createNotification(lspUserId, `You accepted shipment ${updated.orderId}`, "in-app"), this.createNotification(updated.customerId, `Shipment ${updated.orderId} has been accepted`, "in-app"), dto.transporterId ? this.createNotification(dto.transporterId, `You have been assigned to shipment ${updated.orderId}`, "in-app") : Promise.resolve(), dto.warehouseId ? this.createNotification(dto.warehouseId, `Shipment ${updated.orderId} assigned to your warehouse`, "in-app") : Promise.resolve()]);

		// 8. Send email to client
		if (updated.email) {
			const originObj = this.safeParseLocation(updated.origin ?? shipment.origin);
			const destinationObj = this.safeParseLocation(updated.destination ?? shipment.destination);
			const originText = this.formatLocationText(originObj);
			const destinationText = this.formatLocationText(destinationObj);

			await this.mailer.sendShipmentStatusUpdate(updated.email, {
				clientName: updated.clientName,
				trackingNumber: updated.orderId,
				status: "Accepted",
				origin: originText,
				destination: destinationText,
				estimatedDelivery: this.prettyDate(updated.deliveryDate),
				trackingUrl: `${this.cfg.get("APP_URL")}/shipments/track/${updated.orderId}`,
			});
		}

		return updated;
	}

	// UPDATE STATUS (Step 3)
	async updateStatus(shipmentId: string, dto: UpdateStatusDto, updatedBy: string): Promise<Shipment> {
		const shipment = await this.prisma.shipment.findUnique({
			where: { id: shipmentId },
			include: { transporter: true },
		});

		if (!shipment) throw new NotFoundException("Shipment not found");

		const user = await this.prisma.user.findUnique({
			where: { id: updatedBy },
		});
		if (!user) throw new NotFoundException("User not found");

		// PERMISSION CHECK (unchanged)
		if (dto.status === ShipmentStatus.ACCEPTED) {
			if (user.kind !== "LOGISTIC_SERVICE_PROVIDER") throw new ForbiddenException("Only LSP can accept orders");
		} else if (dto.status === ShipmentStatus.PICKED_UP) {
			if (shipment.assignedTransporterId !== updatedBy) throw new ForbiddenException("Only assigned transporter can update to picked up");
		} else if (dto.status === ShipmentStatus.CANCELLED) {
			if (user.kind !== "LOGISTIC_SERVICE_PROVIDER" || shipment.createdBy == user.id) {
				throw new ForbiddenException("Only LSP and order creator can cancel orders");
			}
		} else if ([ShipmentStatus.EN_ROUTE_TO_PICKUP, ShipmentStatus.IN_TRANSIT].includes(dto.status)) {
			if (user.kind !== "LOGISTIC_SERVICE_PROVIDER" && shipment.assignedTransporterId !== updatedBy) {
				throw new ForbiddenException("Not authorized to update this status");
			}
		} else if (dto.status === ShipmentStatus.COMPLETED) {
			if (user.kind !== "LOGISTIC_SERVICE_PROVIDER" && user.role !== "LAST_MILE_PROVIDER") {
				throw new ForbiddenException("Only LSP or last mile provider can complete orders");
			}
		}

		this.validateStatusTransition(shipment.status, dto.status);

		const updated = await this.prisma.$transaction(async (tx) => {
			const updatedShipment = await tx.shipment.update({
				where: { id: shipmentId },
				data: { status: dto.status as any },
				include: { transporter: true, warehouse: true, documents: true },
			});

			await tx.shipmentStatusHistory.create({
				data: {
					shipmentId,
					status: dto.status as any,
					updatedBy,
					note: dto.note,
				},
			});

			return updatedShipment;
		});

		const majorStatuses = [ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.ARRIVED_AT_DESTINATION, ShipmentStatus.COMPLETED];

		if (majorStatuses.includes(dto.status) && updated.email) {
			const originObj = this.safeParseLocation(updated.origin ?? shipment.origin);
			const destinationObj = this.safeParseLocation(updated.destination ?? shipment.destination);
			const originText = this.formatLocationText(originObj);
			const destinationText = this.formatLocationText(destinationObj);

			await this.mailer.sendShipmentStatusUpdate(updated.email, {
				clientName: updated.clientName,
				trackingNumber: updated.orderId,
				status: this.formatStatusForDisplay(dto.status),
				origin: originText,
				destination: destinationText,
				estimatedDelivery: this.prettyDate(updated.deliveryDate),
				trackingUrl: `${this.cfg.get("APP_URL")}/shipments/track/${updated.orderId}`,
			});
		}

		// Create Notifications using updated info
		await Promise.all([this.createNotification(updatedBy, `You updated shipment ${updated.orderId} to ${dto.status}`, "in-app"), this.createNotification(updated.customerId, `Your shipment ${updated.orderId} status changed to ${dto.status}`, "in-app"), updated.assignedTransporterId ? this.createNotification(updated.assignedTransporterId, `Shipment ${updated.orderId} is now ${dto.status}`, "in-app") : Promise.resolve(), updated.assignedWarehouseId ? this.createNotification(updated.assignedWarehouseId, `Shipment ${updated.orderId} is now ${dto.status}`, "in-app") : Promise.resolve()]);

		return updated;
	}

	// MAIN FIND ALL WITH ROLE-BASED ACCESS CONTROL
	async findAll(filters: FilterShipmentDto, userId: string) {
		// Get user details to determine access level
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, kind: true, role: true },
		});

		if (!user) throw new ForbiddenException("User not found");

		const { page = 1, limit = 20, ...filterCriteria } = filters;
		const skip = (page - 1) * limit;

		// Base where clause
		const where: any = {};

		// ROLE-BASED FILTERING
		if (user.kind === "LOGISTIC_SERVICE_PROVIDER" || user.role === "CROSS_BORDER_LOGISTICS") {
			where.createdBy = userId;
			// LSP and Cross-Border Logistics can see ALL shipments
			// No additional filter needed - they have full access
			this.logger.log(`LSP/Admin ${userId} accessing all shipments`);
		} else if (user.role === "TRANSPORTER") {
			// Transporters can only see shipments assigned to them
			where.createdBy = userId;
			this.logger.log(`Transporter ${userId} accessing assigned shipments`);
		} else if (user.role === "LAST_MILE_PROVIDER") {
			// Last mile providers can see shipments assigned to them
			where.createdBy = userId;
			this.logger.log(`Last mile provider ${userId} accessing assigned shipments`);
		} else if (user.kind === "ENTERPRISE" || user.kind === "DISTRIBUTOR") {
			// Enterprises and Distributors can only see shipments they created
			where.createdBy = userId;
			this.logger.log(`Enterprise/Distributor ${userId} accessing their shipments`);
		} else if (user.kind === "END_USER") {
			// End users can only see shipments where they are the customer
			where.createdBy = userId;
			this.logger.log(`End user ${userId} accessing their shipments`);
		} else {
			// Unknown role - deny access
			throw new ForbiddenException("You do not have permission to view shipments");
		}

		// Apply additional filters from query parameters
		if (filterCriteria.status) {
			where.status = filterCriteria.status;
		}

		if (filterCriteria.orderId) {
			where.orderId = { contains: filterCriteria.orderId, mode: "insensitive" };
		}

		if (filterCriteria.cargoType) {
			where.cargoType = {
				contains: filterCriteria.cargoType,
				mode: "insensitive",
			};
		}

		if (filterCriteria.origin) {
			where.origin = {
				path: ["country"],
				string_contains: filterCriteria.origin,
			};
		}

		if (filterCriteria.destination) {
			where.destination = {
				path: ["country"],
				string_contains: filterCriteria.destination,
			};
		}

		// Execute query
		const [shipments, total] = await Promise.all([
			this.prisma.shipment.findMany({
				where,
				skip,
				take: limit,
				orderBy: { createdAt: "desc" },
				include: {
					customer: {
						select: {
							id: true,
							email: true,
							kind: true,
						},
					},
					transporter: {
						select: {
							id: true,
							email: true,
							role: true,
						},
					},
					warehouse: {
						select: {
							id: true,
							name: true,
							address: true,
						},
					},
					documents: {
						select: {
							id: true,
							docType: true,
							url: true,
							uploadedAt: true,
							fileName: true,
						},
					},
					creator: {
						select: {
							id: true,
							email: true,
							kind: true,
						},
					},
				},
			}),
			this.prisma.shipment.count({ where }),
		]);

		return {
			data: shipments,
			pagination: {
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			},
			meta: {
				userRole: user.kind,
				userRoleType: user.role,
				accessLevel: this.getAccessLevel(user.kind, user.role),
			},
		};
	}

	// SPECIFIC METHODS FOR EACH ROLE (Optional - for explicit calls)

	async findAllForTransporter(transporterId: string, filters: FilterShipmentDto) {
		// Verify user is actually a transporter
		const user = await this.prisma.user.findUnique({
			where: { id: transporterId },
			select: { role: true },
		});

		if (!user || (user.role !== "TRANSPORTER" && user.role !== "LAST_MILE_PROVIDER")) {
			throw new ForbiddenException("User is not a transporter");
		}

		const { page = 1, limit = 20, ...filterCriteria } = filters;
		const skip = (page - 1) * limit;

		const where: any = {
			assignedTransporterId: transporterId,
		};

		// Apply filters
		if (filterCriteria.status) where.status = filterCriteria.status;
		if (filterCriteria.orderId) where.orderId = { contains: filterCriteria.orderId, mode: "insensitive" };
		if (filterCriteria.cargoType)
			where.cargoType = {
				contains: filterCriteria.cargoType,
				mode: "insensitive",
			};

		const [shipments, total] = await Promise.all([
			this.prisma.shipment.findMany({
				where,
				skip,
				take: limit,
				orderBy: { createdAt: "desc" },
				include: {
					customer: { select: { id: true, email: true } },
					warehouse: { select: { id: true, name: true } },
					documents: true,
				},
			}),
			this.prisma.shipment.count({ where }),
		]);

		return {
			data: shipments,
			pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
		};
	}

	async findAllForCustomer(customerId: string, filters: FilterShipmentDto) {
		// Verify user is customer/enterprise
		const user = await this.prisma.user.findUnique({
			where: { id: customerId },
			select: { kind: true },
		});

		if (!user || !["ENTERPRISE", "DISTRIBUTOR", "END_USER"].includes(user.kind)) {
			throw new ForbiddenException("Invalid customer access");
		}

		const { page = 1, limit = 20, ...filterCriteria } = filters;
		const skip = (page - 1) * limit;

		const where: any = {
			// Check both createdBy and customerId
			OR: [{ createdBy: customerId }, { customerId: customerId }],
		};

		// Apply filters
		if (filterCriteria.status) where.status = filterCriteria.status;
		if (filterCriteria.orderId) where.orderId = { contains: filterCriteria.orderId, mode: "insensitive" };
		if (filterCriteria.cargoType)
			where.cargoType = {
				contains: filterCriteria.cargoType,
				mode: "insensitive",
			};

		const [shipments, total] = await Promise.all([
			this.prisma.shipment.findMany({
				where,
				skip,
				take: limit,
				orderBy: { createdAt: "desc" },
				include: {
					transporter: { select: { id: true, email: true } },
					warehouse: { select: { id: true, name: true } },
					documents: true,
					statusHistory: {
						orderBy: { timestamp: "desc" },
						take: 5, // Only recent history for customers
					},
				},
			}),
			this.prisma.shipment.count({ where }),
		]);

		return {
			data: shipments,
			pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
		};
	}

	async findAllForLSP(lspUserId: string, filters: FilterShipmentDto) {
		// Verify user is LSP
		const user = await this.prisma.user.findUnique({
			where: { id: lspUserId },
			select: { kind: true, role: true },
		});

		if (!user || (user.kind !== "LOGISTIC_SERVICE_PROVIDER" && user.role !== "CROSS_BORDER_LOGISTICS")) {
			throw new ForbiddenException("Only LSP can access all shipments");
		}

		const { page = 1, limit = 20, ...filterCriteria } = filters;
		const skip = (page - 1) * limit;

		const where: any = {};

		// Apply all filters (LSP can filter everything)
		if (filterCriteria.status) where.status = filterCriteria.status;
		if (filterCriteria.orderId) where.orderId = { contains: filterCriteria.orderId, mode: "insensitive" };
		if (filterCriteria.cargoType)
			where.cargoType = {
				contains: filterCriteria.cargoType,
				mode: "insensitive",
			};
		if (filterCriteria.origin)
			where.origin = {
				path: ["country"],
				string_contains: filterCriteria.origin,
			};
		if (filterCriteria.destination)
			where.destination = {
				path: ["country"],
				string_contains: filterCriteria.destination,
			};

		const [shipments, total] = await Promise.all([
			this.prisma.shipment.findMany({
				where: { createdBy: lspUserId },
				skip,
				take: limit,
				orderBy: { createdAt: "desc" },
				include: {
					customer: { select: { id: true, email: true, kind: true } },
					creator: { select: { id: true, email: true, kind: true } },
					transporter: { select: { id: true, email: true, role: true } },
					warehouse: { select: { id: true, name: true, address: true } },
					documents: true,
					statusHistory: {
						orderBy: { timestamp: "desc" },
						take: 10,
						include: {
							updatedByUser: { select: { id: true, email: true } },
						},
					},
				},
			}),
			this.prisma.shipment.count({ where }),
		]);

		// Additional analytics for LSP
		const analytics = await this.getShipmentAnalytics(where);

		return {
			data: shipments,
			pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
			analytics,
		};
	}

	async getDashboardAnalytics(userId: string): Promise<AnalyticsResponseDto> {
		// Get user details to determine access level
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, kind: true, role: true },
		});

		if (!user) throw new ForbiddenException("User not found");

		// Base where clause based on user role
		// const where: any = this.buildWhereClauseForUser(user);

		// Get all shipments for this user
		const shipments = await this.prisma.shipment.findMany({
			where: { createdBy: userId },
			include: {
				transporter: true,
				statusHistory: {
					orderBy: { timestamp: "desc" },
				},
			},
		});

		// Calculate metrics
		const now = new Date();
		const expectedDeliveryBuffer = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

		// 1. Active Vehicles (unique transporters currently assigned)
		const activeVehicles = shipments.filter((s) => ["ACCEPTED", "EN_ROUTE_TO_PICKUP", "PICKED_UP", "IN_TRANSIT"].includes(s.status)).length;

		// 2. Shipments In Transit
		const shipmentsInTransit = shipments.filter((s) => ["EN_ROUTE_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVED_AT_DESTINATION"].includes(s.status)).length;

		// 3. Completed Deliveries
		const completedDeliveries = shipments.filter((s) => s.status === "COMPLETED").length;

		// 4. Delayed Shipments (past expected delivery date)
		const delayedShipments = shipments.filter((s) => {
			if (s.status === "COMPLETED" || s.status === "CANCELLED") return false;
			if (!s.deliveryDate) return false;
			return new Date(s.deliveryDate).getTime() < now.getTime();
		}).length;

		// 5. Average Delivery Time (for completed shipments)
		const completedShipmentsWithDates = shipments.filter((s) => s.status === "COMPLETED" && s.pickupDate && s.deliveryDate);

		let averageDeliveryTimeMinutes = 0;
		if (completedShipmentsWithDates.length > 0) {
			const totalDeliveryTime = completedShipmentsWithDates.reduce((sum, shipment) => {
				// Find actual pickup time from status history
				const pickupHistory = shipment.statusHistory.find((h) => h.status === "PICKED_UP");
				const completedHistory = shipment.statusHistory.find((h) => h.status === "COMPLETED");

				if (pickupHistory && completedHistory) {
					const pickupTime = new Date(pickupHistory.timestamp).getTime();
					const completedTime = new Date(completedHistory.timestamp).getTime();
					const deliveryTimeMs = completedTime - pickupTime;
					return sum + deliveryTimeMs / (1000 * 60); // Convert to minutes
				}
				return sum;
			}, 0);

			averageDeliveryTimeMinutes = Math.round(totalDeliveryTime / completedShipmentsWithDates.length);
		}

		const hours = Math.floor(averageDeliveryTimeMinutes / 60);
		const minutes = averageDeliveryTimeMinutes % 60;

		// Status breakdown
		const byStatus = {
			pending: shipments.filter((s) => s.status === "PENDING_ACCEPTANCE").length,
			accepted: shipments.filter((s) => s.status === "ACCEPTED").length,
			inTransit: shipmentsInTransit,
			completed: completedDeliveries,
			cancelled: shipments.filter((s) => s.status === "CANCELLED").length,
			delayed: delayedShipments,
		};

		// Recent activity (last 10 status updates)
		const recentActivity = await this.prisma.shipmentStatusHistory.findMany({
			where: {
				shipment: { createdBy: userId },
			},
			take: 10,
			orderBy: { timestamp: "desc" },
			include: {
				shipment: {
					select: {
						id: true,
						orderId: true,
					},
				},
			},
		});

		return {
			activeShipment: activeVehicles,
			shipmentsInTransit,
			completedDeliveries,
			delayedShipments,
			averageDeliveryTime: {
				hours,
				minutes,
				totalMinutes: averageDeliveryTimeMinutes,
			},
			totalShipments: shipments.length,
			byStatus,
			recentActivity: recentActivity.map((activity) => ({
				shipmentId: activity.shipment.id,
				orderId: activity.shipment.orderId,
				status: activity.status,
				updatedAt: activity.timestamp,
			})),
		};
	}

	// Helper method to build where clause based on user role
	private buildWhereClauseForUser(user: { id: string; kind: string; role: string | null }): any {
		const where: any = {};

		if (user.kind === "LOGISTIC_SERVICE_PROVIDER" || user.role === "CROSS_BORDER_LOGISTICS") {
			// LSP can see all shipments - no filter needed
			return (where.createdBy = user.id);
		} else if (user.role === "TRANSPORTER" || user.role === "LAST_MILE_PROVIDER") {
			// Transporters only see assigned shipments
			where.createdBy = user.id;
		} else if (user.kind === "ENTERPRISE" || user.kind === "DISTRIBUTOR") {
			// Enterprises see shipments they created
			where.createdBy = user.id;
		} else if (user.kind === "END_USER") {
			// End users see shipments where they are the customer
			where.customerId = user.id;
		} else {
			// Unknown role - return impossible condition
			where.id = "impossible-id";
		}

		return where;
	}

	// HELPER: Get access level description
	private getAccessLevel(kind: string, role: string | null): string {
		if (kind === "LOGISTIC_SERVICE_PROVIDER" || role === "CROSS_BORDER_LOGISTICS") {
			return "full_access";
		} else if (role === "TRANSPORTER" || role === "LAST_MILE_PROVIDER") {
			return "assigned_only";
		} else if (kind === "ENTERPRISE" || kind === "DISTRIBUTOR") {
			return "created_only";
		} else if (kind === "END_USER") {
			return "customer_only";
		}
		return "no_access";
	}

	// HELPER: Get analytics for LSP dashboard
	private async getShipmentAnalytics(where: any) {
		const [totalShipments, pendingAcceptance, inTransit, completed, cancelled] = await Promise.all([
			this.prisma.shipment.count({ where }),
			this.prisma.shipment.count({
				where: { ...where, status: "PENDING_ACCEPTANCE" },
			}),
			this.prisma.shipment.count({
				where: { ...where, status: "IN_TRANSIT" },
			}),
			this.prisma.shipment.count({
				where: { ...where, status: "COMPLETED" },
			}),
			this.prisma.shipment.count({
				where: { ...where, status: "CANCELLED" },
			}),
		]);

		return {
			totalShipments,
			byStatus: {
				pendingAcceptance,
				inTransit,
				completed,
				cancelled,
			},
		};
	}

	// HELPER: Check if user can view specific shipment
	async canUserAccessShipment(shipmentId: string, userId: string): Promise<boolean> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { kind: true, role: true },
		});

		if (!user) return false;

		// LSP can access everything

		const shipment = await this.prisma.shipment.findUnique({
			where: { id: shipmentId },
			select: {
				createdBy: true,
				customerId: true,
				assignedTransporterId: true,
			},
		});

		if (!shipment) return false;

		if (user.kind === "LOGISTIC_SERVICE_PROVIDER" || user.role === "CROSS_BORDER_LOGISTICS") {
			return shipment.createdBy === userId;
		}

		// Check based on role
		if (user.role === "TRANSPORTER" || user.role === "LAST_MILE_PROVIDER") {
			return shipment.createdBy === userId;
		}

		if (user.kind === "ENTERPRISE" || user.kind === "DISTRIBUTOR") {
			return shipment.createdBy === userId;
		}

		if (user.kind === "END_USER") {
			return shipment.createdBy === userId;
		}

		return false;
	}

	// UPDATE EXISTING findOne to include access check
	async findOne(shipmentId: string, userId: string): Promise<Shipment> {
		// Check access first
		// const hasAccess = await this.canUserAccessShipment(shipmentId, userId);

		// if (!hasAccess) {
		// 	throw new ForbiddenException("You do not have permission to view this shipment");
		// }

		const shipment = await this.prisma.shipment.findUnique({
			where: { id: shipmentId },
			include: {
				customer: true,
				creator: true,
				transporter: true,
				warehouse: true,
				documents: true,
				statusHistory: {
					orderBy: { timestamp: "desc" },
					include: { updatedByUser: { select: { id: true, email: true } } },
				},
			},
		});

		if (!shipment) throw new NotFoundException("Shipment not found");
		return shipment;
	}

	// TRACK BY ORDER ID
	async trackByOrderId(orderId: string, userId: string) {
		const shipment = await this.prisma.shipment.findUnique({
			where: { orderId },
			include: {
				statusHistory: { orderBy: { timestamp: "desc" } },
				documents: true,
			},
		});

		if (!shipment) throw new NotFoundException("Shipment not found");

		if (shipment.customerId !== userId) {
			throw new BadRequestException("Unauthorized to track this shipment");
		}

		return {
			orderId: shipment.orderId,
			clientName: shipment.clientName,
			status: shipment.status,
			origin: shipment.origin,
			destination: shipment.destination,
			pickupDate: shipment.pickupDate,
			deliveryDate: shipment.deliveryDate,
			currentLocation: this.getCurrentLocation(shipment.status),
			timeline: shipment.statusHistory.map((h) => ({
				status: h.status,
				timestamp: h.timestamp,
				note: h.note,
			})),
		};
	}

	// UPDATE SHIPMENT
	async update(shipmentId: string, dto: UpdateShipmentDto, userId: string): Promise<Shipment> {
		await this.verifyShipmentOwnership(shipmentId, userId);

		const shipment = await this.prisma.shipment.findUnique({
			where: { id: shipmentId },
		});
		if (!shipment) throw new NotFoundException("Shipment not found");

		const totalCost = dto.baseFrieght || dto.handlingFee || dto.insuranceFee ? this.calculateTotalCost((dto.baseFrieght as any) ?? shipment.baseFrieght, (dto.handlingFee as any) ?? shipment.handlingFee, dto.insuranceFee ?? (shipment.insuranceFee as any)) : shipment.totalCost;

		const updated = await this.prisma.shipment.update({
			where: { id: shipmentId },
			data: {
				...dto,
				totalCost,
				pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : shipment.pickupDate,
				deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : shipment.deliveryDate,
				origin: dto.origin as any,
				destination: dto.destination as any,
				pickupMode: dto.pickupMode as any,
				serviceType: dto.serviceType as any,
			},
		});

		return updated;
	}

	// DELETE SHIPMENT
	async remove(shipmentId: string, userId: string): Promise<{ message: string }> {
		await this.verifyShipmentOwnership(shipmentId, userId);

		await this.prisma.$transaction(async (tx) => {
			await tx.shipmentDocument.deleteMany({ where: { shipmentId } });
			await tx.shipmentStatusHistory.deleteMany({ where: { shipmentId } });
			await tx.shipment.delete({ where: { id: shipmentId } });
		});

		return { message: "Shipment deleted successfully" };
	}

	// HELPERS
	generateOrderTrackingId(): string {
		const year = new Date().getFullYear();
		const randomId = Math.floor(10000 + Math.random() * 90000);
		return `SHP-${year}-${randomId}`;
	}

	private calculateTotalCost(base: number, handling: number, insurance?: number): number {
		return Number(base) + Number(handling) + (Number(insurance) ?? 0);
	}

	private validateShipmentData(dto: CreateShipmentDto): void {
		if (!dto.clientName || !dto.cargoType || !dto.orderId) {
			throw new BadRequestException("Missing required fields");
		}
	}

	private validateStatusTransition(current: string, next: ShipmentStatus): void {
		const validTransitions: Record<string, ShipmentStatus[]> = {
			[ShipmentStatus.PENDING_ACCEPTANCE]: [ShipmentStatus.ACCEPTED, ShipmentStatus.CANCELLED],
			[ShipmentStatus.ACCEPTED]: [ShipmentStatus.EN_ROUTE_TO_PICKUP, ShipmentStatus.CANCELLED],
			[ShipmentStatus.EN_ROUTE_TO_PICKUP]: [ShipmentStatus.PICKED_UP, ShipmentStatus.CANCELLED],
			[ShipmentStatus.PICKED_UP]: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
			[ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.ARRIVED_AT_DESTINATION, ShipmentStatus.CANCELLED],
			[ShipmentStatus.ARRIVED_AT_DESTINATION]: [ShipmentStatus.COMPLETED],
		};

		if (!validTransitions[current]?.includes(next)) {
			throw new BadRequestException(`Invalid status transition from ${current} to ${next}`);
		}
	}

	private formatStatusForDisplay(status: ShipmentStatus): string {
		return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
	}

	private getCurrentLocation(status: string): string {
		const locationMap: Record<string, string> = {
			[ShipmentStatus.PENDING_ACCEPTANCE]: "Order Pending",
			[ShipmentStatus.ACCEPTED]: "Preparing for Pickup",
			[ShipmentStatus.EN_ROUTE_TO_PICKUP]: "En Route to Pickup Location",
			[ShipmentStatus.PICKED_UP]: "Picked Up",
			[ShipmentStatus.IN_TRANSIT]: "In Transit",
			[ShipmentStatus.ARRIVED_AT_DESTINATION]: "Arrived at Destination",
			[ShipmentStatus.COMPLETED]: "Delivered",
			[ShipmentStatus.CANCELLED]: "Cancelled",
		};
		return locationMap[status] || "Unknown";
	}

	private detectDocumentType(filename?: string): DocumentType {
		if (!filename) return DocumentType.OTHER;
		const lower = filename.toLowerCase();
		if (lower.includes("invoice")) return DocumentType.COMMERCIAL_INVOICE;
		if (lower.includes("packing")) return DocumentType.PACKING_LIST;
		if (lower.includes("waybill")) return DocumentType.WAYBILL;
		if (lower.includes("lading")) return DocumentType.BILL_OF_LADING;
		return DocumentType.OTHER;
	}

	private async createNotification(recipientId: string, message: string, type: "email" | "in-app" | "sms") {
		try {
			// 1) If recipient is a user -> create single notification
			const user = await this.prisma.user.findUnique({
				where: { id: recipientId },
			});
			if (user) {
				await this.prisma.notification.create({
					data: {
						userId: user.id,
						message,
						type: type.toUpperCase().replace("-", "_") as any,
						read: false,
					},
				});
				return;
			}

			// 2) If recipient is a warehouse -> notify company users (or warehouse stakeholders)
			const warehouse = await this.prisma.warehouse.findUnique({
				where: { id: recipientId },
				select: { id: true, companyId: true },
			});
			if (warehouse) {
				const companyUsers = await this.prisma.user.findMany({
					where: { companyId: warehouse.companyId },
					select: { id: true },
				});

				if (companyUsers.length === 0) {
					this.logger.warn(`No company users found for warehouse ${recipientId} (companyId=${warehouse.companyId})`);
					return;
				}

				await Promise.all(
					companyUsers.map((u) =>
						this.prisma.notification.create({
							data: {
								userId: u.id,
								message,
								type: type.toUpperCase().replace("-", "_") as any,
								read: false,
							},
						})
					)
				);
				return;
			}

			// 3) Unknown recipient -> log and skip
			this.logger.warn(`createNotification: no user or warehouse found for id=${recipientId}. Skipping notification.`);
		} catch (err: any) {
			this.logger.error(`Failed to create notification: ${err.message}`);
		}
	}

	private async verifyShipmentOwnership(shipmentId: string, userId: string): Promise<void> {
		const shipment = await this.prisma.shipment.findUnique({
			where: { id: shipmentId },
			select: { id: true, customerId: true },
		});

		if (!shipment) {
			throw new NotFoundException("Shipment not found");
		}

		if (shipment.customerId !== userId) {
			throw new BadRequestException("You are not authorized to access this shipment");
		}
	}
}
