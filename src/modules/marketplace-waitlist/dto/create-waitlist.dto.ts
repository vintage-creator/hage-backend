import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum Industry {
  AGRICULTURE = 'Agriculture',
  TECHNOLOGY = 'Technology',
  PHARMACEUTICAL = 'Pharmaceutical',
  AUTOMOBILE = 'Automobile',
  OTHERS = 'Others',
}

export class CreateWaitlistDto {
  @ApiProperty({ description: "Full name of the person" })
  @IsString()
  fullName!: string;

  @ApiProperty({ description: "Email address of the person" })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: "Country of the person" })
  @IsString()
  country!: string;

  @ApiProperty({ description: "Industry of the person", enum: Industry })
  @IsEnum(Industry)
  industry!: Industry;
}
