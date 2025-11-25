import { IsOptional, IsInt, Min, IsString, IsObject, IsDateString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InventoryLocationStatus } from "@prisma/client";

export class UpdateInventoryLocationDto {
	@ApiPropertyOptional({ description: "Updated quantity for this inventory location", example: 50 })
	@IsOptional()
	@IsInt()
	@Min(0)
	qty?: number;

	@ApiPropertyOptional({ description: "New bin ID if the inventory is being moved", example: "bin_123" })
	@IsOptional()
	@IsString()
	binId?: string;

	@ApiPropertyOptional({ description: "Updated status of the inventory (e.g., AVAILABLE, RESERVED)", example: "AVAILABLE" })
	@IsOptional()
	@IsString()
	status?: string;

	@ApiPropertyOptional({ description: "Condition of the inventory (e.g., NEW, DAMAGED)", example: "NEW" })
	@IsOptional()
	@IsString()
	condition?: string;

	@ApiPropertyOptional({ description: "Lot number of the inventory", example: "LOT-2025-XYZ" })
	@IsOptional()
	@IsString()
	lotNumber?: string;

	@ApiPropertyOptional({ description: "New expiry date of the inventory", example: "2025-12-31" })
	@IsOptional()
	@IsDateString()
	expiryDate?: string;

	@ApiPropertyOptional({
		description: "Special handling instructions, temperature requirements, compatibility rules, etc.",
		example: {
			tempMin: 5,
			tempMax: 25,
			isHazardous: false,
			compatibility: ["productA", "productB"],
		},
	})
	@IsOptional()
	@IsObject()
	specialHandling?: Record<string, any>;

	@ApiPropertyOptional({ description: "Updated client name associated with this inventory", example: "Acme Corp" })
	@IsOptional()
	@IsString()
	clientName?: string;
}

export class UpdateInventoryStatusDto {
	@ApiProperty({ description: "New inventory status", type: String })
	status!: string;
}
