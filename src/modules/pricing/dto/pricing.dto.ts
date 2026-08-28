import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class PricingTierDto {
   @ApiProperty({ example: 0, description: 'Lower bound of the tonnage band (inclusive)' })
   @Type(() => Number)
   @IsNumber()
   @Min(0)
   fromTons!: number;

   @ApiProperty({ example: 5, description: 'Upper bound of the tonnage band (inclusive). The price below is what this many tons costs.' })
   @Type(() => Number)
   @IsNumber()
   @Min(0)
   toTons!: number;

   @ApiProperty({ example: 500, description: 'Price for shipping toTons tons on this lane, e.g. 500 for 5 tons.' })
   @Type(() => Number)
   @IsNumber()
   @Min(0)
   price!: number;
}

export class CreatePricingRuleDto {
   @ApiProperty({ example: 'Lagos', description: 'Origin state/region/country this rule applies to' })
   @IsString()
   @IsNotEmpty()
   origin!: string;

   @ApiProperty({ example: 'Abuja', description: 'Destination state/region/country this rule applies to' })
   @IsString()
   @IsNotEmpty()
   destination!: string;

   @ApiProperty({ example: 'Tipper', description: 'Vehicle type this rule applies to' })
   @IsString()
   @IsNotEmpty()
   vehicleType!: string;

   @ApiPropertyOptional({ example: 'NGN', default: 'NGN' })
   @IsString()
   @IsOptional()
   currency?: string;

   @ApiProperty({ example: 'Regular', description: 'Service level this rule applies to, e.g. Regular, Express' })
   @IsString()
   @IsNotEmpty()
   serviceLevel!: string;

   @ApiPropertyOptional({ default: true })
   @IsBoolean()
   @IsOptional()
   isActive?: boolean;

   @ApiProperty({ type: [PricingTierDto], description: 'Tonnage bands and their price, e.g. { fromTons: 0, toTons: 5, price: 500 }' })
   @IsArray()
   @ArrayMinSize(1)
   @ValidateNested({ each: true })
   @Type(() => PricingTierDto)
   tiers!: PricingTierDto[];
}

export class UpdatePricingRuleDto extends PartialType(CreatePricingRuleDto) {}

export class ListPricingRulesQueryDto {
   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   origin?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   destination?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   vehicleType?: string;
}
