// forgot-password-request.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordRequestDto {
   @ApiProperty() @IsEmail() email!: string;
}
