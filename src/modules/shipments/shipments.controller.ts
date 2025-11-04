// src/modules/shipments/shipments.controller.ts
import { Controller, Post, Body, Get, Param, Patch, Delete, UseGuards, UseInterceptors, UploadedFiles, Req, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody, ApiResponse, ApiQuery, ApiParam, ApiOperation } from "@nestjs/swagger";
import { FilesInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ShipmentsService } from "./shipments.service";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { UpdateShipmentDto } from "./dto/update-shipment.dto";
import { Request } from "express";
import { AssignShipmentDto } from "./dto/assign-shipment.dto";
import { FilterShipmentDto } from "./dto/filter-shipment.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("shipments")
@Controller("shipments")
export class ShipmentsController {
	constructor(private readonly svc: ShipmentsService) {}

	// ✅ CREATE SHIPMENT
	@Post()
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiConsumes("multipart/form-data")
	@UseInterceptors(FilesInterceptor("documents"))
	@ApiOperation({
		summary: "Create a new shipment",
		description: "Allows authenticated users (LSPs, enterprises, or distributors) to create a new shipment record. Supports uploading shipment-related documents (bill of lading, invoice, etc.).",
	})
	@ApiBody({
		description: "Create a new shipment (form-data). Use field name `documents` for file uploads.",
		schema: {
			type: "object",
			properties: {
				orderId: { type: "string" },
				clientName: { type: "string" },
				email: { type: "string", format: "email" },
				phone: { type: "string" },
				cargoType: { type: "string" },
				tons: { type: "number" },
				weight: { type: "number" },
				handlingInstructions: { type: "string" },
				origin: {
					type: "object",
					properties: {
						country: { type: "string" },
						state: { type: "string" },
						address: { type: "string" },
						phone: { type: "string" },
					},
				},
				destination: {
					type: "object",
					properties: {
						country: { type: "string" },
						state: { type: "string" },
						address: { type: "string" },
						phone: { type: "string" },
					},
				},
				pickupMode: {
					type: "string",
					enum: ["AIR_FREIGHT", "SEA_FREIGHT", "ROAD"],
				},
				pickupDate: { type: "string", format: "date-time" },
				deliveryDate: { type: "string", format: "date-time" },
				serviceType: {
					type: "string",
					enum: ["EXPRESS_SHIPPING", "REGULAR_SHIPPING", "COLDCHAIN_SHIPPING"],
				},
				baseFrieght: { type: "number" },
				handlingFee: { type: "number" },
				insuranceFee: { type: "number" },
				// files
				documents: {
					type: "array",
					items: { type: "string", format: "binary" },
				},
			},
			required: ["clientName", "cargoType", "weight", "origin", "destination", "pickupMode", "serviceType", "baseFrieght", "handlingFee"],
		},
	})
	@ApiResponse({
		status: 201,
		description: "Shipment successfully created",
		schema: {
			example: {
				id: "clx0a12340000a3l45d8x9e7t",
				orderId: "SHP-12345",
				clientName: "Acme Logistics",
				serviceType: "EXPRESS_SHIPPING",
				status: "PENDING",
				createdAt: "2025-10-18T18:00:00.000Z",
			},
		},
	})
	create(@Body() dto: any, @Req() req: Request, @UploadedFiles() files: Express.Multer.File[]) {
		const userId = (req.user as any)?.id;
		return this.svc.create(dto, userId, files);
	}

	// ✅ GENERATE TRACKING ID
	@Get("generate-tracking")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Generate a new shipment tracking number",
		description: "Generates a unique tracking number for use when creating shipments.",
	})
	generateTracking() {
		return { trackingNumber: this.svc.generateOrderTrackingId() };
	}

	// ✅ ASSIGN SHIPMENT
	@ApiParam({
		name: "id",
		description: "Shipment ID",
		example: "clx0a12340000a3l45d8x9e7t",
	})
	@ApiBody({
		description: "Assign a transporter and/or warehouse to a shipment. Only LSP/CROSS_BORDER_LOGISTICS may call.",
		type: AssignShipmentDto,
		examples: {
			assignBoth: {
				summary: "Assign transporter and warehouse",
				value: {
					transporterId: "user_transporter_id_123",
					warehouseId: "warehouse_id_456",
				},
			},
			assignWarehouseOnly: {
				summary: "Only assign a warehouse",
				value: { warehouseId: "warehouse_id_456" },
			},
		},
	})
	@Patch(":id/assign")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("LOGISTIC_SERVICE_PROVIDER", "CROSS_BORDER_LOGISTICS")
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Accept and assign a shipment",
		description: "Allows Logistic Service Providers (LSPs) to accept and assign a shipment to a transporter or route for fulfillment.",
	})
	async acceptAndAssign(@Param("id") shipmentId: string, @Body() dto: AssignShipmentDto, @Req() req: Request) {
		const userId = (req.user as any)?.id;
		return this.svc.acceptAndAssign(shipmentId, dto, userId);
	}

	// ✅ GET ALL SHIPMENTS
	@Get()
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "List all shipments",
		description:
			"Fetches all shipments belonging to the authenticated user. Can be filtered by status (e.g., PENDING_ACCEPTANCE, ACCEPTED, EN_ROUTE_TO_PICKUP, PICKED_UP, IN_TRANSIT, ARRIVED_AT_DESTINATION, COMPLETED, CANCELLED).",
	})
	@ApiQuery({
		name: "status",
		required: false,
		description: "Filter shipments by status (e.g., PENDING_ACCEPTANCE, ACCEPTED, EN_ROUTE_TO_PICKUP, PICKED_UP)",
	})
	async findAll(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAll(filters, req.user.id);
	}

	// ✅ TRANSPORTER'S SHIPMENTS
	@Get("my/assigned")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("TRANSPORTER")
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Get shipments assigned to a transporter",
		description: "Fetches all shipments currently assigned to the authenticated transporter account for fulfillment.",
	})
	async getMyAssignedShipments(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAllForTransporter(req.user.id, filters);
	}

	// ✅ CUSTOMER'S SHIPMENTS
	@Get("my/created")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Get shipments created by the authenticated user",
		description: "Returns a list of shipments that were created by the currently logged-in customer or enterprise account.",
	})
	async getMyCreatedShipments(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAllForCustomer(req.user.id, filters);
	}

	// ✅ LSP DASHBOARD SHIPMENTS
	@Get("admin/all")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("LOGISTIC_SERVICE_PROVIDER")
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Get all shipments (LSP view)",
		description: "Allows a Logistic Service Provider (LSP) to view all shipments across their managed network. Supports optional filters.",
	})
	async getAllShipmentsAdmin(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAllForLSP(req.user.id, filters);
	}

	// ✅ DASHBOARD ANALYTICS
	@Get("analytics/dashboard")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Get shipment analytics dashboard",
		description: "Returns key shipment performance metrics — including total shipments, delayed shipments, delivery times, and recent activity.",
	})
	async getDashboardAnalytics(@Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.getDashboardAnalytics(userId);
	}

	// ✅ GET SHIPMENT BY ID
	@Get(":id")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiParam({
		name: "id",
		description: "Shipment ID",
		example: "clx0a12340000a3l45d8x9e7t",
	})
	@ApiOperation({
		summary: "Get shipment by ID",
		description: "Fetches detailed shipment information, including cargo details, status, origin, and destination.",
	})
	findOne(@Param("id") id: string, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.findOne(id, userId);
	}

	// ✅ TRACK SHIPMENT BY ORDER ID
	@Get("track/:orderId")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Track shipment by tracking number",
		description: "Allows authenticated users to track a shipment using its tracking number (orderId).",
	})
	async trackByOrderId(@Param("orderId") orderId: string, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.trackByOrderId(orderId, userId);
	}

	// ✅ UPDATE SHIPMENT
	@ApiParam({
		name: "id",
		description: "Shipment ID",
		example: "clx0a12340000a3l45d8x9e7t",
	})
	@ApiBody({
		description: "Update shipment details. Fields are mostly optional — include only fields you want to change.",
		type: UpdateShipmentDto,
		examples: {
			changeDates: {
				summary: "Update delivery/pickup dates",
				value: {
					pickupDate: "2025-10-21T09:00:00Z",
					deliveryDate: "2025-10-25T15:00:00Z",
				},
			},
			changePricing: {
				summary: "Update pricing",
				value: {
					baseFrieght: 1500,
					handlingFee: 120,
					insuranceFee: 60,
				},
			},
		},
	})
	@Patch(":id")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("LOGISTIC_SERVICE_PROVIDER", "TRANSPORTER", "LAST_MILE_PROVIDER")
	@ApiBearerAuth("access-token")
	@ApiParam({ name: "id", description: "Shipment ID" })
	@ApiOperation({
		summary: "Update shipment details",
		description: "Allows authorized roles (LSPs, transporters, last-mile providers) to update shipment details such as delivery date or status.",
	})
	update(@Param("id") id: string, @Body() dto: UpdateShipmentDto, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.update(id, dto, userId);
	}

	// ✅ DELETE SHIPMENT
	@Delete(":id")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiParam({ name: "id", description: "Shipment ID" })
	@ApiOperation({
		summary: "Delete a shipment",
		description: "Allows the creator or an admin to permanently delete a shipment record. Use with caution — this cannot be undone.",
	})
	remove(@Param("id") id: string, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.remove(id, userId);
	}

	// ✅ UPDATE SHIPMENT STATUS
	@ApiParam({
		name: "id",
		description: "Shipment ID",
		example: "clx0a12340000a3l45d8x9e7t",
	})
	@ApiBody({
		description: "Change shipment status. `status` must be one of your ShipmentStatus enum values. `note` is optional.",
		type: UpdateStatusDto,
		examples: {
			pickUp: {
				summary: "Mark as picked up",
				value: { status: "PICKED_UP", note: "Picked up by transporter X" },
			},
			inTransit: {
				summary: "Mark in transit",
				value: { status: "IN_TRANSIT" },
			},
		},
	})
	@Patch(":id/status")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiOperation({
		summary: "Update shipment status",
		description: "Updates the current status of a shipment (e.g., from PENDING to IN_TRANSIT, or DELIVERED). Automatically records status history.",
	})
	async updateStatus(@Param("id") shipmentId: string, @Body() dto: UpdateStatusDto, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.updateStatus(shipmentId, dto, userId);
	}
}
