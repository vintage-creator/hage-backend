import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller() 
export class VerifyController {
  constructor(private readonly auth: AuthService) {}

  @Get("verify-email")
  async verifyEmail(@Query("token") token: string) {
    if (!token) throw new BadRequestException("Missing token");
    return this.auth.verifyEmail(token);
  }
}
