// src/shipments/dto/assign-shipment.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";

export class AssignShipmentDto {
	@ApiPropertyOptional({
		description: "ID of the transporter (user.id) — must have role TRANSPORTER",
		example: "user_transporter_id_123",
	})
	@IsOptional()
	@IsString()
	transporterId?: string;

	@ApiPropertyOptional({
		description: "Warehouse ID where this shipment will be stored or processed",
		example: "warehouse_id_456",
	})
	@IsOptional()
	@IsString()
	warehouseId?: string;

	@ApiPropertyOptional({ description: "Zone ID selected for manual assignment", example: "user_transporter_id_123" })
	@IsOptional()
	@IsString()
	zoneId?: string;

	@ApiPropertyOptional({ description: "Rack ID within the selected zone", example: "user_transporter_id_123" })
	@IsOptional()
	@IsString()
	rackId?: string;

	@ApiPropertyOptional({ description: "Bin ID within the selected rack", example: "user_transporter_id_123" })
	@IsOptional()
	@IsString()
	binId?: string;
}
