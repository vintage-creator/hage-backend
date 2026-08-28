import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export enum RegisterKind {
   ENTERPRISE = 'ENTERPRISE',
   DISTRIBUTOR = 'DISTRIBUTOR',
   INDIVIDUAL = 'INDIVIDUAL',
   LOGISTIC_SERVICE_PROVIDER = 'LOGISTIC_SERVICE_PROVIDER',
   LAST_MILE_DELIVERY = 'LAST_MILE_DELIVERY',
}

export enum RegisterRole {
   CROSS_BORDER_LOGISTICS = 'CROSS_BORDER_LOGISTICS',
   TRANSPORTER = 'TRANSPORTER',
   LAST_MILE_PROVIDER = 'LAST_MILE_PROVIDER',
}

export class RegisterCompanyDto {
   @ApiProperty({ example: 'John Doe' })
   @ValidateIf((dto) => !dto.name && dto.kind !== RegisterKind.ENTERPRISE)
   @IsString()
   @IsNotEmpty()
   fullName?: string;

   @ApiPropertyOptional({
      example: 'Jane Doe',
      description: 'Individual user name. Alias for fullName.',
   })
   @ValidateIf((dto) => dto.kind === RegisterKind.INDIVIDUAL && !dto.fullName)
   @IsString()
   @IsNotEmpty()
   name?: string;

   @ApiProperty({ example: '+2348010000000' })
   @ValidateIf((dto) => !dto.companyPhoneNumber)
   @IsString()
   @IsNotEmpty()
   phoneNumber?: string;

   @ApiPropertyOptional({
      example: '+2348010000000',
      description: 'Enterprise company phone number. Alias for phoneNumber.',
   })
   @ValidateIf((dto) => dto.kind === RegisterKind.ENTERPRISE && !dto.phoneNumber)
   @IsString()
   @IsNotEmpty()
   companyPhoneNumber?: string;

   @ApiProperty({ example: 'me@example.com' })
   @ValidateIf((dto) => !dto.companyEmailAddress)
   @IsEmail()
   @IsString()
   @IsNotEmpty()
   emailAddress?: string;

   @ApiPropertyOptional({
      example: 'company@example.com',
      description: 'Enterprise company email address. Alias for emailAddress.',
   })
   @ValidateIf((dto) => dto.kind === RegisterKind.ENTERPRISE && !dto.emailAddress)
   @IsEmail()
   @IsString()
   @IsNotEmpty()
   companyEmailAddress?: string;

   @ApiProperty({ example: 'ACME Ltd' })
   @ValidateIf((dto) => !dto.companyName && dto.kind !== RegisterKind.INDIVIDUAL)
   @IsString()
   @IsNotEmpty()
   businessName?: string;

   @ApiPropertyOptional({
      example: 'ACME Ltd',
      description: 'Enterprise company name. Alias for businessName.',
   })
   @ValidateIf((dto) => dto.kind === RegisterKind.ENTERPRISE && !dto.businessName)
   @IsString()
   @IsNotEmpty()
   companyName?: string;

   @ApiProperty({ example: '12 Port Road' })
   @ValidateIf((dto) => !dto.physicalAddress && !dto.companyAddress)
   @IsString()
   @IsNotEmpty()
   businessAddress?: string;

   @ApiPropertyOptional({
      example: '12 Port Road',
      description: 'Individual physical address. Alias for businessAddress.',
   })
   @ValidateIf((dto) => dto.kind === RegisterKind.INDIVIDUAL && !dto.businessAddress)
   @IsString()
   @IsNotEmpty()
   physicalAddress?: string;

   @ApiPropertyOptional({
      example: '12 Port Road',
      description: 'Enterprise company address. Alias for businessAddress.',
   })
   @ValidateIf((dto) => dto.kind === RegisterKind.ENTERPRISE && !dto.businessAddress)
   @IsString()
   @IsNotEmpty()
   companyAddress?: string;

   @ApiPropertyOptional({
      example: 'Nigeria',
      description: 'Selected country for individual or enterprise onboarding',
   })
   @IsOptional()
   @IsString()
   @IsNotEmpty()
   country?: string;

   @ApiPropertyOptional({
      example: 'en',
      description: 'Selected onboarding language',
   })
   @IsOptional()
   @IsString()
   @IsNotEmpty()
   language?: string;

   @ApiProperty({
      enum: RegisterKind,
      example: RegisterKind.INDIVIDUAL,
   })
   @IsEnum(RegisterKind)
   @IsNotEmpty()
   kind!: RegisterKind;

   @ApiPropertyOptional({
      enum: RegisterRole,
      example: RegisterRole.TRANSPORTER,
      description: 'Required only when kind is LOGISTIC_SERVICE_PROVIDER',
   })
   @ValidateIf((dto) => dto.kind === RegisterKind.LOGISTIC_SERVICE_PROVIDER)
   @IsEnum(RegisterRole)
   @IsNotEmpty()
   role?: RegisterRole;
}
