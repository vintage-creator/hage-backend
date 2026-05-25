// src/modules/auth/dto/create-password.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreatePasswordDto {
   @ApiProperty() @IsString() @MinLength(8) password!: string;
   @ApiProperty() @IsString() @MinLength(8) retypePassword!: string;
   @ApiProperty() @IsString() verificationToken!: string; // token from email link
}
