import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelDeliveryDto {
   @ApiProperty({
      description: 'Why the delivery could not be completed — shown on the "Failed deliveries" card (e.g. "Rider denied entry")',
      example: 'Rider denied entry',
   })
   @IsString()
   @IsNotEmpty()
   @MaxLength(200)
   reason!: string;

   @ApiPropertyOptional({ description: 'Any extra context for the failure' })
   @IsOptional()
   @IsString()
   @MaxLength(500)
   note?: string;
}
