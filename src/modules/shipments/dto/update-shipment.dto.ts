// src/modules/shipments/dto/update-shipment.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateShipmentDto } from './create-shipment.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateShipmentDto extends PartialType(CreateShipmentDto) {
   @ApiPropertyOptional({ description: 'Unique shipment ID for update' })
   @IsOptional()
   @IsString()
   id?: string;
}
