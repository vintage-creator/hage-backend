import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: '+2348010000000' })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @ApiProperty({ example: 'me@example.com' })
  @IsString()
  @IsNotEmpty()
  emailAddress!: string;

  @ApiProperty({ example: 'ACME Ltd' })
  @IsString()
  @IsNotEmpty()
  businessName!: string;

  @ApiProperty({ example: '12 Port Road' })
  @IsString()
  @IsNotEmpty()
  businessAddress!: string;

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