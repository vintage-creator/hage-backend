import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class ReportIssueDto {
   @ApiProperty({ example: 'Shipment status has not updated since yesterday.' })
   @IsString()
   @IsNotEmpty()
   text!: string;
}

export enum PaymentMethodInputType {
   CARD = 'CARD',
   LOCAL_BANK = 'LOCAL_BANK',
}

export enum CardBrandInput {
   VISA = 'VISA',
   MASTERCARD = 'MASTERCARD',
}

export class PaymentMethodDto {
   @ApiProperty({ enum: PaymentMethodInputType })
   @IsEnum(PaymentMethodInputType)
   type!: PaymentMethodInputType;

   @ApiPropertyOptional({ example: 'Jane Doe' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.CARD)
   @IsString()
   @IsNotEmpty()
   cardholderName?: string;

   @ApiPropertyOptional({ enum: CardBrandInput })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.CARD)
   @IsEnum(CardBrandInput)
   cardBrand?: CardBrandInput;

   @ApiPropertyOptional({ example: '4111111111111111', description: 'Used only to derive last4. Full card number is not stored.' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.CARD)
   @IsString()
   @Matches(/^\d{12,19}$/)
   cardNumber?: string;

   @ApiPropertyOptional({ example: '12/28' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.CARD)
   @IsString()
   @IsNotEmpty()
   expiration?: string;

   @ApiPropertyOptional({ example: '123', description: 'Accepted for validation only. CVV is never stored.' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.CARD)
   @IsString()
   @Matches(/^\d{3,4}$/)
   cvv?: string;

   @ApiPropertyOptional({ example: '100001' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.CARD)
   @IsString()
   @IsNotEmpty()
   postalCode?: string;

   @ApiPropertyOptional({ example: 'GTBank' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.LOCAL_BANK)
   @IsString()
   @IsNotEmpty()
   bankName?: string;

   @ApiPropertyOptional({ example: 'Jane Doe' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.LOCAL_BANK)
   @IsString()
   @IsNotEmpty()
   accountName?: string;

   @ApiPropertyOptional({ example: '0123456789', description: 'Used only to derive last4. Full account number is not stored.' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.LOCAL_BANK)
   @IsString()
   @Matches(/^\d{6,20}$/)
   accountNumber?: string;

   @ApiPropertyOptional({ example: '058' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.LOCAL_BANK)
   @IsString()
   @IsNotEmpty()
   bankSortCode?: string;

   @ApiPropertyOptional({ example: 'NGN' })
   @ValidateIf((dto) => dto.type === PaymentMethodInputType.LOCAL_BANK)
   @IsString()
   @IsNotEmpty()
   currency?: string;
}

export class LanguageSettingDto {
   @ApiProperty({ example: 'en' })
   @IsString()
   @IsNotEmpty()
   language!: string;
}

export class NotificationSettingsDto {
   @ApiProperty({ example: true })
   @IsBoolean()
   realTimeShipmentStatus!: boolean;

   @ApiProperty({ example: true })
   @IsBoolean()
   messaging!: boolean;

   @ApiProperty({ example: false })
   @IsBoolean()
   escalationsOrDispute!: boolean;
}

export class InviteTeamMemberDto {
   @ApiProperty({ example: 'teammate@example.com' })
   @IsEmail()
   email!: string;
}

export class UpdateEnterpriseProfileDto {
   @ApiPropertyOptional({ example: 'ACME Enterprise' })
   @IsOptional()
   @IsString()
   enterpriseName?: string;

   @ApiPropertyOptional({ example: '12 Port Road' })
   @IsOptional()
   @IsString()
   physicalAddress?: string;

   @ApiPropertyOptional({ example: 'ops@acme.example' })
   @IsOptional()
   @IsEmail()
   email?: string;

   @ApiPropertyOptional({ example: '+2348010000000' })
   @IsOptional()
   @IsString()
   phoneNumber?: string;
}

export class UpdateEndUserProfileDto {
   @ApiPropertyOptional({ example: 'Jane Doe' })
   @IsOptional()
   @IsString()
   userName?: string;

   @ApiPropertyOptional({ example: '12 Port Road' })
   @IsOptional()
   @IsString()
   physicalAddress?: string;

   @ApiPropertyOptional({ example: 'jane@example.com' })
   @IsOptional()
   @IsEmail()
   email?: string;

   @ApiPropertyOptional({ example: '+2348010000000' })
   @IsOptional()
   @IsString()
   phoneNumber?: string;
}
