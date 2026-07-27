import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum DeliveryListFilter {
   ALL = 'all',
   PENDING = 'pending',
   IN_TRANSIT = 'in_transit',
   COMPLETED = 'completed',
   FAILED = 'failed',
}

export enum DeliverySortBy {
   DISTANCE = 'distance',
   ETA = 'eta',
}

export class ListDeliveriesQueryDto {
   @ApiPropertyOptional({
      description: 'Which tab to return — matches the "Total/Pending/Completed/Failed" tabs on the Deliveries screen',
      enum: DeliveryListFilter,
      default: DeliveryListFilter.ALL,
   })
   @IsOptional()
   @IsEnum(DeliveryListFilter)
   filter?: DeliveryListFilter = DeliveryListFilter.ALL;

   @ApiPropertyOptional({ description: 'Search by shipment ID or customer name ("Search by ID or Customer")' })
   @IsOptional()
   @IsString()
   search?: string;

   @ApiPropertyOptional({ description: 'Sort order — "Distance" or "ETA" chips on the Deliveries screen', enum: DeliverySortBy })
   @IsOptional()
   @IsEnum(DeliverySortBy)
   sortBy?: DeliverySortBy;

   @ApiPropertyOptional({ description: "Driver's current latitude, required for sortBy=distance" })
   @IsOptional()
   @Type(() => Number)
   @IsNumber()
   @Min(-90)
   @Max(90)
   lat?: number;

   @ApiPropertyOptional({ description: "Driver's current longitude, required for sortBy=distance" })
   @IsOptional()
   @Type(() => Number)
   @IsNumber()
   @Min(-180)
   @Max(180)
   lng?: number;

   @ApiPropertyOptional({ description: 'Page number', default: 1 })
   @IsOptional()
   @Type(() => Number)
   @IsNumber()
   @Min(1)
   page?: number = 1;

   @ApiPropertyOptional({ description: 'Items per page', default: 20 })
   @IsOptional()
   @Type(() => Number)
   @IsNumber()
   @Min(1)
   @Max(100)
   limit?: number = 20;
}
