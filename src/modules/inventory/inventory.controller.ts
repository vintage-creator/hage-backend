import { Body, Controller, Get, Param, Post, Patch, Delete, Query, UseGuards, Req, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiOkResponse } from "@nestjs/swagger";
import { InventoryService } from "./inventory.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { CreateInventoryLocationDto } from "./dto/create-inventory-location.dto";
import { UpdateInventoryLocationDto } from "./dto/update-inventory-location.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { InventoryLocationStatus } from "@prisma/client";

@ApiTags("inventory")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
	constructor(private readonly svc: InventoryService) {}

	// ============================================
	// INVENTORY (PRODUCT + WAREHOUSE) ENDPOINTS
	// ============================================
	@Post()
	@ApiOperation({
		summary: "Create a new inventory record",
		description: "Creates or upserts inventory linked to a shipment and warehouse.",
	})
	@ApiOkResponse({
		description: "Inventory successfully created",
		schema: {
			example: {
				id: "inv_01727",
				shipmentId: "shp_abc123",
				warehouseId: "wh_98002",
				origin: {
					address: "Lagos",
					city: "Ikeja",
					state: "Lagos",
					country: "Nigeria",
				},
				destination: {
					address: "Abuja",
					city: "Garki",
					state: "Abuja",
					country: "Nigeria",
				},
				status: "In Storage",
				createdAt: "2025-11-17T10:00:00.000Z",
				createdBy: "user_123",
			},
		},
	})
	async createInventory(@Body() dto: CreateInventoryDto, @Req() req: any) {
		const createdBy = req.user?.id || req.user?.sub;
		return this.svc.createInventory(dto, createdBy);
	}

	@Get("product/:productId/warehouse/:warehouseId")
	@ApiOperation({ summary: "Get inventory for a product in a warehouse" })
	@ApiParam({ name: "productId", description: "Product ID" })
	@ApiParam({ name: "warehouseId", description: "Warehouse ID" })
	async getInventory(@Param("productId") productId: string, @Param("warehouseId") warehouseId: string) {
		return this.svc.getInventory(productId, warehouseId);
	}

	// @Get("overview")
	// @ApiOperation({
	// 	summary: "Get inventory overview with real-time stock levels per warehouse",
	// 	description: "Returns aggregated inventory data showing available, reserved, quarantine, and damaged quantities. Can be filtered by warehouse.",
	// })
	// @ApiQuery({ name: "warehouseId", required: false, description: "Filter by specific warehouse" })
	// async getInventoryOverview(@Query("warehouseId") warehouseId?: string) {
	// 	return this.svc.getInventoryOverview(warehouseId);
	// }

	// @Get("consolidated")
	// @ApiOperation({
	// 	summary: "Get consolidated inventory across all warehouses",
	// 	description: "Aggregates inventory by product across all warehouses, showing total quantities and per-warehouse breakdown",
	// })
	// async getConsolidatedInventory() {
	// 	return this.svc.getConsolidatedInventory();
	// }

	// ============================================
	// INVENTORY LOCATION ENDPOINTS
	// ============================================

	@Post("locations")
	@ApiOperation({
		summary: "Place inventory into a bin (create InventoryLocation)",
		description: "Transactionally creates inventory location, updates bin capacity, and validates special handling requirements",
	})
	async createInventoryLocation(@Body() dto: CreateInventoryLocationDto, @Req() req: any) {
		// Extract user ID from JWT token (assuming it's in req.user)
		const createdBy = req.user?.id || req.user?.sub;
		return this.svc.createInventoryLocation(dto, createdBy);
	}

	// @Get("locations")
	// @ApiOperation({
	// 	summary: "List inventory locations with comprehensive filtering",
	// 	description: "Filter by client, shipment, status, warehouse, bin, rack, zone, condition, and special handling",
	// })
	// @ApiQuery({ name: "clientId", required: false })
	// @ApiQuery({ name: "clientName", required: false })
	// @ApiQuery({ name: "shipmentId", required: false })
	// @ApiQuery({ name: "status", required: false, enum: ["AVAILABLE", "QUARANTINE", "HOLD", "DAMAGED", "RESERVED"] })
	// @ApiQuery({ name: "condition", required: false, enum: ["NEW", "GOOD", "USED", "DAMAGED", "EXPIRED"] })
	// @ApiQuery({ name: "binId", required: false })
	// @ApiQuery({ name: "warehouseId", required: false })
	// @ApiQuery({ name: "rackId", required: false })
	// @ApiQuery({ name: "zoneId", required: false })
	// @ApiQuery({ name: "lotNumber", required: false })
	// @ApiQuery({ name: "isHazardous", required: false, type: Boolean })
	// async listInventoryLocations(
	// 	@Query("clientId") clientId?: string,
	// 	@Query("clientName") clientName?: string,
	// 	@Query("shipmentId") shipmentId?: string,
	// 	@Query("status") status?: string,
	// 	@Query("condition") condition?: string,
	// 	@Query("binId") binId?: string,
	// 	@Query("warehouseId") warehouseId?: string,
	// 	@Query("rackId") rackId?: string,
	// 	@Query("zoneId") zoneId?: string,
	// 	@Query("lotNumber") lotNumber?: string,
	// 	@Query("isHazardous") isHazardous?: boolean
	// ) {
	// 	return this.svc.listInventoryLocations({
	// 		clientId,
	// 		clientName,
	// 		shipmentId,
	// 		status,
	// 		condition,
	// 		binId,
	// 		warehouseId,
	// 		rackId,
	// 		zoneId,
	// 		lotNumber,
	// 		isHazardous,
	// 	});
	// }

	@Get("locations/:id")
	@ApiParam({ name: "id", description: "Inventory Location ID" })
	@ApiOperation({
		summary: "Get single inventory location with full details",
		description: "Returns inventory location with nested bin, rack, zone, product, and warehouse information",
	})
	async getInventoryLocation(@Param("id") id: string) {
		return this.svc.getInventoryLocation(id);
	}

	@Patch("locations/:id")
	@ApiParam({ name: "id", description: "Inventory Location ID" })
	@ApiOperation({
		summary: "Move or update inventory location",
		description: "Transactionally updates quantity, bin location, or metadata with capacity validation and special handling checks",
	})
	async updateInventoryLocation(@Param("id") id: string, @Body() dto: UpdateInventoryLocationDto, @Req() req: any) {
		const updatedBy = req.user?.id || req.user?.sub;
		return this.svc.moveOrUpdateInventoryLocation(id, dto, updatedBy);
	}

	@Patch("locations/:id/status")
	@ApiParam({ name: "id", description: "Inventory ID" })
	@ApiOperation({
		summary: "Update inventory status",
		description: "Update status through the lifecycle: AVAILABLE → RESERVED → etc.",
	})
	async updateInventoryLocationStatus(@Param("id") id: string, @Body() body: { status: InventoryLocationStatus; note?: string }, @Req() req: any) {
		const updatedBy = req.user?.id || req.user?.sub;
		return this.svc.updateInventoryStatus(id, body.status, updatedBy, body.note);
	}

	@Delete("locations/:id")
	@ApiParam({ name: "id", description: "Inventory Location ID" })
	@ApiOperation({
		summary: "Delete inventory location and adjust totals",
		description: "Transactionally removes inventory location and decrements bin and warehouse totals",
	})
	async deleteInventoryLocation(@Param("id") id: string) {
		return this.svc.deleteInventoryLocation(id);
	}

	// ============================================
	// RACK-LEVEL TRACKING ENDPOINTS
	// ============================================

	// @Get("rack/:rackId")
	// @ApiParam({ name: "rackId", description: "Rack ID" })
	// @ApiOperation({
	// 	summary: "Get all inventory in a specific rack",
	// 	description: "Track inventory levels at the rack level as required by MVP",
	// })
	// async getInventoryByRack(@Param("rackId") rackId: string) {
	// 	return this.svc.getInventoryByRack(rackId);
	// }

	// ============================================
	// REPORTING ENDPOINTS
	// ============================================

	// @Get("reports/inventory")
	// @ApiOperation({
	// 	summary: "Generate comprehensive inventory status report",
	// 	description: "Hierarchical report organized by warehouse → zone → rack → bin with all inventory details",
	// })
	// @ApiQuery({ name: "warehouseId", required: false, description: "Filter by warehouse" })
	// @ApiQuery({ name: "rackId", required: false, description: "Filter by rack" })
	// async generateInventoryReport(@Query("warehouseId") warehouseId?: string, @Query("rackId") rackId?: string) {
	// 	return this.svc.generateInventoryReport(warehouseId, rackId);
	// }

	/**
	 * GET /inventory/locations/formatted
	 * Returns all inventory locations formatted for UI display
	 * Matches the table structure from the image
	 * @param warehouseId - Required warehouse filter
	 */
	@Get("locations")
	@ApiOperation({
		summary: "Get all inventory locations by warehouse",
		description: "Returns inventory locations belonging to a specific warehouse ID with pagination",
	})
	@ApiQuery({ name: "warehouseId", required: true, type: String })
	@ApiQuery({ name: "page", required: false, type: Number })
	@ApiQuery({ name: "limit", required: false, type: Number })
	@ApiResponse({ status: 200, description: "Successfully retrieved inventory locations for warehouse" })
	@ApiResponse({ status: 400, description: "Bad Request - warehouseId is required" })
	async getInventoryByWarehouse(@Query("warehouseId") warehouseId: string, @Query("page") page: string, @Query("limit") limit: string) {
		if (!warehouseId) {
			throw new BadRequestException("warehouseId is required");
		}

		const pageNum = page ? parseInt(page) : 1;
		const limitNum = limit ? parseInt(limit) : 10;

		return this.svc.getInventoryByWarehouseFormatted(warehouseId, pageNum, limitNum);
	}
}
