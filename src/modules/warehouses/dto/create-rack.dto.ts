import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateRackDto {
   @ApiProperty({ description: 'Rack name' })
   @IsString()
   name!: string;

   @ApiPropertyOptional({ description: 'Optional rack capacity', type: 'integer', minimum: 0 })
   @IsOptional()
   @IsNumber()
   @Min(0)
   capacity?: number;
}
