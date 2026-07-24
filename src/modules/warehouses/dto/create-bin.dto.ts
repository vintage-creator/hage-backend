import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class CreateBinDto {
   @ApiProperty({ description: 'Bin name', example: 'BIN-A1' })
   @IsString()
   name!: string;

   @ApiProperty({ description: 'Capacity in warehouse units', type: 'integer', example: 100 })
   @IsNumber()
   @Min(0)
   capacity!: number;

   @ApiPropertyOptional({ description: 'Minimum allowed temperature (°C)', type: 'number', example: 2 })
   @IsOptional()
   @IsNumber()
   tempMin?: number;

   @ApiPropertyOptional({ description: 'Maximum allowed temperature (°C)', type: 'number', example: 8 })
   @IsOptional()
   @IsNumber()
   tempMax?: number;

   @ApiPropertyOptional({ description: 'Allows hazardous materials', type: 'boolean', example: false })
   @IsOptional()
   @IsBoolean()
   allowsHazardous?: boolean;

   @ApiPropertyOptional({ description: 'Is this bin quarantine-capable', type: 'boolean', example: false })
   @IsOptional()
   @IsBoolean()
   isQuarantine?: boolean;
}
