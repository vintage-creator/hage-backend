import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";

export enum ReportPeriod {
	MONTHLY = "monthly",
	QUARTERLY = "quarterly",
	YEARLY = "yearly",
}

export class OrderHistoryReportQueryDto {
	@ApiPropertyOptional({ example: 7, description: "Number of recent days to include" })
	@IsOptional()
	days?: number;

	@ApiPropertyOptional({ example: "Lagos" })
	@IsOptional()
	@IsString()
	from?: string;

	@ApiPropertyOptional({ example: "Abuja" })
	@IsOptional()
	@IsString()
	to?: string;

	@ApiPropertyOptional({ enum: ["delivered", "in-transit", "delayed"] })
	@IsOptional()
	@IsString()
	deliveryStatus?: string;
}

export class PeriodQueryDto {
	@ApiPropertyOptional({ enum: ReportPeriod, default: ReportPeriod.MONTHLY })
	@IsOptional()
	@IsEnum(ReportPeriod)
	period?: ReportPeriod;
}

export class OverallReportQueryDto {
	@ApiPropertyOptional({ example: "2026-01-01" })
	@IsOptional()
	@IsDateString()
	fromDate?: string;

	@ApiPropertyOptional({ example: "2026-12-31" })
	@IsOptional()
	@IsDateString()
	toDate?: string;
}

export class GenerateReportQueryDto extends OverallReportQueryDto {
	@ApiPropertyOptional({ example: "Jane Doe" })
	@IsOptional()
	@IsString()
	customerName?: string;

	@ApiPropertyOptional({ example: "LAST_MILE_DELIVERY" })
	@IsOptional()
	@IsString()
	transporterType?: string;

	@ApiPropertyOptional({ example: "INLAND" })
	@IsOptional()
	@IsString()
	shipmentType?: string;
}
