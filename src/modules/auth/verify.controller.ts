import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import {
    ApiOperation,
    ApiResponse,
    ApiTags,
    ApiBody,
  } from "@nestjs/swagger";
import { AuthService } from "./auth.service";

@Controller() 
export class VerifyController {
  constructor(private readonly auth: AuthService) {}

  @Get("verify-email")
  @ApiOperation({ summary: "Verify user email using token" })
  @ApiResponse({
    status: 200,
    description: "Email verified — proceed to set password",
  })
  async verifyEmail(@Query("token") token: string) {
    return this.auth.verifyEmail(token);
  }
}
