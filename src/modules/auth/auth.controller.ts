// src/modules/auth/auth.controller.ts
import { Response } from "express";
import * as multer from "multer";
import {
  Body,
  Controller,
  Req,
  Res,
  Get,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  UseGuards,
  HttpStatus,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RegisterCompanyDto } from "./dto/register-company.dto";
import { CreatePasswordDto } from "./dto/create-password.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordRequestDto } from "./dto/forgot-password-request.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { LogoutDto } from "./dto/logout.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register-company")
  @ApiOperation({
    summary: "Register company and upload documents (creates unverified user)",
  })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({
    status: 201,
    description: "Registration accepted; verify email",
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "companyCert", maxCount: 1 },
        { name: "taxCert", maxCount: 1 },
      ],
      {
        storage: multer.memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      }
    )
  )
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        phoneNumber: { type: "string" },
        emailAddress: { type: "string" },
        businessName: { type: "string" },
        businessAddress: { type: "string" },
        kind: {
          type: "string",
          enum: [
            "ENTERPRISE",
            "DISTRIBUTOR",
            "END_USER",
            "LOGISTIC_SERVICE_PROVIDER",
          ],
        },
        role: {
          type: "string",
          enum: ["CROSS_BORDER_LOGISTICS", "TRANSPORTER", "LAST_MILE_PROVIDER"],
        },
        companyCert: { type: "string", format: "binary" },
        taxCert: { type: "string", format: "binary" },
      },
      required: [
        "fullName",
        "phoneNumber",
        "emailAddress",
        "businessName",
        "businessAddress",
        "kind",
        "role",
        "companyCert",
        "taxCert",
      ],
    },
  })
  async registerCompany(
    @Body() dto: RegisterCompanyDto,
    @UploadedFiles()
    files?: {
      companyCert?: Express.Multer.File[];
      taxCert?: Express.Multer.File[];
    }
  ) {
    if (!dto.kind) throw new BadRequestException("User kind is required");
    if (!dto.role) throw new BadRequestException("User role is required");

    if (!files || !files.companyCert?.[0] || !files.taxCert?.[0]) {
      throw new BadRequestException(
        "companyCert and taxCert files are required (fields: companyCert, taxCert)"
      );
    }

    return this.auth.registerCompany(dto, {
      companyCert: files.companyCert[0],
      taxCert: files.taxCert[0],
    });
  }

  @Post("set-password")
  @ApiOperation({ summary: "Set password after email verification" })
  @ApiResponse({ status: 200, description: "Password set successfully" })
  async setPassword(@Body() dto: CreatePasswordDto) {
    return this.auth.setPassword(
      dto.verificationToken,
      dto.password,
      dto.retypePassword
    );
  }

  @Post("login")
  @ApiOperation({ summary: "Login using email or phone and password" })
  @ApiResponse({ status: 200, description: "Returns access & refresh tokens" })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.identifier, dto.password);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Logout and revoke refresh token" })
  @ApiResponse({ status: 204, description: "Logged out (idempotent)" })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LogoutDto
  ): Promise<void> {
    const user = (req as any).user;
    const userId = user?.sub ?? null;

    await this.auth.logout({
      userId,
      refreshToken: dto.refreshToken,
      refreshTokenId: dto.refreshTokenId,
    });

    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("refresh_token", {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
    });

    return;
  }

  @Post("forgot-password")
  @ApiOperation({
    summary: "Request password reset (email sent if account exists)",
  })
  @ApiResponse({
    status: 200,
    description: "If account exists an email was sent",
  })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordRequestDto) {
    return this.auth.requestPasswordReset(dto.email);
  }
}


