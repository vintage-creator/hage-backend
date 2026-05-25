import { IsString, IsOptional, IsInt, Min, IsDateString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInventoryLocationDto {
   @ApiProperty({ description: 'ID of the inventory record' })
   @IsString()
   inventoryId!: string;

   @ApiProperty({ description: 'ID of the bin where the items will be stored' })
   @IsString()
   binId!: string;

   @ApiProperty({ description: 'Quantity of items to place in the bin', example: 100 })
   @IsInt()
   @Min(1)
   qty!: number;

   @ApiPropertyOptional({ description: 'Associated shipment ID if applicable' })
   @IsOptional()
   @IsString()
   shipmentId?: string;

   @ApiPropertyOptional({ description: 'Client ID if the inventory belongs to a client' })
   @IsOptional()
   @IsString()
   clientId?: string;

   @ApiPropertyOptional({ description: 'Client name (for display purposes)' })
   @IsOptional()
   @IsString()
   clientName?: string;

   @ApiPropertyOptional({ description: 'Condition of the inventory (e.g., NEW, USED, DAMAGED)' })
   @IsOptional()
   @IsString()
   condition?: string;

   @ApiPropertyOptional({ description: 'Lot number of the batch' })
   @IsOptional()
   @IsString()
   lotNumber?: string;

   @ApiPropertyOptional({ description: 'Expiry date of the batch (if applicable)', example: '2025-12-31' })
   @IsOptional()
   @IsDateString()
   expiryDate?: string;

   @ApiPropertyOptional({
      description: 'Special handling instructions (e.g., temperature, hazardous flag, compatibility)',
      example: {
         tempMin: 5,
         tempMax: 25,
         isHazardous: false,
         compatibility: ['ItemA', 'ItemB'],
      },
   })
   @IsOptional()
   @IsObject()
   specialHandling?: Record<string, any>;

   @ApiPropertyOptional({ description: 'Status of the inventory location (e.g., AVAILABLE, RESERVED, DAMAGED)' })
   @IsOptional()
   @IsString()
   status?: string;
}
