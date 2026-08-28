import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRatingDto {
   @ApiProperty({ minimum: 1, maximum: 5, description: 'Star rating 1–5' })
   @IsInt()
   @Min(1)
   @Max(5)
   @Type(() => Number)
   rating!: number;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   comment?: string;

   @ApiPropertyOptional({ description: 'Shipment ID this rating is for (one rating per shipment per rater)' })
   @IsString()
   @IsOptional()
   shipmentId?: string;
}
