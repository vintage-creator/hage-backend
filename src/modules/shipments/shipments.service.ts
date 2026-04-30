// src/modules/shipments/shipments.service.ts
import {
	Injectable,
	NotFoundException,
	BadRequestException,
	Logger,
	Inject,
	ForbiddenException,
  } from "@nestjs/common";
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
  
	constructor(
	  private readonly prisma: PrismaService,
	  @Inject("StorageService") private readonly storage: StorageService,
	  private readonly mailer: MailService,
	  private readonly cfg: ConfigService,
	  private readonly urlService: UrlService
	) {}
  
	private safeParseLocation(val: any): any | null {
	  if (!val && val !== 0) return null;
	  if (typeof val === "object") return val;
	  if (typeof val !== "string") return val;
  
	  try {
		return JSON.parse(val);
	  } catch {
		const stripped = val.replace(/^"+|"+$/g, "");
		try {
		  return JSON.parse(stripped);
		} catch {
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
  
	// CREATE SHIPMENT (Step 1: Order Creation)
	async create(
	  dto: any,
	  lspUserId: string,
	  files?: Express.Multer.File[]
	): Promise<Shipment> {
	  try {
		const requiredFields = [
		  "clientName",
		  "cargoType",
		  "weight",
		  "origin",
		  "destination",
		  "pickupMode",
		  "serviceType",
		  "baseFrieght",
		  "handlingFee",
		];
  
		for (const field of requiredFields) {
		  if (
			dto[field] === undefined ||
			dto[field] === null ||
			dto[field] === "" ||
			(typeof dto[field] === "object" && Object.keys(dto[field]).length === 0)
		  ) {
			throw new BadRequestException(`${field} is required`);
		  }
		}
  
		const uploadPromises =
		  files?.map((file) =>
			this.storage.uploadFile(file, { folder: "shipment-documents" })
		  ) ?? [];
		const uploadedDocs = await Promise.all(uploadPromises);
  
		const sanitizeNumber = (num?: any) => (isNaN(Number(num)) ? 0 : Number(num));
  
		const normalizedOrigin = this.safeParseLocation(dto.origin);
		const normalizedDestination = this.safeParseLocation(dto.destination);
  
		const shipment = await this.prisma.$transaction(async (tx: any) => {
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
			  totalCost:
				sanitizeNumber(dto.baseFrieght) +
				sanitizeNumber(dto.handlingFee) +
				sanitizeNumber(dto.insuranceFee),
			  status: ShipmentStatus.PENDING as any,
			  createdBy: lspUserId,
			  customerId: lspUserId,
			},
		  });
  
		  await tx.shipmentStatusHistory.create({
			data: {
			  shipmentId: createdShipment.id,
			  status: ShipmentStatus.PENDING as any,
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
		const destinationObj = this.safeParseLocation(
		  shipment.destination ?? dto.destination
		);
  
		const originText = this.formatLocationText(originObj);
		const destinationText = this.formatLocationText(destinationObj);
  
		if (dto.email) {
		  try {
			await this.mailer.sendShipmentCreated(dto.email, {
			  clientName: dto.clientName,
			  trackingNumber: shipment.orderId,
			  origin: originText,
			  destination: destinationText,
			  estimatedDelivery: this.prettyDate(
				shipment.deliveryDate ?? dto.deliveryDate
			  ),
			  status: ShipmentStatus.PENDING,
			  trackingUrl: `${this.urlService.normalizePrefix()}`,
			});
		  } catch (err: any) {
			this.logger.warn(`Failed to send shipment email: ${err?.message || err}`);
		  }
		}
  
		await this.createNotification(
		  lspUserId,
		  `New shipment ${shipment.orderId} created successfully`,
		  "in-app"
		);
  
		return shipment;
	  } catch (err: any) {
		this.logger.error("Shipment creation failed", err);
		if (err.code === "P2002" && err.meta?.target?.includes("orderId")) {
		  throw new BadRequestException(
			`A shipment with orderId '${dto.orderId}' already exists. Please use a different orderId.`
		  );
		}
		throw new BadRequestException(err.message || "Shipment creation failed");
	  }
	}
  
	// ACCEPT & ASSIGN SHIPMENT (Step 2)
	async acceptAndAssign(
	  shipmentId: string,
	  dto: AssignShipmentDto,
	  lspUserId: string
	): Promise<Shipment> {
	  const user = await this.prisma.user.findUnique({ where: { id: lspUserId } });
	  if (!user) throw new NotFoundException("User not found");
  
	  const shipment = await this.prisma.shipment.findUnique({
		where: { id: shipmentId },
	  });
	  if (!shipment) throw new NotFoundException("Shipment not found");
  
	  if (shipment.status !== (ShipmentStatus.PENDING as any)) {
		throw new BadRequestException("Shipment already accepted or not pending");
	  }
  
	  if (dto.transporterId) {
		const transporter = await this.prisma.user.findUnique({
		  where: { id: dto.transporterId },
		});
		if (!transporter) throw new NotFoundException("Transporter not found");
		if (transporter.kind !== "LAST_MILE_DELIVERY") {
		  throw new BadRequestException("Invalid transporter");
		}
	  }
  
	  let warehouse = null;
	  if (dto.warehouseId) {
		warehouse = await this.prisma.warehouse.findUnique({
		  where: { id: dto.warehouseId },
		});
		if (!warehouse) throw new BadRequestException("Invalid warehouse");
	  }
  
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
  
	  const updated = await this.prisma.$transaction(async (tx: any) => {
		const updatedShipment = await tx.shipment.update({
		  where: { id: shipmentId },
		  data: {
			status: ShipmentStatus.IN_WAREHOUSE as any,
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
  
		await tx.shipmentStatusHistory.create({
		  data: {
			shipmentId,
			status: ShipmentStatus.IN_WAREHOUSE as any,
			updatedBy: lspUserId,
		  },
		});
  
		await tx.bin.update({
		  where: { id: assignedLocation!.binId },
		  data: {
			currentQty: {
			  increment: 1,
			},
		  },
		});
  
		return updatedShipment;
	  });
  
	  await Promise.all([
		this.createNotification(
		  lspUserId,
		  `You accepted shipment ${updated.orderId}`,
		  "in-app"
		),
		this.createNotification(
		  updated.customerId,
		  `Shipment ${updated.orderId} has been accepted`,
		  "in-app"
		),
		dto.transporterId
		  ? this.createNotification(
			  dto.transporterId,
			  `You have been assigned to shipment ${updated.orderId}`,
			  "in-app"
			)
		  : Promise.resolve(),
		dto.warehouseId
		  ? this.createNotification(
			  dto.warehouseId,
			  `Shipment ${updated.orderId} assigned to your warehouse`,
			  "in-app"
			)
		  : Promise.resolve(),
	  ]);
  
	  if (updated.email) {
		const originObj = this.safeParseLocation(updated.origin ?? shipment.origin);
		const destinationObj = this.safeParseLocation(
		  updated.destination ?? shipment.destination
		);
		const originText = this.formatLocationText(originObj);
		const destinationText = this.formatLocationText(destinationObj);
  
		await this.mailer.sendShipmentStatusUpdate(updated.email, {
		  clientName: updated.clientName,
		  trackingNumber: updated.orderId,
		  status: "In warehouse",
		  origin: originText,
		  destination: destinationText,
		  estimatedDelivery: this.prettyDate(updated.deliveryDate),
		  trackingUrl: `${this.cfg.get("APP_URL")}`,
		});
	  }
  
	  return updated;
	}
  
	// UPDATE STATUS (Step 3)
	async updateStatus(
	  shipmentId: string,
	  dto: UpdateStatusDto,
	  updatedBy: string
	): Promise<Shipment> {
	  const shipment = await this.prisma.shipment.findUnique({
		where: { id: shipmentId },
		include: { transporter: true },
	  });
  
	  if (!shipment) throw new NotFoundException("Shipment not found");
  
	  const user = await this.prisma.user.findUnique({
		where: { id: updatedBy },
	  });
  
	  if (!user) throw new NotFoundException("User not found");
  
	  this.validateStatusTransition(shipment.status as ShipmentStatus, dto.status);
  
	  const updated = await this.prisma.$transaction(async (tx: any) => {
		const updatedShipment = await tx.shipment.update({
		  where: { id: shipmentId },
		  data: {
			status: dto.status as any,
		  },
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
  
	  await Promise.all([
		this.createNotification(
		  updatedBy,
		  `You updated shipment ${updated.orderId} to ${dto.status}`,
		  "in-app"
		),
		this.createNotification(
		  updated.customerId,
		  `Your shipment ${updated.orderId} status changed to ${dto.status}`,
		  "in-app"
		),
		updated.assignedTransporterId
		  ? this.createNotification(
			  updated.assignedTransporterId,
			  `Shipment ${updated.orderId} is now ${dto.status}`,
			  "in-app"
			)
		  : Promise.resolve(),
		updated.assignedWarehouseId
		  ? this.createNotification(
			  updated.assignedWarehouseId,
			  `Shipment ${updated.orderId} is now ${dto.status}`,
			  "in-app"
			)
		  : Promise.resolve(),
	  ]);
  
	  return updated;
	}
  
	async findAll(filters: FilterShipmentDto, userId: string) {
	  const user = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, kind: true },
	  });
  
	  if (!user) throw new ForbiddenException("User not found");
  
	  const { page = 1, limit = 20, statusFilter, ...filterCriteria } = filters;
	  const skip = (page - 1) * limit;
  
	  const where: any = {};
  
	  if (user.kind === "LOGISTIC_SERVICE_PROVIDER") {
		where.createdBy = userId;
		this.logger.log(`LSP ${userId} accessing shipments`);
	  } else if (user.kind === "LAST_MILE_DELIVERY") {
		where.assignedTransporterId = userId;
		this.logger.log(`Last mile delivery user ${userId} accessing assigned shipments`);
	  } else if (
		user.kind === "ENTERPRISE" ||
		user.kind === "DISTRIBUTOR" ||
		user.kind === "INDIVIDUAL"
	  ) {
		where.OR = [{ createdBy: userId }, { customerId: userId }];
		this.logger.log(`Customer ${userId} accessing their shipments`);
	  } else {
		throw new ForbiddenException("You do not have permission to view shipments");
	  }
  
	  if (statusFilter) {
		switch (statusFilter.toLowerCase()) {
		  case "pendings":
			break;
		  case "new":
		  case "pending":
			where.status = ShipmentStatus.PENDING;
			break;
		  case "in_warehouse":
		  case "warehouse":
			where.status = ShipmentStatus.IN_WAREHOUSE;
			where.assignedWarehouseId = { not: null };
			break;
		  case "new_orders": {
			const threeDaysAgo = new Date();
			threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
			where.createdAt = {
			  gte: threeDaysAgo,
			};
			break;
		  }
		  default:
			this.logger.warn(`Invalid status filter: ${statusFilter}`);
			break;
		}
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
  
	  if (filterCriteria.startDate) {
		where.createdAt = {
		  ...where.createdAt,
		  gte: new Date(filterCriteria.startDate),
		};
	  }
  
	  if (filterCriteria.endDate) {
		where.createdAt = {
		  ...where.createdAt,
		  lte: new Date(filterCriteria.endDate),
		};
	  }
  
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
				kind: true,
			  },
			},
			warehouse: {
			  select: {
				id: true,
				name: true,
				address: true,
			  },
			},
			zone: {
			  select: {
				id: true,
				name: true,
			  },
			},
			rack: {
			  select: {
				id: true,
				name: true,
			  },
			},
			bin: {
			  select: {
				id: true,
				name: true,
				currentQty: true,
				capacity: true,
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
		success: true,
		data: shipments,
		pagination: {
		  total,
		  page,
		  limit,
		  totalPages: Math.ceil(total / limit),
		},
	  };
	}
  
	async findAllForTransporter(transporterId: string, filters: FilterShipmentDto) {
	  const user = await this.prisma.user.findUnique({
		where: { id: transporterId },
		select: { kind: true },
	  });
  
	  if (!user || user.kind !== "LAST_MILE_DELIVERY") {
		throw new ForbiddenException("User is not a transporter");
	  }
  
	  const { page = 1, limit = 20, ...filterCriteria } = filters;
	  const skip = (page - 1) * limit;
  
	  const where: any = {
		assignedTransporterId: transporterId,
	  };
  
	  if (filterCriteria.status) where.status = filterCriteria.status;
	  if (filterCriteria.orderId) {
		where.orderId = { contains: filterCriteria.orderId, mode: "insensitive" };
	  }
	  if (filterCriteria.cargoType) {
		where.cargoType = {
		  contains: filterCriteria.cargoType,
		  mode: "insensitive",
		};
	  }
  
	  const [shipments, total] = await Promise.all([
		this.prisma.shipment.findMany({
		  where,
		  skip,
		  take: limit,
		  orderBy: { createdAt: "desc" },
		  include: {
			customer: { select: { id: true, email: true, kind: true } },
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
	  const user = await this.prisma.user.findUnique({
		where: { id: customerId },
		select: { kind: true },
	  });
  
	  if (
		!user ||
		!["ENTERPRISE", "DISTRIBUTOR", "INDIVIDUAL"].includes(user.kind)
	  ) {
		throw new ForbiddenException("Invalid customer access");
	  }
  
	  const { page = 1, limit = 20, ...filterCriteria } = filters;
	  const skip = (page - 1) * limit;
  
	  const where: any = {
		OR: [{ createdBy: customerId }, { customerId }],
	  };
  
	  if (filterCriteria.status) where.status = filterCriteria.status;
	  if (filterCriteria.orderId) {
		where.orderId = { contains: filterCriteria.orderId, mode: "insensitive" };
	  }
	  if (filterCriteria.cargoType) {
		where.cargoType = {
		  contains: filterCriteria.cargoType,
		  mode: "insensitive",
		};
	  }
  
	  const [shipments, total] = await Promise.all([
		this.prisma.shipment.findMany({
		  where,
		  skip,
		  take: limit,
		  orderBy: { createdAt: "desc" },
		  include: {
			transporter: { select: { id: true, email: true, kind: true } },
			warehouse: { select: { id: true, name: true } },
			documents: true,
			statusHistory: {
			  orderBy: { timestamp: "desc" },
			  take: 5,
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
	  const user = await this.prisma.user.findUnique({
		where: { id: lspUserId },
		select: { kind: true },
	  });
  
	  if (!user || user.kind !== "LOGISTIC_SERVICE_PROVIDER") {
		throw new ForbiddenException("Only LSP can access all shipments");
	  }
  
	  const { page = 1, limit = 20, ...filterCriteria } = filters;
	  const skip = (page - 1) * limit;
  
	  const where: any = {
		createdBy: lspUserId,
	  };
  
	  if (filterCriteria.status) where.status = filterCriteria.status;
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
  
	  const [shipments, total] = await Promise.all([
		this.prisma.shipment.findMany({
		  where,
		  skip,
		  take: limit,
		  orderBy: { createdAt: "desc" },
		  include: {
			customer: { select: { id: true, email: true, kind: true } },
			creator: { select: { id: true, email: true, kind: true } },
			transporter: { select: { id: true, email: true, kind: true } },
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
  
	  const analytics = await this.getShipmentAnalytics(where);
  
	  return {
		data: shipments,
		pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
		analytics,
	  };
	}
  
	async getDashboardAnalytics(userId: string): Promise<AnalyticsResponseDto> {
	  const user = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, kind: true },
	  });
  
	  if (!user) throw new ForbiddenException("User not found");
  
	  const shipments = await this.prisma.shipment.findMany({
		where: { createdBy: userId },
		include: {
		  transporter: true,
		  statusHistory: { orderBy: { timestamp: "desc" } },
		},
	  });
  
	  const now = new Date();
  
	  const activeShipmentCount = shipments.filter(
		(s: any) => s.status === ShipmentStatus.IN_WAREHOUSE
	  ).length;
  
	  const inTransitCount = shipments.filter(
		(s: any) => s.status === ShipmentStatus.IN_WAREHOUSE
	  ).length;
  
	  const completedCount = shipments.filter(
		(s: any) => !["PENDING", "IN_WAREHOUSE"].includes(s.status)
	  ).length;
  
	  const TERMINAL_STATUSES = ["COMPLETED", "DELIVERED", "CANCELLED"];
	  const delayedShipments = shipments.filter((s: any) => {
		if (TERMINAL_STATUSES.includes(s.status)) return false;
		if (!s.deliveryDate) return false;
		return new Date(s.deliveryDate).getTime() < now.getTime();
	  }).length;
  
	  const completedWithDates = shipments.filter(
		(s: any) =>
		  TERMINAL_STATUSES.includes(s.status) && s.pickupDate && s.deliveryDate
	  );
  
	  let averageMinutes = 0;
	  if (completedWithDates.length > 0) {
		const total = completedWithDates.reduce((sum: number, s: any) => {
		  const pickup = new Date(s.pickupDate!).getTime();
		  const delivered = new Date(s.deliveryDate!).getTime();
		  return sum + (delivered - pickup) / (1000 * 60);
		}, 0);
		averageMinutes = Math.round(total / completedWithDates.length);
	  }
  
	  const hours = Math.floor(averageMinutes / 60);
	  const minutes = averageMinutes % 60;
  
	  const recentActivity = await this.prisma.shipmentStatusHistory.findMany({
		where: { shipment: { createdBy: userId } },
		take: 10,
		orderBy: { timestamp: "desc" },
		include: { shipment: { select: { id: true, orderId: true } } },
	  });
  
	  return {
		activeShipment: activeShipmentCount,
		shipmentsInTransit: inTransitCount,
		completedDeliveries: completedCount,
		delayedShipments,
		averageDeliveryTime: {
		  hours,
		  minutes,
		  totalMinutes: averageMinutes,
		},
		totalShipments: shipments.length,
		recentActivity: recentActivity.map((a: any) => ({
		  shipmentId: a.shipment.id,
		  orderId: a.shipment.orderId,
		  status: a.status,
		  updatedAt: a.timestamp,
		})),
	  };
	}
  
	private async getShipmentAnalytics(where: any) {
	  const [totalShipments, pendingAcceptance, inTransit, completed] =
		await Promise.all([
		  this.prisma.shipment.count({ where }),
		  this.prisma.shipment.count({
			where: { ...where, status: ShipmentStatus.PENDING },
		  }),
		  this.prisma.shipment.count({
			where: { ...where, status: ShipmentStatus.IN_WAREHOUSE },
		  }),
		  this.prisma.shipment.count({
			where: { ...where, status: "COMPLETED" },
		  }),
		]);
  
	  return {
		totalShipments,
		byStatus: { pendingAcceptance, inTransit, completed },
	  };
	}
  
	async canUserAccessShipment(
	  shipmentId: string,
	  userId: string
	): Promise<boolean> {
	  const user = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { kind: true },
	  });
  
	  if (!user) return false;
  
	  const shipment = await this.prisma.shipment.findUnique({
		where: { id: shipmentId },
		select: {
		  createdBy: true,
		  customerId: true,
		  assignedTransporterId: true,
		},
	  });
  
	  if (!shipment) return false;
  
	  if (user.kind === "LOGISTIC_SERVICE_PROVIDER") {
		return shipment.createdBy === userId;
	  }
  
	  if (user.kind === "LAST_MILE_DELIVERY") {
		return shipment.assignedTransporterId === userId;
	  }
  
	  if (
		user.kind === "ENTERPRISE" ||
		user.kind === "DISTRIBUTOR" ||
		user.kind === "INDIVIDUAL"
	  ) {
		return shipment.createdBy === userId || shipment.customerId === userId;
	  }
  
	  return false;
	}
  
	async findOne(shipmentId: string, userId: string): Promise<Shipment> {
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
		currentLocation: this.getCurrentLocation(shipment.status as ShipmentStatus),
		timeline: shipment.statusHistory.map((h: any) => ({
		  status: h.status,
		  timestamp: h.timestamp,
		  note: h.note,
		})),
	  };
	}
  
	async update(
	  shipmentId: string,
	  dto: UpdateShipmentDto,
	  userId: string
	): Promise<Shipment> {
	  await this.verifyShipmentOwnership(shipmentId, userId);
  
	  const shipment = await this.prisma.shipment.findUnique({
		where: { id: shipmentId },
	  });
	  if (!shipment) throw new NotFoundException("Shipment not found");
  
	  const totalCost =
		dto.baseFrieght || dto.handlingFee || dto.insuranceFee
		  ? this.calculateTotalCost(
			  (dto.baseFrieght as any) ?? shipment.baseFrieght,
			  (dto.handlingFee as any) ?? shipment.handlingFee,
			  dto.insuranceFee ?? (shipment.insuranceFee as any)
			)
		  : shipment.totalCost;
  
	  const updated = await this.prisma.shipment.update({
		where: { id: shipmentId },
		data: {
		  ...dto,
		  totalCost,
		  pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : shipment.pickupDate,
		  deliveryDate: dto.deliveryDate
			? new Date(dto.deliveryDate)
			: shipment.deliveryDate,
		  origin: dto.origin as any,
		  destination: dto.destination as any,
		  pickupMode: dto.pickupMode as any,
		  serviceType: dto.serviceType as any,
		},
	  });
  
	  return updated;
	}
  
	async remove(
	  shipmentId: string,
	  userId: string
	): Promise<{ message: string }> {
	  await this.verifyShipmentOwnership(shipmentId, userId);
  
	  await this.prisma.$transaction(async (tx: any) => {
		await tx.shipmentDocument.deleteMany({ where: { shipmentId } });
		await tx.shipmentStatusHistory.deleteMany({ where: { shipmentId } });
		await tx.shipment.delete({ where: { id: shipmentId } });
	  });
  
	  return { message: "Shipment deleted successfully" };
	}
  
	async generateOrderTrackingId(): Promise<string> {
	  while (true) {
		const year = new Date().getFullYear();
		const randomId = Math.floor(10000 + Math.random() * 90000);
		const trackingId = `SHP-${year}-${randomId}`;
  
		const existing = await this.prisma.shipment.findFirst({
		  where: { orderId: trackingId },
		});
  
		if (!existing) {
		  return trackingId;
		}
	  }
	}
  
	private calculateTotalCost(
	  base: number,
	  handling: number,
	  insurance?: number
	): number {
	  return Number(base) + Number(handling) + (Number(insurance) ?? 0);
	}
  
	private validateShipmentData(dto: CreateShipmentDto): void {
	  if (!dto.clientName || !dto.cargoType || !dto.orderId) {
		throw new BadRequestException("Missing required fields");
	  }
	}
  
	private validateStatusTransition(
	  current: ShipmentStatus,
	  next: ShipmentStatus
	): void {
	  const validTransitions: Record<ShipmentStatus, ShipmentStatus[]> = {
		[ShipmentStatus.PENDING]: [ShipmentStatus.IN_WAREHOUSE],
		[ShipmentStatus.IN_WAREHOUSE]: [],
	  };
  
	  if (!validTransitions[current]?.includes(next)) {
		throw new BadRequestException(
		  `Invalid status transition from ${current} to ${next}`
		);
	  }
	}
  
	private getCurrentLocation(status: ShipmentStatus): string {
	  const locationMap: Record<ShipmentStatus, string> = {
		[ShipmentStatus.PENDING]: "Pending – Awaiting Processing",
		[ShipmentStatus.IN_WAREHOUSE]: "In Warehouse",
	  };
  
	  return locationMap[status] ?? "Unknown Status";
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
  
	private async createNotification(
	  recipientId: string,
	  message: string,
	  type: "email" | "in-app" | "sms"
	) {
	  try {
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
			this.logger.warn(
			  `No company users found for warehouse ${recipientId} (companyId=${warehouse.companyId})`
			);
			return;
		  }
  
		  await Promise.all(
			companyUsers.map((u: any) =>
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
  
		this.logger.warn(
		  `createNotification: no user or warehouse found for id=${recipientId}. Skipping notification.`
		);
	  } catch (err: any) {
		this.logger.error(`Failed to create notification: ${err.message}`);
	  }
	}
  
	private async verifyShipmentOwnership(
	  shipmentId: string,
	  userId: string
	): Promise<void> {
	  const shipment = await this.prisma.shipment.findUnique({
		where: { id: shipmentId },
		select: { id: true, customerId: true },
	  });
  
	  if (!shipment) {
		throw new NotFoundException("Shipment not found");
	  }
  
	  if (shipment.customerId !== userId) {
		throw new BadRequestException(
		  "You are not authorized to access this shipment"
		);
	  }
	}
  }