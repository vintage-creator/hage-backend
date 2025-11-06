import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, Min, IsDefined, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'company_abc123', description: 'Company id owning the warehouse' })
  @IsDefined()
  @IsString()
  companyId!: string;

  @ApiProperty({ example: 'Main Warehouse', description: 'Warehouse name' })
  @IsDefined()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Nigeria', description: 'Country' })
  @IsDefined()
  @IsString()
  country!: string;

  @ApiProperty({ example: 'Lagos', description: 'City' })
  @IsDefined()
  @IsString()
  city!: string;

  @ApiProperty({ example: '123 Market St, Lagos Island', description: 'Full address' })
  @IsDefined()
  @IsString()
  address!: string;

  @ApiProperty({ example: 1000, description: 'Total capacity (in capacityUnit)', type: 'integer', minimum: 0 })
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalCapacity!: number;

  @ApiPropertyOptional({ example: 'pieces', description: 'Capacity unit for the warehouse' })
  @IsOptional()
  @IsString()
  capacityUnit?: string;

  @ApiPropertyOptional({ example: 2, description: 'Optional: hint for number of zones' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numZones?: number;

  @ApiPropertyOptional({ example: 4, description: 'Optional: hint for number of rows' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numRows?: number;

  @ApiPropertyOptional({ example: 8, description: 'Optional: hint for number of racks' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numRacks?: number;

  @ApiPropertyOptional({ example: 12, description: 'Optional: hint for bins per rack' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numBinsPerRack?: number;

  @ApiPropertyOptional({ example: true, description: 'Warehouse allows temperature-sensitive storage' })
  @IsOptional()
  @IsBoolean()
  allowsTemperature?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Warehouse allows hazardous materials' })
  @IsOptional()
  @IsBoolean()
  allowsHazardous?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Warehouse has quarantine zone' })
  @IsOptional()
  @IsBoolean()
  allowsQuarantine?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Warehouse has no special condition' })
  @IsOptional()
  @IsBoolean()
  allowsNone?: boolean;
}
