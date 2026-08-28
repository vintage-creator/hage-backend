import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MinimumCostDto {
   // ─── PICKUP COORDINATES ─────────────────────────────────────────────────
   @ApiPropertyOptional({ description: 'Pickup latitude — required with pickupLng/deliveryLat/deliveryLng if distanceKm is not supplied directly' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   pickupLat?: number;

   @ApiPropertyOptional({ description: 'Pickup longitude' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   pickupLng?: number;

   // ─── DELIVERY COORDINATES ───────────────────────────────────────────────
   @ApiPropertyOptional({ description: 'Delivery latitude' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   deliveryLat?: number;

   @ApiPropertyOptional({ description: 'Delivery longitude' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   deliveryLng?: number;

   // ─── OVERRIDE / CARGO ────────────────────────────────────────────────────
   @ApiPropertyOptional({ description: 'Distance in km. If supplied, this is used instead of computing distance from the coordinates above.' })
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   distanceKm?: number;

   @ApiPropertyOptional({ description: 'Cargo weight in kg, used for the weight charge component', default: 0 })
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   weight?: number;
}
