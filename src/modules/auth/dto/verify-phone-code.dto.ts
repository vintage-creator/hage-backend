import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, Matches } from "class-validator";

export class VerifyPhoneCodeDto {
  @ApiProperty({ example: "me@example.com" })
  @IsEmail()
  emailAddress!: string;

  @ApiProperty({ example: "1234", minLength: 4, maxLength: 4 })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: "verificationCode must be a 4 digit code" })
  verificationCode!: string;
}
