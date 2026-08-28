import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class NavigationQueryDto {
   @ApiPropertyOptional({ description: "Driver's current latitude. If omitted, the shipment's last known currentLat is used." })
   @IsNumber()
   @Min(-90)
   @Max(90)
   @IsOptional()
   @Type(() => Number)
   lat?: number;

   @ApiPropertyOptional({ description: "Driver's current longitude. If omitted, the shipment's last known currentLng is used." })
   @IsNumber()
   @Min(-180)
   @Max(180)
   @IsOptional()
   @Type(() => Number)
   lng?: number;
}
