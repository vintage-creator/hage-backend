import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class WithdrawFundsDto {
   @ApiProperty({ example: 12456, description: 'Amount in NGN to withdraw from the available wallet balance' })
   @IsNumber()
   @Min(1)
   @Type(() => Number)
   @IsNotEmpty()
   amount!: number;

   @ApiPropertyOptional({ description: 'Bank account (PaymentMethod) id to pay out to. Defaults to the driver default withdrawal account.' })
   @IsString()
   @IsOptional()
   bankAccountId?: string;
}
