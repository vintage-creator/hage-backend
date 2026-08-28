import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class AddTransporterDto {
   @ApiProperty({ example: 'ABC Logistics', description: 'Transporter name' })
   @IsString()
   @IsNotEmpty()
   name!: string;

   @ApiPropertyOptional({ example: '+1', description: 'Phone country calling code' })
   @IsOptional()
   @IsString()
   @Matches(/^\+\d{1,4}$/, { message: 'countryCode must look like +1, +234, etc.' })
   countryCode?: string;

   @ApiProperty({ example: '9065423334', description: 'Transporter phone number' })
   @IsString()
   @IsNotEmpty()
   phone!: string;

   @ApiProperty({ example: 'ABlogistics45@gmail.com', description: 'Transporter email address' })
   @IsEmail()
   @IsNotEmpty()
   email!: string;
}
