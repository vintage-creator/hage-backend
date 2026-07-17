import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateTransporterDto {
   @ApiPropertyOptional({ example: 'ABC Logistics' })
   @IsOptional()
   @IsString()
   name?: string;

   @ApiPropertyOptional({ example: '+1' })
   @IsOptional()
   @IsString()
   @Matches(/^\+\d{1,4}$/, { message: 'countryCode must look like +1, +234, etc.' })
   countryCode?: string;

   @ApiPropertyOptional({ example: '9065423334' })
   @IsOptional()
   @IsString()
   phone?: string;

   @ApiPropertyOptional({ example: 'ABlogistics45@gmail.com' })
   @IsOptional()
   @IsEmail()
   email?: string;
}
