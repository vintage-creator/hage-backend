import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ShipmentStatus {
   PENDING = 'PENDING',
   ACCEPTED = 'ACCEPTED',
   IN_WAREHOUSE = 'IN_WAREHOUSE',
   IN_TRANSIT = 'IN_TRANSIT',
   PICKED_UP = 'PICKED_UP',
   DELIVERED = 'DELIVERED',
   COMPLETED = 'COMPLETED',
   CANCELLED = 'CANCELLED',
}

export class UpdateStatusDto {
   @ApiProperty({ enum: ShipmentStatus })
   @IsEnum(ShipmentStatus)
   status!: ShipmentStatus;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   note?: string;
}
