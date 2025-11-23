import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  Query,
  UseGuards,
  Request,
  UnauthorizedException,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiConsumes
} from "@nestjs/swagger";
import { WarehousesService } from "./warehouses.service";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { WarehouseStatus } from '@prisma/client';
import { CreateZoneDto } from "./dto/create-zone.dto";
import { CreateRackDto } from "./dto/create-rack.dto";
import { CreateBinDto } from "./dto/create-bin.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@ApiTags("warehouses")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly svc: WarehousesService) {}

  @Post()
  @ApiOperation({ summary: "Create a warehouse" })
  @ApiResponse({ status: 201, description: "Warehouse created" })
  @ApiBody({ type: CreateWarehouseDto })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(
    @Body() dto: CreateWarehouseDto,
    @Request() req: any
  ): Promise<any> {
    const authUserId = req.user?.sub ?? req.user?.id;
    if (!authUserId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.svc.createWarehouse(dto, authUserId);
  }

  @Get()
  @ApiOperation({ summary: "List warehouses (optionally by companyId)" })
  @ApiResponse({ status: 200, description: "List of warehouses (paginated)" })
  async list(
    @Query("companyId") companyId?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("perPage", new DefaultValuePipe(20), ParseIntPipe) perPage = 20
  ) {
    const p = Math.max(1, page);
    const pp = Math.min(100, Math.max(1, perPage));
    return this.svc.listWarehouses(companyId, p, pp);
  }

  @Get(":id/capacity")
  @ApiParam({ name: "id", description: "Warehouse id" })
  @ApiOperation({
    summary:
      "Get compact capacity summary for a warehouse (used, reserved, available, computedStatus)",
  })
  async capacity(@Param("id") id: string): Promise<any> {
    return this.svc.getWarehouseCapacity(id);
  }

  @Post(":id/zones")
  @ApiParam({ name: "id", description: "Warehouse id" })
  @ApiOperation({ summary: "Create a zone inside a warehouse" })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createZone(
    @Param("id") id: string,
    @Body() dto: CreateZoneDto
  ): Promise<any> {
    return this.svc.createZone(id, dto);
  }

  @Post("zones/:zoneId/racks")
  @ApiParam({ name: "zoneId", description: "Zone id" })
  @ApiOperation({ summary: "Create a rack inside a zone" })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createRack(
    @Param("zoneId") zoneId: string,
    @Body() dto: CreateRackDto
  ): Promise<any> {
    return this.svc.createRack(zoneId, dto);
  }

  @Post("racks/:rackId/bins")
  @ApiParam({ name: "rackId", description: "Rack id" })
  @ApiOperation({ summary: "Create a bin inside a rack" })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createBin(
    @Param("rackId") rackId: string,
    @Body() dto: CreateBinDto
  ): Promise<any> {
    return this.svc.createBin(rackId, dto);
  }

  @Get("bins/:binId/availability")
  @ApiParam({ name: "binId", description: "Bin id" })
  @ApiOperation({ summary: "Get availability details for a bin" })
  async binAvailability(@Param("binId") binId: string): Promise<any> {
    return this.svc.getBinAvailability(binId);
  }

  @Get(":id")
  @ApiParam({ name: "id", description: "Warehouse id" })
  @ApiOperation({
    summary: "Get warehouse details (zones → racks → bins) with computed usage",
  })
  async get(@Param("id") id: string): Promise<any> {
    return this.svc.getWarehouse(id);
  }
  @Patch(":id")
  @ApiParam({ name: "id", description: "Warehouse id" })
  @ApiOperation({ summary: "Update warehouse" })
  @ApiConsumes("application/x-www-form-urlencoded")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { 
          type: "string", 
          title: "Warehouse Name",
          description: "The official name of the warehouse.",
          example: "Main Distribution Center" 
        },
        country: { 
          type: "string",
          title: "Country",
          description: "Country where the warehouse is located.",
          example: "Nigeria"
        },
        city: { 
          type: "string",
          title: "City",
          description: "City where the warehouse operates.",
          example: "Lagos" 
        },
        address: { 
          type: "string",
          title: "Full Address",
          description: "Warehouse street address.",
          example: "42 Industrial Layout, Ikeja"
        },
        totalCapacity: { 
          type: "integer",
          minimum: 0,
          title: "Total Capacity",
          description: "Maximum storage capacity of the warehouse.",
          example: 1500
        },
        capacityUnit: { 
          type: "string",
          title: "Capacity Unit",
          description: "Unit of capacity measurement (e.g. Square Feet (sq ft), Square Meters (m²), Cubic Feet (cu ft), Cubic Meters (m³)).",
          example: "sq ft"
        },
        status: {
          type: "string",
          title: "Warehouse Status",
          description: "Operational state of the warehouse.",
          enum: Object.values(WarehouseStatus),
          example: "ARRIVAL"
        },
        numZones: { 
          type: "integer",
          minimum: 0,
          title: "Number of Zones",
          description: "How many storage zones the warehouse contains.",
          example: 4
        },
        numRows: { 
          type: "integer",
          minimum: 0,
          title: "Number of Rows",
          description: "Total rows across all zones.",
          example: 12
        },
        numRacks: { 
          type: "integer",
          minimum: 0,
          title: "Number of Racks",
          description: "Total racks available for storage.",
          example: 50
        },
        numBinsPerRack: { 
          type: "integer",
          minimum: 0,
          title: "Bins per Rack",
          description: "Number of bins in each rack.",
          example: 30
        },
        allowsTemperature: { 
          type: "boolean",
          title: "Temperature-Controlled",
          description: "Whether the warehouse supports temperature-controlled storage.",
          example: false
        },
        allowsHazardous: { 
          type: "boolean",
          title: "Hazardous Materials Allowed",
          description: "Whether hazardous material storage is supported.",
          example: false
        },
        allowsQuarantine: { 
          type: "boolean",
          title: "Quarantine Area Available",
          description: "Whether the warehouse supports quarantine storage.",
          example: false
        },
        allowsNone: { 
          type: "boolean",
          title: "No Special Requirements",
          description: "If true, the warehouse has no special storage restrictions.",
          example: true
        },
      },
    },
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateWarehouseDto
  ): Promise<any> {
    return this.svc.updateWarehouse(id, dto);
  }

  @Delete(":id")
  @ApiParam({ name: "id", description: "Warehouse id" })
  @ApiQuery({
    name: "force",
    required: false,
    type: Boolean,
    description: "Force delete warehouse even if it has zones or inventory",
  })
  @ApiOperation({ summary: "Delete warehouse" })
  async remove(
    @Param("id") id: string,
    @Query("force") force?: boolean
  ): Promise<any> {
    return this.svc.deleteWarehouse(id, force);
  }

  @Get("suggested/:id")
  @ApiParam({ name: "id", description: "Warehouse id" })
  @ApiOperation({ summary: "Get suggested Location" })
  async suggestedLocation(@Param("id") id: string): Promise<any> {
    return this.svc.suggestLocation(id);
  }

  @Get(":id/racks")
  @ApiOperation({ summary: "List racks for a warehouse" })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Search by rack or zone name",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (default: 1)",
  })
  @ApiQuery({
    name: "perPage",
    required: false,
    type: Number,
    description: "Results per page (default: 20)",
  })
  async getRacks(
    @Param("id") warehouseId: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("perPage") perPage?: string
  ) {
    return this.svc.getRacksForWarehouse(warehouseId, {
      search,
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 20,
    });
  }
}
