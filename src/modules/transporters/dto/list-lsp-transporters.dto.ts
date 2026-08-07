import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListLspTransportersDto {
   @ApiPropertyOptional({ description: 'Filter by the LSP company operating country', example: 'Ghana' })
   @IsOptional()
   @IsString()
   country?: string;

   @ApiPropertyOptional({ description: 'Search by business name', example: 'Acme Logistics' })
   @IsOptional()
   @IsString()
   search?: string;

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
