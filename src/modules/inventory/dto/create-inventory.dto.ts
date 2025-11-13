import { IsString, IsOptional, IsInt, Min, ValidateNested, IsNotEmpty } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { LocationDto } from "../../shipments/dto/create-shipment.dto";

export class CreateInventoryDto {
	@ApiProperty({ description: "ID of the product associated with the inventory" })
	@IsString()
	shipmentId!: string;

	@ApiProperty({ description: "ID of the warehouse where the inventory is stored" })
	@IsString()
	warehouseId!: string;

	@ValidateNested({ message: "Origin must be a valid location object" })
	@Type(() => LocationDto)
	@IsNotEmpty({ message: "Origin is required" })
	origin!: LocationDto;

	@ValidateNested({ message: "Destination must be a valid location object" })
	@Type(() => LocationDto)
	@IsNotEmpty({ message: "Destination is required" })
	destination!: LocationDto;

	@ApiPropertyOptional({ description: "Client name associated with this inventory record" })
	@IsOptional()
	@IsString()
	clientName?: string;

	@IsOptional()
	pickupDate?: string;

	@ApiPropertyOptional({ description: "Rack ID where the item is stored" })
	@IsOptional()
	@IsString()
	rackId?: string;

	@ApiPropertyOptional({ description: "Bin ID within the rack where the item is stored" })
	@IsOptional()
	@IsString()
	binId?: string;

	@ApiPropertyOptional({ description: "Zone ID where the item is stored" })
	@IsOptional()
	@IsString()
	zoneId?: string;

	@ApiPropertyOptional({ description: "Current status of the inventory item", example: "In Storage" })
	@IsOptional()
	@IsString()
	status?: string;

	@ApiPropertyOptional({ description: "Condition of the item (e.g., New, Used, Damaged)" })
	@IsOptional()
	@IsString()
	condition?: string;

	@ApiPropertyOptional({ description: "Special handling instructions (e.g., Fragile, Hazardous)" })
	@IsOptional()
	@IsString()
	specialHandling?: string;
}
