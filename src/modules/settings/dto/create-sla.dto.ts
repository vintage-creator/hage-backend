import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsNumber, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class RouteDto {
	@ApiProperty({ example: "Lagos" })
	@IsString()
	@IsNotEmpty()
	from!: string;

	@ApiProperty({ example: "Abuja" })
	@IsString()
	@IsNotEmpty()
	to!: string;
}

class OnTimeDeliveryRateDto {
	@ApiProperty({ example: 95 })
	@Type(() => Number)
	@IsNumber()
	targetValue!: number;

	@ApiProperty({ example: "PERCENTAGE" })
	@IsString()
	@IsNotEmpty()
	thresholdType!: string;
}

class ValidityPeriodDto {
	@ApiProperty({ example: "2026-06-01" })
	@IsDateString()
	startDate!: string;

	@ApiProperty({ example: "2026-12-31" })
	@IsDateString()
	endDate!: string;
}

export class CreateSlaDto {
	@ApiProperty({ example: "ACME Enterprise" })
	@IsString()
	@IsNotEmpty()
	companyName!: string;

	@ApiProperty({ example: "48 hours" })
	@IsString()
	@IsNotEmpty()
	deliveryTimeCommitment!: string;

	@ApiProperty({ type: RouteDto })
	@ValidateNested()
	@Type(() => RouteDto)
	route!: RouteDto;

	@ApiProperty({ example: "Truck" })
	@IsString()
	@IsNotEmpty()
	vehicleType!: string;

	@ApiProperty({ type: OnTimeDeliveryRateDto })
	@ValidateNested()
	@Type(() => OnTimeDeliveryRateDto)
	onTimeDeliveryRate!: OnTimeDeliveryRateDto;

	@ApiProperty({ example: "5% fee deduction" })
	@IsString()
	@IsNotEmpty()
	statePenalty!: string;

	@ApiProperty({ example: "3% bonus" })
	@IsString()
	@IsNotEmpty()
	stateIncentive!: string;

	@ApiProperty({ type: ValidityPeriodDto })
	@ValidateNested()
	@Type(() => ValidityPeriodDto)
	validityPeriod!: ValidityPeriodDto;
}
