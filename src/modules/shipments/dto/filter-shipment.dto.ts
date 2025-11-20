// src/modules/shipments/dto/filter-shipment.dto.ts
import { IsOptional, IsString, IsInt, Min, IsEnum, IsDateString } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum StatusFilterEnum {
	NEW_ORDERS = "new_orders",
	PENDING = "pending",
	IN_WAREHOUSE = "in_warehouse",
	IN_TRANSIT = "in_transit",
	COMPLETED = "completed",
	CANCELLED = "cancelled",
	ALL = "all",
}

export class FilterShipmentDto {
	@ApiPropertyOptional({
		description: "Page number for pagination",
		example: 1,
		minimum: 1,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@ApiPropertyOptional({
		description: "Number of items per page",
		example: 20,
		minimum: 1,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number = 20;

	@ApiPropertyOptional({
		description: "Filter by status category",
		enum: StatusFilterEnum,
		example: "new_orders",
	})
	@IsOptional()
	@IsEnum(StatusFilterEnum)
	statusFilter?: StatusFilterEnum;

	@ApiPropertyOptional({
		description: "Filter by specific shipment status",
		// example: "PENDING_ACCEPTANCE",
	})
	@IsOptional()
	@IsString()
	status?: string;

	@ApiPropertyOptional({
		description: "Filter by order ID (partial match)",
		// example: "SHP-2025-12345",
	})
	@IsOptional()
	@IsString()
	orderId?: string;

	@ApiPropertyOptional({
		description: "Filter by cargo type",
		// example: "Electronics",
	})
	@IsOptional()
	@IsString()
	cargoType?: string;

	@ApiPropertyOptional({
		description: "Filter by origin country",
		// example: "Nigeria",
	})
	@IsOptional()
	@IsString()
	origin?: string;

	@ApiPropertyOptional({
		description: "Filter by destination country",
		// example: "Ghana",
	})
	@IsOptional()
	@IsString()
	destination?: string;

	@ApiPropertyOptional({
		description: "Filter by start date (ISO 8601 format)",
		// example: "2025-01-01T00:00:00Z",
	})
	@IsOptional()
	@IsDateString()
	startDate?: string;

	@ApiPropertyOptional({
		description: "Filter by end date (ISO 8601 format)",
		// example: "2025-12-31T23:59:59Z",
	})
	@IsOptional()
	@IsDateString()
	endDate?: string;

	@ApiPropertyOptional({
		description: "Filter by assigned warehouse ID",
		// example: "warehouse-uuid",
	})
	@IsOptional()
	@IsString()
	warehouseId?: string;

	@ApiPropertyOptional({
		description: "Filter by assigned transporter ID",
		// example: "transporter-uuid",
	})
	@IsOptional()
	@IsString()
	transporterId?: string;
}
