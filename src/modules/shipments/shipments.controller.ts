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

	// Protected: Create shipment with file upload (documents)
	@Post()
	@UseGuards(JwtAuthGuard)
	// @Roles("LOGISTIC_SERVICE_PROVIDER", "ENTERPRISE", "DISTRIBUTOR")
	@ApiBearerAuth("access-token")
	@ApiConsumes("multipart/form-data")
	@UseInterceptors(FilesInterceptor("documents"))
	@ApiBody({
		description: "Create a new shipment record",
		type: CreateShipmentDto,
		examples: {
			example1: {
				summary: "Basic Air Freight example",
				value: {
					orderId: "SHP-67890",
					clientName: "Acme Logistics",
					email: "client@acme.com",
					phone: "+2348123456789",
					cargoType: "Electronics",
					tons: 2,
					weight: 1200,
					handlingInstructions: "Handle with care",
					origin: {
						country: "Nigeria",
						state: "Lagos",
						address: "12 Marina Street",
					},
					destination: {
						country: "Ghana",
						state: "Accra",
						address: "45 High Street",
					},
					pickupMode: "PICKUP",
					pickupDate: "2025-10-20T09:00:00Z",
					deliveryDate: "2025-10-25T15:00:00Z",
					serviceType: "AIR",
					baseFrieght: 1200,
					handlingFee: 100,
					insuranceFee: 50,
				},
			},
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
				serviceType: "AIR",
				status: "PENDING",
				createdAt: "2025-10-18T18:00:00.000Z",
			},
		},
	})
	create(@Body() dto: any, @Req() req: Request, @UploadedFiles() files: Express.Multer.File[]) {
		// use the authenticated user's ID from token
		const userId = (req.user as any)?.id;
		return this.svc.create(dto, userId, files);
	}

	@Get("generate-tracking")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	generateTracking() {
		return { trackingNumber: this.svc.generateOrderTrackingId() };
	}

	// ACCEPT & ASSIGN SHIPMENT
	@Patch(":id/assign")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("LOGISTIC_SERVICE_PROVIDER", "CROSS_BORDER_LOGISTICS") // Only LSP can assign
	@ApiBearerAuth("access-token")
	async acceptAndAssign(@Param("id") shipmentId: string, @Body() dto: AssignShipmentDto, @Req() req: Request) {
		const userId = (req.user as any)?.id;
		return this.svc.acceptAndAssign(shipmentId, dto, userId);
	}

	// Public: List all shipments
	@Get()
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiQuery({
		name: "status",
		required: false,
		description: "Filter shipments by status (e.g., PENDING, IN_TRANSIT, DELIVERED)",
	})
	@ApiResponse({
		status: 200,
		description: "List of all shipments",
		schema: {
			example: [
				{
					id: "clx0a12340000a3l45d8x9e7t",
					orderId: "SHP-12345",
					clientName: "Acme Logistics",
					serviceType: "AIR",
					status: "PENDING",
				},
				{
					id: "clx0b56780000b5p67y2z3q9r",
					orderId: "SHP-67890",
					clientName: "Global Movers",
					serviceType: "OCEAN",
					status: "DELIVERED",
				},
			],
		},
	})
	async findAll(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAll(filters, req.user.id);
	}

	// GET /shipments/my/assigned - For transporters
	@Get("my/assigned")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("TRANSPORTER")
	@ApiBearerAuth("access-token")
	async getMyAssignedShipments(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAllForTransporter(req.user.id, filters);
	}

	// GET /shipments/my/created - For customers
	@Get("my/created")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	async getMyCreatedShipments(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAllForCustomer(req.user.id, filters);
	}

	// GET /shipments/admin/all - Explicit LSP endpoint
	@Get("admin/all")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("LOGISTIC_SERVICE_PROVIDER")
	@ApiBearerAuth("access-token")
	async getAllShipmentsAdmin(@Query() filters: FilterShipmentDto, @Req() req: any) {
		return this.svc.findAllForLSP(req.user.id, filters);
	}

	@Get("analytics/dashboard")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiOperation({ summary: "Get dashboard analytics and metrics" })
	@ApiResponse({
		status: 200,
		description: "Dashboard analytics retrieved successfully",
		schema: {
			example: {
				activeVehicles: 3,
				shipmentsInTransit: 5,
				completedDeliveries: 22,
				delayedShipments: 8,
				averageDeliveryTime: {
					hours: 2,
					minutes: 18,
					totalMinutes: 138,
				},
				totalShipments: 38,
				byStatus: {
					pending: 2,
					accepted: 1,
					inTransit: 5,
					completed: 22,
					cancelled: 0,
					delayed: 8,
				},
				recentActivity: [
					{
						shipmentId: "clx123",
						orderId: "SHP-2025-12345",
						status: "IN_TRANSIT",
						updatedAt: "2025-10-21T10:30:00Z",
					},
				],
			},
		},
	})
	async getDashboardAnalytics(@Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.getDashboardAnalytics(userId);
	}

	@Get(":id")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiParam({ name: "id", description: "Shipment ID", example: "clx0a12340000a3l45d8x9e7t" })
	@ApiResponse({
		status: 200,
		description: "Details of a single shipment",
		schema: {
			example: {
				id: "clx0a12340000a3l45d8x9e7t",
				orderId: "SHP-12345",
				clientName: "Acme Logistics",
				cargoType: "Electronics",
				weight: 1200,
				serviceType: "AIR",
				status: "PENDING",
				createdAt: "2025-10-18T18:00:00.000Z",
			},
		},
	})
	findOne(@Param("id") id: string, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.findOne(id, userId);
	}

	@Get("track/:orderId")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	async trackByOrderId(@Param("orderId") orderId: string, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.trackByOrderId(orderId, userId);
	}

	@Patch(":id")
	@UseGuards(JwtAuthGuard, RolesGuard)
	@Roles("LOGISTIC_SERVICE_PROVIDER", "TRANSPORTER", "LAST_MILE_PROVIDER")
	@ApiBearerAuth("access-token")
	@ApiParam({ name: "id", description: "Shipment ID" })
	@ApiBody({
		description: "Update shipment details",
		schema: {
			example: {
				status: "IN_TRANSIT",
				deliveryDate: "2025-10-22T10:00:00Z",
			},
		},
	})
	@ApiResponse({
		status: 200,
		description: "Shipment updated successfully",
	})
	update(@Param("id") id: string, @Body() dto: UpdateShipmentDto, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.update(id, dto, userId);
	}

	@Delete(":id")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@ApiParam({ name: "id", description: "Shipment ID" })
	@ApiResponse({
		status: 200,
		description: "Shipment deleted successfully",
	})
	remove(@Param("id") id: string, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.remove(id, userId);
	}

	@Patch(":id/status")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	async updateStatus(@Param("id") shipmentId: string, @Body() dto: UpdateStatusDto, @Req() req: Request) {
		const userId = (req.user as any).id;
		return this.svc.updateStatus(shipmentId, dto, userId);
	}
}
