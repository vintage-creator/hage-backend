// src/modules/warehouses/dto/update-warehouse.dto.ts
import { IsOptional, IsString, IsInt, Min, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WarehouseStatus } from '@prisma/client';

export class UpdateWarehouseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalCapacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  capacityUnit?: string;

  @ApiPropertyOptional({ enum: WarehouseStatus, description: 'Warehouse lifecycle status' })
  @IsOptional()
  @IsEnum(WarehouseStatus)
  status?: WarehouseStatus;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numZones?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numRows?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numRacks?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numBinsPerRack?: number;

  @ApiPropertyOptional({ description: 'Allows temperature control' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowsTemperature?: boolean;

  @ApiPropertyOptional({ description: 'Allows storing hazardous items' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowsHazardous?: boolean;

  @ApiPropertyOptional({ description: 'Allows quarantine storage' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowsQuarantine?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Warehouse has no special condition' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowsNone?: boolean;
}
