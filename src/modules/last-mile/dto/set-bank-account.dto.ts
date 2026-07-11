import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SetBankAccountDto {
   @ApiProperty({ example: 'Access Bank' })
   @IsString()
   @IsNotEmpty()
   bankName!: string;

   @ApiProperty({ example: '1212345346', description: 'Full account number. Only the last 4 digits are stored/returned.' })
   @IsString()
   @IsNotEmpty()
   accountNumber!: string;

   @ApiProperty({ example: 'TUNDE JAMIU' })
   @IsString()
   @IsNotEmpty()
   accountName!: string;

   @ApiPropertyOptional({ example: 'NGN', default: 'NGN' })
   @IsString()
   @IsOptional()
   currency?: string;

   @ApiPropertyOptional({ example: '044' })
   @IsString()
   @IsOptional()
   bankSortCode?: string;
}
