import { Controller, Get, Post, Body, Query, BadRequestException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller() 
export class ResetController {
  constructor(private readonly auth: AuthService) {}

  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password, dto.retypePassword);
  }

  @Get("reset-password")
  async verifyReset(@Query("token") token: string) {
    if (!token) throw new BadRequestException("Missing token");
    return this.auth.verifyResetToken(token);
  }
}
