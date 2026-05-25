// src/modules/auth/dto/login.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
   @ApiProperty({ description: 'Email or phone number' })
   @IsString()
   @IsNotEmpty()
   identifier!: string; // email or phone
   @ApiProperty() @IsString() @IsNotEmpty() password!: string;
}
