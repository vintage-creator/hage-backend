import { Controller, Post, Body, Get, Param, Patch, Delete, UseGuards, UseInterceptors, UploadedFiles, Req, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody, ApiResponse, ApiQuery, ApiParam, ApiOperation } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IsNumber, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { Request } from 'express';
import { AssignShipmentDto } from './dto/assign-shipment.dto';
import { FilterShipmentDto, StatusFilterEnum } from './dto/filter-shipment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class UpdateLocationDto {
   @ApiProperty() @IsNumber() @IsNotEmpty() @Type(() => Number) lat!: number;
   @ApiProperty() @IsNumber() @IsNotEmpty() @Type(() => Number) lng!: number;
}

class CalculatePriceDto {
   @ApiPropertyOptional() @IsString() @IsOptional() shipmentType?: string;
   @ApiPropertyOptional() @IsNumber() @Min(0) @Type(() => Number) @IsOptional() baseFrieght?: number;
   @ApiPropertyOptional() @IsNumber() @Min(0) @Type(() => Number) @IsOptional() handlingFee?: number;
   @ApiPropertyOptional() @IsNumber() @Min(0) @Type(() => Number) @IsOptional() insuranceFee?: number;
   @ApiPropertyOptional() @IsNumber() @Min(0) @Type(() => Number) @IsOptional() cargoDuty?: number;
}

@ApiTags('shipments')
@Controller('shipments')
export class ShipmentsController {
   constructor(private readonly svc: ShipmentsService) {}

   // CALCULATE PRICE (summary screen)
   @Post('calculate-price')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({ summary: 'Calculate shipment price breakdown', description: 'Returns shippingCost, cargoDuty, transactionFee, and total for the summary screen.' })
   calculatePrice(@Body() dto: CalculatePriceDto) {
      return this.svc.calculatePrice({ ...dto, shipmentType: dto.shipmentType ?? 'INLAND' });
   }

   // ✅ CREATE SHIPMENT
   @Post()
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiConsumes('multipart/form-data')
   @UseInterceptors(FilesInterceptor('documents'))
   @ApiOperation({
      summary: 'Create a new shipment',
      description: 'Allows authenticated users (LSPs, enterprises, or distributors) to create a new shipment record. Supports uploading shipment-related documents (bill of lading, invoice, etc.).',
   })
   @ApiBody({
      description: 'Create a new shipment (form-data). Use field name `documents` for file uploads.',
      schema: {
         type: 'object',
         properties: {
            shipmentType: { type: 'string', enum: ['INLAND', 'CROSS_BORDER'], default: 'INLAND' },
            visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'ASSIGNED'], default: 'PUBLIC' },
            freightType: { type: 'string', enum: ['SEA_FREIGHT', 'AIR_FREIGHT'], description: 'Cross-border only' },
            orderId: { type: 'string' },
            clientName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            nameOfItem: { type: 'string' },
            customerName: { type: 'string' },
            customerPhone: { type: 'string' },
            additionalNote: { type: 'string' },
            cargoType: { type: 'string' },
            tons: { type: 'number' },
            weight: { type: 'number' },
            truckType: { type: 'string', description: 'Inland only — e.g. Tipper, Flatbed' },
            truckSize: { type: 'string', description: 'Inland only — e.g. 20 Tons' },
            destinationCountry: { type: 'string', description: 'Cross-border only' },
            cargoDuty: { type: 'number', description: 'Cross-border only' },
            origin: { type: 'object', properties: { country: { type: 'string' }, state: { type: 'string' }, address: { type: 'string' }, phone: { type: 'string' } } },
            destination: { type: 'object', properties: { country: { type: 'string' }, state: { type: 'string' }, address: { type: 'string' }, phone: { type: 'string' } } },
            pickupMode: { type: 'string', enum: ['AIR_FREIGHT', 'SEA_FREIGHT', 'ROAD'], default: 'ROAD' },
            pickupDate: { type: 'string', format: 'date-time' },
            pickupTimeslot: { type: 'string', description: 'e.g. Morning, Afternoon, Evening' },
            bookingOfficerPhone: { type: 'string' },
            waybillUrl: { type: 'string' },
            deliveryDate: { type: 'string', format: 'date-time' },
            orderNumber: { type: 'string' },
            serviceType: { type: 'string', enum: ['EXPRESS_SHIPPING', 'REGULAR_SHIPPING', 'COLDCHAIN_SHIPPING'] },
            baseFrieght: { type: 'number' },
            handlingFee: { type: 'number' },
            insuranceFee: { type: 'number' },
            shoppingCost: { type: 'number' },
            tonnage: { type: 'string' },
            transactionFee: { type: 'number' },
            transporterId: { type: 'string', description: 'Pre-select a transporter (PRIVATE/ASSIGNED only)' },
            documents: { type: 'array', items: { type: 'string', format: 'binary' } },
         },
         required: ['shipmentType'],
      },
   })
   @ApiResponse({
      status: 201,
      description: 'Shipment successfully created',
      schema: {
         example: {
            id: 'clx0a12340000a3l45d8x9e7t',
            orderId: 'SHP-12345',
            clientName: 'Acme Logistics',
            serviceType: 'EXPRESS_SHIPPING',
            status: 'PENDING',
            createdAt: '2025-10-18T18:00:00.000Z',
         },
      },
   })
   create(@Body() dto: any, @Req() req: Request, @UploadedFiles() files: Express.Multer.File[]) {
      const userId = (req.user as any)?.id;
      return this.svc.create(dto, userId, files);
   }

   // GENERATE TRACKING ID
   @Get('generate-tracking')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Generate a new shipment tracking number',
      description: 'Generates a unique tracking number for use when creating shipments.',
   })
   async generateTracking() {
      const trackingNumber = await this.svc.generateOrderTrackingId();
      return { trackingNumber };
   }

   // ASSIGN SHIPMENT
   @ApiParam({
      name: 'id',
      description: 'Shipment ID',
      example: 'clx0a12340000a3l45d8x9e7t',
   })
   @ApiBody({
      description: 'Assign a transporter and/or warehouse to a shipment. Only LSP/CROSS_BORDER_LOGISTICS may call.',
      type: AssignShipmentDto,
      examples: {
         assignBoth: {
            summary: 'Assign transporter and warehouse',
            value: {
               transporterId: 'user_transporter_id_123',
               warehouseId: 'warehouse_id_456',
            },
         },
         assignWarehouseOnly: {
            summary: 'Only assign a warehouse',
            value: { warehouseId: 'warehouse_id_456' },
         },
      },
   })
   @Patch(':id/assign')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('LOGISTIC_SERVICE_PROVIDER', 'CROSS_BORDER_LOGISTICS')
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Accept and assign a shipment',
      description: `
	Allows Logistic Service Providers (LSPs) to accept and assign a shipment to 
	a transporter, warehouse, and optionally specify zone, rack, and bin locations 
	for warehouse placement.`,
   })
   @ApiBody({ type: AssignShipmentDto })
   async acceptAndAssign(@Param('id') shipmentId: string, @Body() dto: AssignShipmentDto, @Req() req: Request) {
      const userId = (req.user as any)?.id;
      return this.svc.acceptAndAssign(shipmentId, dto, userId);
   }

   // ✅ GET ALL SHIPMENTS
   /**
    * Get all shipments with optional filtering
    * Supports filtering by: new_orders, pending, in_warehouse, or no filter (all)
    */
   @Get()
   @HttpCode(HttpStatus.OK)
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Get all shipments with optional status filtering',
      description: `
      Retrieve shipments based on user role and optional filters.
      
      **Status Filters:**
      - new_orders: Shipments pending acceptance
      - pending: Accepted, en route, or picked up shipments
      - in_warehouse: Shipments arrived at warehouse
      - in_transit: Shipments currently in transit
      - completed: Delivered shipments
      - cancelled: Cancelled shipments
      - all (or no filter): All shipments
      
      **Access Control:**
      - LSP: Can view all shipments
      - Transporter: Only assigned shipments
      - Enterprise/Distributor: Only created shipments
      - End User: Only their customer shipments
    `,
   })
   @ApiResponse({
      status: 200,
      description: 'Shipments retrieved successfully',
      schema: {
         example: {
            success: true,
            data: [
               {
                  id: 'uuid',
                  orderId: 'SHP-2025-12345',
                  clientName: 'John Doe',
                  status: 'PENDING_ACCEPTANCE',
                  cargoType: 'Electronics',
                  weight: 100,
                  origin: { country: 'Nigeria', city: 'Lagos' },
                  destination: { country: 'Ghana', city: 'Accra' },
                  createdAt: '2025-01-15T10:00:00Z',
               },
            ],
            pagination: {
               total: 50,
               page: 1,
               limit: 20,
               totalPages: 3,
            },
            summary: {
               newOrders: 10,
               pending: 15,
               inWarehouse: 8,
               inTransit: 12,
               completed: 3,
               cancelled: 2,
            },
            meta: {
               userRole: 'LOGISTIC_SERVICE_PROVIDER',
               userRoleType: 'CROSS_BORDER_LOGISTICS',
               accessLevel: 'full_access',
               appliedFilters: {
                  statusFilter: 'new_orders',
               },
            },
         },
      },
   })
   @ApiQuery({
      name: 'statusFilter',
      required: false,
      enum: StatusFilterEnum,
      description: 'Filter shipments by status category',
   })
   @ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      example: 1,
      description: 'Page number',
   })
   @ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 20,
      description: 'Items per page',
   })
   async getAllShipments(@Query() filters: FilterShipmentDto, @Req() req: any) {
      const userId = req.user.sub || req.user.id;
      return this.svc.findAll(filters, userId);
   }

   // ✅ TRANSPORTER'S SHIPMENTS
   @Get('my/assigned')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('TRANSPORTER', 'LAST_MILE_DELIVERY')
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Get shipments assigned to a transporter',
      description: 'Fetches all shipments currently assigned to the authenticated transporter account for fulfillment.',
   })
   async getMyAssignedShipments(@Query() filters: FilterShipmentDto, @Req() req: any) {
      return this.svc.findAllForTransporter(req.user.id, filters);
   }

   // ✅ TRANSPORTER'S NEW REQUESTS (Home screen — Accept Shipment / Reject Shipment)
   @Get('requests/new')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('TRANSPORTER', 'LAST_MILE_DELIVERY')
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: "Get new shipment requests awaiting the transporter's decision",
      description: 'Shipments directly assigned to this transporter that are still PENDING — shown on the transporter "New Request" screen with Accept/Reject actions.',
   })
   async getNewShipmentRequests(@Req() req: any) {
      return this.svc.getNewShipmentRequests(req.user.id);
   }

   // ✅ TRANSPORTER ACCEPTS A SHIPMENT REQUEST
   @Patch(':id/accept')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('TRANSPORTER', 'LAST_MILE_DELIVERY')
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Accept a shipment request',
      description: 'Transporter accepts a shipment that was directly assigned to them. Moves the shipment from PENDING to ACCEPTED.',
   })
   async acceptShipmentRequest(@Param('id') id: string, @Req() req: any) {
      return this.svc.respondToShipmentRequest(id, req.user.id, 'ACCEPT');
   }

   // ✅ TRANSPORTER REJECTS A SHIPMENT REQUEST
   @Patch(':id/reject')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('TRANSPORTER', 'LAST_MILE_DELIVERY')
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiBody({
      description: 'Optional reason for rejecting the shipment',
      required: false,
      schema: { type: 'object', properties: { reason: { type: 'string', example: 'Vehicle unavailable for this route' } } },
   })
   @ApiOperation({
      summary: 'Reject a shipment request',
      description: 'Transporter rejects a shipment that was directly assigned to them. The shipment is unassigned and moved to CANCELLED so it can be reassigned.',
   })
   async rejectShipmentRequest(@Param('id') id: string, @Body('reason') reason: string | undefined, @Req() req: any) {
      return this.svc.respondToShipmentRequest(id, req.user.id, 'REJECT', reason);
   }

   // ✅ CUSTOMER'S SHIPMENTS
   @Get('my/created')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Get shipments created by the authenticated user',
      description: 'Returns a list of shipments that were created by the currently logged-in customer or enterprise account.',
   })
   async getMyCreatedShipments(@Query() filters: FilterShipmentDto, @Req() req: any) {
      return this.svc.findAllForCustomer(req.user.id, filters);
   }

   // ✅ LSP DASHBOARD SHIPMENTS
   @Get('admin/all')
   @UseGuards(JwtAuthGuard)
   // @Roles("LOGISTIC_SERVICE_PROVIDER")
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Get all shipments (LSP view)',
      description: 'Allows a Logistic Service Provider (LSP) to view all shipments across their managed network. Supports optional filters.',
   })
   async getAllShipmentsAdmin(@Query() filters: FilterShipmentDto, @Req() req: any) {
      return this.svc.findAllForLSP(req.user.id, filters);
   }

   // ✅ DASHBOARD ANALYTICS
   @Get('analytics/dashboard')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Get shipment analytics dashboard',
      description: 'Returns key shipment performance metrics — including total shipments, delayed shipments, delivery times, and recent activity.',
   })
   async getDashboardAnalytics(@Req() req: Request) {
      const userId = (req.user as any)?.id;
      return this.svc.getDashboardAnalytics(userId);
   }

   @Get('customer/overview')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Get enterprise/end-user shipment overview',
      description: 'Returns active and settled shipment sections for enterprise and individual users.',
   })
   getCustomerShipmentOverview(@Req() req: Request) {
      const userId = (req.user as any)?.id || (req.user as any)?.sub;
      return this.svc.getCustomerShipmentOverview(userId);
   }

   @Get('customer/:id/details')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Get enterprise/end-user shipment detail',
      description: 'Returns package information, live map coordinates, transporter contact/call metadata, timeline, settled shipment details, customs status, and review metadata.',
   })
   getCustomerShipmentDetails(@Param('id') id: string, @Req() req: Request) {
      const userId = (req.user as any)?.id || (req.user as any)?.sub;
      return this.svc.getCustomerShipmentDetails(id, userId);
   }

   // ✅ GET SHIPMENT BY ID
   @Get(':id')
   // @UseGuards(JwtAuthGuard)
   // @ApiBearerAuth("access-token")
   @ApiParam({
      name: 'id',
      description: 'Shipment ID',
      example: 'clx0a12340000a3l45d8x9e7t',
   })
   @ApiOperation({
      summary: 'Get shipment by ID',
      description: 'Fetches detailed shipment information, including cargo details, status, origin, and destination.',
   })
   findOne(@Param('id') id: string, @Req() req: Request) {
      const userId = (req.user as any)?.id;
      return this.svc.findOne(id, userId);
   }

   // ✅ TRACK SHIPMENT BY ORDER ID
   @Get('track/:orderId')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Track shipment by tracking number',
      description: 'Allows authenticated users to track a shipment using its tracking number (orderId).',
   })
   async trackByOrderId(@Param('orderId') orderId: string, @Req() req: Request) {
      const userId = (req.user as any)?.id;
      return this.svc.trackByOrderId(orderId, userId);
   }

   // ✅ UPDATE SHIPMENT
   @ApiParam({
      name: 'id',
      description: 'Shipment ID',
      example: 'clx0a12340000a3l45d8x9e7t',
   })
   @ApiBody({
      description: 'Update shipment details. Fields are mostly optional — include only fields you want to change.',
      type: UpdateShipmentDto,
      examples: {
         changeDates: {
            summary: 'Update delivery/pickup dates',
            value: {
               pickupDate: '2025-10-21T09:00:00Z',
               deliveryDate: '2025-10-25T15:00:00Z',
            },
         },
         changePricing: {
            summary: 'Update pricing',
            value: {
               baseFrieght: 1500,
               handlingFee: 120,
               insuranceFee: 60,
            },
         },
      },
   })
   @Patch(':id')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('LOGISTIC_SERVICE_PROVIDER', 'TRANSPORTER', 'LAST_MILE_PROVIDER')
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Update shipment details',
      description: 'Allows authorized roles (LSPs, transporters, last-mile providers) to update shipment details such as delivery date or status.',
   })
   update(@Param('id') id: string, @Body() dto: UpdateShipmentDto, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.update(id, dto, userId);
   }

   // ✅ GET SHIPMENT LOCATION
   @Get(':id/location')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Get shipment coordinates',
      description: 'Returns pickup, delivery, and current driver coordinates for rendering on the map.',
   })
   async getLocation(@Param('id') id: string) {
      return this.svc.getLocation(id);
   }

   // ✅ UPDATE DRIVER LOCATION
   @Patch(':id/location')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('TRANSPORTER', 'LAST_MILE_PROVIDER')
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: "Update driver's current location",
      description: "Called by the driver's app to update the shipment's real-time GPS coordinates for map tracking.",
   })
   async updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
      return this.svc.updateCurrentLocation(id, dto.lat, dto.lng);
   }

   // ✅ DELETE SHIPMENT
   @Delete(':id')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Delete a shipment',
      description: 'Allows the creator or an admin to permanently delete a shipment record. Use with caution — this cannot be undone.',
   })
   remove(@Param('id') id: string, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.remove(id, userId);
   }

   // ✅ UPDATE SHIPMENT STATUS
   @ApiParam({
      name: 'id',
      description: 'Shipment ID',
      example: 'clx0a12340000a3l45d8x9e7t',
   })
   @ApiBody({
      description: 'Change shipment status. `status` must be one of your ShipmentStatus enum values. `note` is optional.',
      type: UpdateStatusDto,
      examples: {
         pickUp: {
            summary: 'Mark as picked up',
            value: { status: 'PICKED_UP', note: 'Picked up by transporter X' },
         },
         inTransit: {
            summary: 'Mark in transit',
            value: { status: 'IN_TRANSIT' },
         },
      },
   })
   @Patch(':id/status')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Update shipment status',
      description: 'Updates the current status of a shipment (e.g., from PENDING to IN_TRANSIT, or DELIVERED). Automatically records status history.',
   })
   async updateStatus(@Param('id') shipmentId: string, @Body() dto: UpdateStatusDto, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.updateStatus(shipmentId, dto, userId);
   }
}
