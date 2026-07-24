import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsDefined, Min } from 'class-validator';

export class CreateZoneDto {
   @ApiProperty({ description: 'Zone name' })
   @IsDefined()
   @IsString()
   name!: string;

   @ApiPropertyOptional({ description: 'Minimum temperature capability (°C)', type: 'number' })
   @IsOptional()
   @IsNumber()
   tempMin?: number;

   @ApiPropertyOptional({ description: 'Maximum temperature capability (°C)', type: 'number' })
   @IsOptional()
   @IsNumber()
   tempMax?: number;

   @ApiPropertyOptional({ description: 'Allows hazardous materials', type: 'boolean' })
   @IsOptional()
   @IsBoolean()
   allowsHazardous?: boolean;

   @ApiPropertyOptional({ description: 'Is this zone a quarantine-capable zone', type: 'boolean' })
   @IsOptional()
   @IsBoolean()
   isQuarantineZone?: boolean;

   @ApiPropertyOptional({ description: 'Optional capacity for the zone', type: 'integer', minimum: 0 })
   @IsOptional()
   @IsNumber()
   @Min(0)
   capacity?: number;
}
