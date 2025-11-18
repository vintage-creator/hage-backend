import { IsString, IsOptional, IsNotEmpty, ValidateNested } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { LocationDto } from "../../shipments/dto/create-shipment.dto";

export class CreateInventoryDto {
	@ApiProperty({
		description: "ID of the shipment associated with this inventory record",
		example: "shp_abc123",
	})
	@IsString()
	@IsNotEmpty()
	shipmentId!: string;

	@ApiProperty({
		description: "ID of the warehouse storing the item",
		example: "wh_98002",
	})
	@IsString()
	@IsNotEmpty()
	warehouseId!: string;

	@ApiProperty({
		description: "Origin details where the shipment started",
		type: LocationDto,
	})
	@ValidateNested()
	@Type(() => LocationDto)
	@IsNotEmpty()
	origin!: LocationDto;

	@ApiProperty({
		description: "Destination details where the shipment is heading",
		type: LocationDto,
	})
	@ValidateNested()
	@Type(() => LocationDto)
	@IsNotEmpty()
	destination!: LocationDto;

	@ApiPropertyOptional({
		description: "Client name associated with this inventory item",
		example: "John Doe",
	})
	@IsOptional()
	@IsString()
	clientName?: string;

	@ApiPropertyOptional({
		description: "Pickup date for the item (ISO string)",
		example: "2025-12-01T10:00:00.000Z",
	})
	@IsOptional()
	@IsString()
	pickupDate?: string;

	@ApiPropertyOptional({
		description: "Rack ID where the item is stored",
		example: "rackid",
	})
	@IsOptional()
	@IsString()
	rackId?: string;

	@ApiPropertyOptional({
		description: "Bin ID inside a rack",
		example: "binid",
	})
	@IsOptional()
	@IsString()
	binId?: string;

	@ApiPropertyOptional({
		description: "Zone inside the warehouse",
		example: "zoneid",
	})
	@IsOptional()
	@IsString()
	zoneId?: string;

	@ApiPropertyOptional({
		description: "Current status of the item",
		example: "In Storage",
	})
	@IsOptional()
	@IsString()
	status?: string;

	@ApiPropertyOptional({
		description: "Condition of the item",
		example: "New",
	})
	@IsOptional()
	@IsString()
	condition?: string;

	@ApiPropertyOptional({
		description: "Special handling instructions",
		example: "Fragile",
	})
	@IsOptional()
	@IsString()
	specialHandling?: string;

	@ApiPropertyOptional({
		description: "Cargo type (e.g., Liquid, Solid, Hazardous)",
		example: "Electronics",
	})
	@IsOptional()
	@IsString()
	cargoType?: string;
}
