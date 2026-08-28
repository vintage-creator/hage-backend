import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBidDto {
   @ApiProperty({ description: 'Price the transporter is quoting for this shipment' })
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   price!: number;

   @ApiPropertyOptional({ description: 'Optional note from the transporter' })
   @IsString()
   @IsOptional()
   note?: string;
}
