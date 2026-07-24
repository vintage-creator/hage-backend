import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentProvider {
   PAYSTACK = 'PAYSTACK',
   FLUTTERWAVE = 'FLUTTERWAVE',
}

export class InitiatePaymentDto {
   @ApiProperty({ description: 'Shipment ID to pay for' })
   @IsString()
   @IsNotEmpty()
   shipmentId!: string;

   @ApiPropertyOptional({ enum: PaymentProvider, default: PaymentProvider.PAYSTACK })
   @IsEnum(PaymentProvider)
   @IsOptional()
   provider?: PaymentProvider;

   @ApiPropertyOptional({ description: 'Redirect URL after payment (Paystack/Flutterwave callback)' })
   @IsString()
   @IsOptional()
   callbackUrl?: string;
}
