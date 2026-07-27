import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class StatementQueryDto {
   @ApiPropertyOptional({ description: 'ISO date - start of statement period', example: '2026-06-01' })
   @IsDateString()
   @IsOptional()
   startDate?: string;

   @ApiPropertyOptional({ description: 'ISO date - end of statement period', example: '2026-07-01' })
   @IsDateString()
   @IsOptional()
   endDate?: string;
}
