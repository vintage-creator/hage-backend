import { Response } from "express";
import { memoryStorage } from "multer";
import * as path from "path";
import { Body, Controller, Req, Res, Post, UploadedFiles, UseInterceptors, BadRequestException, HttpCode, UseGuards, HttpStatus } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, ApiBody } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RegisterCompanyDto, RegisterKind } from "./dto/register-company.dto";
import { CreatePasswordDto } from "./dto/create-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ForgotPasswordRequestDto } from "./dto/forgot-password-request.dto";
import { LogoutDto } from "./dto/logout.dto";
import { VerifyPhoneCodeDto } from "./dto/verify-phone-code.dto";

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

const pdfFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
	const ext = path.extname(file.originalname).toLowerCase();
	const isPdfMime = file.mimetype === "application/pdf";
	const isPdfExt = ext === ".pdf";

	if (isPdfMime && isPdfExt) {
		cb(null, true);
	} else {
		cb(new BadRequestException("Only PDF files are allowed"), false);
	}
};

const individualRegistrationSchema = {
	type: "object",
	required: ["kind", "language", "name", "emailAddress", "phoneNumber", "physicalAddress", "country"],
	properties: {
		kind: { type: "string", enum: ["INDIVIDUAL"], example: "INDIVIDUAL" },
		language: { type: "string", example: "en" },
		name: { type: "string", example: "Jane Doe" },
		emailAddress: { type: "string", example: "jane@example.com" },
		phoneNumber: { type: "string", example: "+2348010000000" },
		physicalAddress: { type: "string", example: "12 Port Road" },
		country: { type: "string", example: "Nigeria" },
	},
};

const enterpriseRegistrationSchema = {
	type: "object",
	required: ["kind", "language", "companyName", "companyEmailAddress", "companyPhoneNumber", "companyAddress", "country"],
	properties: {
		kind: { type: "string", enum: ["ENTERPRISE"], example: "ENTERPRISE" },
		language: { type: "string", example: "en" },
		companyName: { type: "string", example: "ACME Ltd" },
		companyEmailAddress: { type: "string", example: "ops@acme.example" },
		companyPhoneNumber: { type: "string", example: "+2348010000000" },
		companyAddress: { type: "string", example: "12 Port Road" },
		country: { type: "string", example: "Nigeria" },
	},
};

const documentRegistrationSchema = {
	type: "object",
	required: ["kind", "fullName", "phoneNumber", "emailAddress", "businessName", "businessAddress", "companyCert", "taxCert"],
	properties: {
		kind: {
			type: "string",
			enum: ["DISTRIBUTOR", "LOGISTIC_SERVICE_PROVIDER", "LAST_MILE_DELIVERY"],
			example: "LOGISTIC_SERVICE_PROVIDER",
		},
		fullName: { type: "string", example: "John Doe" },
		phoneNumber: { type: "string", example: "+2348010000000" },
		emailAddress: { type: "string", example: "ops@example.com" },
		businessName: { type: "string", example: "ACME Logistics Ltd" },
		businessAddress: { type: "string", example: "12 Port Road" },
		role: {
			type: "string",
			enum: ["CROSS_BORDER_LOGISTICS", "TRANSPORTER", "LAST_MILE_PROVIDER"],
			description: "Required only when kind is LOGISTIC_SERVICE_PROVIDER",
			example: "TRANSPORTER",
		},
		companyCert: {
			type: "string",
			format: "binary",
			description: "Required PDF upload",
		},
		taxCert: {
			type: "string",
			format: "binary",
			description: "Required PDF upload",
		},
	},
};

@ApiTags("auth")
@Controller("auth")
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@Post("register-individual")
	@ApiOperation({
		summary: "Register individual user",
		description: "No document upload is required. The user receives a 4 digit verification code by email.",
	})
	@ApiConsumes("multipart/form-data")
	@ApiBody({ schema: individualRegistrationSchema })
	@ApiResponse({
		status: 201,
		description: "Registration accepted; verify with the 4 digit code.",
	})
	@UseInterceptors(FileFieldsInterceptor([], { storage: memoryStorage() }))
	async registerIndividual(@Body() dto: RegisterCompanyDto) {
		return this.auth.registerCompany(dto, {});
	}

	@Post("register-enterprise")
	@ApiOperation({
		summary: "Register enterprise user",
		description: "No document upload is required. The company email receives a 4 digit verification code.",
	})
	@ApiConsumes("multipart/form-data")
	@ApiBody({ schema: enterpriseRegistrationSchema })
	@ApiResponse({
		status: 201,
		description: "Registration accepted; verify with the 4 digit code.",
	})
	@UseInterceptors(FileFieldsInterceptor([], { storage: memoryStorage() }))
	async registerEnterprise(@Body() dto: RegisterCompanyDto) {
		return this.auth.registerCompany(dto, {});
	}

	@Post("register-company")
	@ApiOperation({
		summary: "Register document-required user",
		description: "Use this for LOGISTIC_SERVICE_PROVIDER, DISTRIBUTOR, and LAST_MILE_DELIVERY users. These users upload companyCert and taxCert PDFs and verify by email link. Individual and enterprise users should use register-individual or register-enterprise.",
	})
	@ApiConsumes("multipart/form-data")
	@ApiResponse({
		status: 201,
		description: "Registration accepted; verify with the email link.",
	})
	@UseInterceptors(
		FileFieldsInterceptor(
			[
				{ name: "companyCert", maxCount: 1 },
				{ name: "taxCert", maxCount: 1 },
			],
			{
				storage: memoryStorage(),
				fileFilter: pdfFileFilter,
				limits: {
					fileSize: 5 * 1024 * 1024,
				},
			}
		)
	)
	@ApiBody({
		schema: documentRegistrationSchema,
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

		if (dto.kind !== RegisterKind.ENTERPRISE && dto.kind !== RegisterKind.INDIVIDUAL && (!files || !files.companyCert?.[0] || !files.taxCert?.[0])) {
			throw new BadRequestException("companyCert and taxCert files are required (fields: companyCert, taxCert)");
		}

		return this.auth.registerCompany(dto, {
			companyCert: files?.companyCert?.[0],
			taxCert: files?.taxCert?.[0],
		});
	}

	@Post("verify-phone-code")
	@ApiOperation({
		summary: "Verify enterprise or individual onboarding code",
	})
	@ApiResponse({
		status: 200,
		description: "Code verified — use returned verificationToken to set password",
	})
	@HttpCode(HttpStatus.OK)
	async verifyPhoneCode(@Body() dto: VerifyPhoneCodeDto) {
		return this.auth.verifyPhoneCode(dto.emailAddress, dto.verificationCode);
	}

	@Post("set-password")
	@ApiOperation({ summary: "Set password after email verification" })
	@ApiResponse({ status: 200, description: "Password set successfully" })
	async setPassword(@Body() dto: CreatePasswordDto) {
		return this.auth.setPassword(dto.verificationToken, dto.password, dto.retypePassword);
	}

	@Post("login")
	@ApiOperation({ summary: "Login using email or phone and password" })
	@ApiResponse({ status: 200, description: "Returns access & refresh tokens" })
	@HttpCode(HttpStatus.OK)
	async login(@Body() dto: LoginDto) {
		return this.auth.login(dto.identifier, dto.password);
	}

	@Post("refresh")
	@ApiOperation({
		summary: "Refresh access token",
		description: "Exchange a valid refresh token for a new access token and rotated refresh token.",
	})
	@ApiResponse({
		status: 200,
		description: "Returns a new access token, refresh token, and user payload",
	})
	@HttpCode(HttpStatus.OK)
	async refresh(@Body() dto: RefreshTokenDto) {
		return this.auth.refreshSession(dto.refreshToken);
	}

	@Post("logout")
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth("access-token")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiOperation({ summary: "Logout and revoke refresh token" })
	@ApiResponse({ status: 204, description: "Logged out (idempotent)" })
	async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: LogoutDto): Promise<void> {
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
