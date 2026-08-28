// src/modules/auth/dto/register-last-mile-provider.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterLastMileProviderDto {
   // Contact Information
   @ApiProperty({ example: 'John Doe', description: 'Contact person full name' })
   @IsString()
   @IsNotEmpty()
   name!: string;

   @ApiProperty({ example: 'john.doe@example.com', description: 'Contact email address' })
   @IsEmail()
   @IsString()
   @IsNotEmpty()
   email!: string;

   @ApiProperty({ example: '+2348010000000', description: 'Contact phone number' })
   @IsString()
   @IsNotEmpty()
   phone!: string;

   // Business Profile
   @ApiProperty({ example: 'ACME Last Mile Ltd', description: 'Business name' })
   @IsString()
   @IsNotEmpty()
   businessName!: string;

   @ApiProperty({ example: '12 Logistics Way, Ikeja', description: 'Business physical address' })
   @IsString()
   @IsNotEmpty()
   businessAddress!: string;

   @ApiProperty({ example: '08:00', description: 'Opening start hour' })
   @IsString()
   @IsNotEmpty()
   openingHoursStart!: string;

   @ApiProperty({ example: '18:00', description: 'Opening closing hour' })
   @IsString()
   @IsNotEmpty()
   openingHoursEnd!: string;

   // Services & Logistics
   @ApiProperty({ example: 'Nigeria', description: 'Country of operation' })
   @IsString()
   @IsNotEmpty()
   country!: string;

   @ApiProperty({ example: 'Lagos', description: 'City of operation' })
   @IsString()
   @IsNotEmpty()
   city!: string;

   @ApiProperty({ example: 'Motorbike', description: 'Vehicle type' })
   @IsString()
   @IsNotEmpty()
   vehicleType!: string;

   // Identity Documents
   @ApiProperty({ example: 'RC-1234567', description: 'CAC Business registration number' })
   @IsString()
   @IsNotEmpty()
   businessNumber!: string;
}
