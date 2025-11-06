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
} from "@nestjs/swagger";
import { WarehousesService } from "./warehouses.service";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
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

  // Specific routes first to avoid ambiguity with :id
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

  // generic: placed after more-specific routes
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
