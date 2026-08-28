import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListLspTransportersDto {
   @ApiPropertyOptional({ default: 1 })
   @IsOptional()
   @Type(() => Number)
   @IsInt()
   @Min(1)
   page?: number;

   @ApiPropertyOptional({ default: 20 })
   @IsOptional()
   @Type(() => Number)
   @IsInt()
   @Min(1)
   limit?: number;
}
