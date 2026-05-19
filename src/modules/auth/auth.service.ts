// src/modules/auth/auth.service.ts
import {
	Inject,
	Injectable,
	BadRequestException,
	UnauthorizedException,
	Logger,
  } from "@nestjs/common";
  import { PrismaService } from "../../prisma/prisma.service";
  import TokenService from "./token.service";
  import UrlService from "./url.service";
  import { isStrongPassword } from "../../utils/password";
  import * as bcrypt from "bcrypt";
  import { randomBytes, createHash } from "crypto";
  import { add } from "date-fns";
  import { JwtService } from "@nestjs/jwt";
  import { ConfigService } from "@nestjs/config";
  import type { StorageService } from "../../common/storage/storage.interface";
  import { MailService } from "../../common/mail/mail.service";
  import {
	RegisterCompanyDto,
	RegisterKind,
  } from "./dto/register-company.dto";
  
  @Injectable()
  export class AuthService {
	private readonly logger = new Logger(AuthService.name);
	private refreshDays: number;

	private usesCodeVerification(kind?: string | null) {
	  return kind === RegisterKind.ENTERPRISE || kind === RegisterKind.INDIVIDUAL;
	}

	private normalizeRegistration(dto: RegisterCompanyDto) {
	  const isIndividual = dto.kind === RegisterKind.INDIVIDUAL;
	  const isEnterprise = dto.kind === RegisterKind.ENTERPRISE;
	  const fullName = (dto.fullName ?? dto.name ?? dto.companyName ?? dto.businessName)?.trim();
	  const phoneNumber = (dto.phoneNumber ?? dto.companyPhoneNumber)?.trim();
	  const emailAddress = (dto.emailAddress ?? dto.companyEmailAddress)?.trim().toLowerCase();
	  const businessName = (
		dto.businessName ??
		dto.companyName ??
		(isIndividual ? dto.name : undefined) ??
		fullName
	  )?.trim();
	  const businessAddress = (
		dto.businessAddress ??
		dto.physicalAddress ??
		dto.companyAddress
	  )?.trim();
	  const country = dto.country?.trim();
	  const language = dto.language?.trim();

	  return {
		isIndividual,
		isEnterprise,
		fullName,
		phoneNumber,
		emailAddress,
		businessName,
		businessAddress,
		country,
		language,
	  };
	}
  
	constructor(
	  private readonly prisma: PrismaService,
	  private readonly jwt: JwtService,
	  private readonly cfg: ConfigService,
	  @Inject("StorageService") private readonly storage: StorageService,
	  private readonly mailer: MailService,
	  private readonly tokenService: TokenService,
	  private readonly urlService: UrlService
	) {
	  this.refreshDays = Number(this.cfg.get("REFRESH_EXPIRES_DAYS") ?? 30);
	}
  
	async registerCompany(
	  dto: RegisterCompanyDto,
	  files: {
		companyCert?: Express.Multer.File;
		taxCert?: Express.Multer.File;
	  }
	) {
	  if (!dto.kind) throw new BadRequestException("User kind is required");
	  const normalized = this.normalizeRegistration(dto);
  
	  if (
		dto.kind === RegisterKind.LOGISTIC_SERVICE_PROVIDER &&
		!dto.role
	  ) {
		throw new BadRequestException(
		  "role is required when kind is LOGISTIC_SERVICE_PROVIDER"
		);
	  }
  
	  if (
		dto.kind !== RegisterKind.LOGISTIC_SERVICE_PROVIDER &&
		dto.role
	  ) {
		throw new BadRequestException(
		  "role is only allowed when kind is LOGISTIC_SERVICE_PROVIDER"
		);
	  }

	  if (!normalized.fullName) {
		throw new BadRequestException(
		  normalized.isEnterprise ? "companyName is required" : "name is required"
		);
	  }

	  if (!normalized.phoneNumber) {
		throw new BadRequestException(
		  normalized.isEnterprise ? "companyPhoneNumber is required" : "phoneNumber is required"
		);
	  }

	  if (!normalized.emailAddress) {
		throw new BadRequestException(
		  normalized.isEnterprise ? "companyEmailAddress is required" : "emailAddress is required"
		);
	  }

	  if (!normalized.businessName) {
		throw new BadRequestException(
		  normalized.isEnterprise ? "companyName is required" : "name is required"
		);
	  }

	  if (!normalized.businessAddress) {
		throw new BadRequestException(
		  normalized.isEnterprise ? "companyAddress is required" : "physicalAddress is required"
		);
	  }
  
	  const existingUser = await this.prisma.user.findUnique({
		where: { email: normalized.emailAddress },
	  });
  
	  if (existingUser) {
		if (!existingUser.isVerified) {
		  const latestToken = await this.prisma.verificationToken.findFirst({
			where: { userId: existingUser.id },
			orderBy: { createdAt: "desc" },
		  });
  
		  if (latestToken) {
			const msSince = Date.now() - new Date(latestToken.createdAt).getTime();
			const cooldownMs = 60 * 1000;
			if (msSince < cooldownMs) {
			  throw new BadRequestException(
				"Verification email recently sent. Please wait a moment before retrying."
			  );
			}
		  }
  
		  await this.tokenService.deleteVerificationTokensByUser(existingUser.id);
		  const usesCodeVerification = this.usesCodeVerification(existingUser.kind);
		  const tokenRec = usesCodeVerification
			? await this.tokenService.createVerificationCode(existingUser.id)
			: await this.tokenService.createVerificationToken(existingUser.id);
		  const verificationUrl = usesCodeVerification
			? undefined
			: this.urlService.verificationUrl(tokenRec.token);
  
		  const emailContext = {
			fullName: normalized.fullName ?? existingUser.email,
			businessName: normalized.businessName ?? "",
			verificationUrl,
			verificationCode: usesCodeVerification ? tokenRec.token : undefined,
			phoneNumber: normalized.phoneNumber,
		  };
  
		  try {
			await this.mailer.sendVerificationEmail(existingUser.email!, emailContext);
		  } catch (emailErr) {
			try {
			  await this.tokenService.deleteVerificationTokensByUser(existingUser.id);
			} catch (e) {
			  this.logger.error(
				"Failed to cleanup token after email send failure: " +
				  ((e as any)?.message ?? e)
			  );
			}
			throw new BadRequestException(
			  "Failed to send verification email. Please try again later."
			);
		  }
  
		  return {
			ok: true,
			message: usesCodeVerification
			  ? "Account exists but not verified — verification code resent."
			  : "Account exists but not verified — verification email resent.",
		  };
		}
  
		throw new BadRequestException("Email is already registered");
	  }
  
	  const uploadPromises: Promise<any>[] = [];
	  if (files?.companyCert) {
		uploadPromises.push(
		  this.storage.uploadFile(files.companyCert, { folder: "company-docs" })
		);
	  }
	  if (files?.taxCert) {
		uploadPromises.push(
		  this.storage.uploadFile(files.taxCert, { folder: "company-docs" })
		);
	  }
  
	  const results = await Promise.all(uploadPromises);
  
	  try {
		const { company, user } = await this.prisma.$transaction(async (tx) => {
		  const newCompany = await tx.company.create({
			data: {
			  fullName: normalized.fullName!,
			  phoneNumber: normalized.phoneNumber!,
			  emailAddress: normalized.emailAddress!,
			  businessName: normalized.businessName!,
			  businessAddress: normalized.businessAddress!,
			  country: normalized.country,
			  language: normalized.language,
			  role:
				dto.kind === RegisterKind.LOGISTIC_SERVICE_PROVIDER
				  ? dto.role
				  : null,
			  documents: {
				create: results.map((r, idx) => ({
				  type:
					idx === 0
					  ? "COMPANY_REGISTRATION_CERTIFICATE"
					  : "TAX_REGISTRATION_CERTIFICATE",
				  url: r.url,
				})),
			  },
			},
		  });
  
		  const newUser = await tx.user.create({
			data: {
			  email: normalized.emailAddress,
			  phone: normalized.phoneNumber,
			  kind: dto.kind,
			  companyId: newCompany.id,
			  isVerified: false,
			},
		  });
  
		  return {
			company: newCompany,
			user: newUser,
		  };
		});
  
		const usesCodeVerification = this.usesCodeVerification(dto.kind);
		const tokenRec = usesCodeVerification
		  ? await this.tokenService.createVerificationCode(user.id)
		  : await this.tokenService.createVerificationToken(user.id);
		const verificationUrl = usesCodeVerification
		  ? undefined
		  : this.urlService.verificationUrl(tokenRec.token);
  
		const emailContext = {
		  fullName: normalized.fullName,
		  businessName: normalized.businessName,
		  verificationUrl,
		  verificationCode: usesCodeVerification ? tokenRec.token : undefined,
		  phoneNumber: normalized.phoneNumber,
		};
  
		try {
		  await this.mailer.sendVerificationEmail(user.email!, emailContext);
		} catch (emailErr) {
		  try {
			await this.prisma.$transaction([
			  this.prisma.verificationToken.deleteMany({
				where: { userId: user.id },
			  }),
			  this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
			  this.prisma.passwordResetToken.deleteMany({
				where: { userId: user.id },
			  }),
			  this.prisma.user.delete({ where: { id: user.id } }),
			  this.prisma.company.delete({ where: { id: company.id } }),
			]);
		  } catch (cleanupErr) {
			this.logger.error(
			  "Failed to cleanup after email send failure: " +
				((cleanupErr as any)?.message ?? String(cleanupErr))
			);
		  }
  
		  throw new BadRequestException(
			"Failed to send verification email. Please try again."
		  );
		}
  
		return {
		  ok: true,
		  verificationMethod: usesCodeVerification ? "CODE" : "EMAIL_LINK",
		};
	  } catch (err: any) {
		if (err?.code === "P2002") {
		  throw new BadRequestException("Email or phone already registered");
		}
		throw new BadRequestException(err.message || "Registration failed");
	  }
	}
  
	async verifyEmail(token: string) {
	  const rec = await this.tokenService.findVerificationToken(token);
  
	  if (!rec || rec.expiresAt < new Date()) {
		throw new BadRequestException("Invalid or expired token");
	  }
  
	  return {
		ok: true,
		email: rec.user?.email ?? null,
		companyId: rec.user?.companyId ?? null,
		expiresAt: rec.expiresAt,
		token: rec.token,
	  };
	}

	async verifyPhoneCode(emailAddress: string, verificationCode: string) {
	  if (!emailAddress) throw new BadRequestException("Missing emailAddress");
	  if (!verificationCode) throw new BadRequestException("Missing verificationCode");

	  const normalizedEmail = emailAddress.trim().toLowerCase();
	  const rec = await this.tokenService.findVerificationTokenForEmail(
		normalizedEmail,
		verificationCode
	  );

	  if (!rec || rec.expiresAt < new Date()) {
		throw new BadRequestException("Invalid or expired verification code");
	  }

	  if (!this.usesCodeVerification(rec.user?.kind)) {
		throw new BadRequestException("Verification code is only supported for enterprise and individual accounts");
	  }

	  const setupToken = randomBytes(24).toString("hex");
	  const updatedRec = await this.prisma.verificationToken.update({
		where: { id: rec.id },
		data: { token: setupToken },
	  });

	  return {
		ok: true,
		email: rec.user.email ?? null,
		phone: rec.user.phone ?? null,
		companyId: rec.user.companyId ?? null,
		expiresAt: updatedRec.expiresAt,
		verificationToken: updatedRec.token,
	  };
	}
  
	async verifyResetToken(token: string) {
	  if (!token) throw new BadRequestException("Missing token");
  
	  const rec = await this.tokenService.findPasswordResetToken(token);
	  if (!rec || rec.used || rec.expiresAt < new Date()) {
		throw new BadRequestException("Invalid or expired token");
	  }
  
	  return {
		ok: true,
		expiresAt: rec.expiresAt,
		token: rec.token,
	  };
	}
  
	async setPassword(verificationToken: string, password: string, retype: string) {
	  if (password !== retype) throw new BadRequestException("Passwords do not match");
	  if (!isStrongPassword(password)) throw new BadRequestException("Password is not strong enough");
	  if (/^\d{4}$/.test(verificationToken)) {
		throw new BadRequestException("Verify the code before setting a password");
	  }
  
	  const rec = await this.tokenService.findVerificationToken(verificationToken);
	  if (!rec || rec.expiresAt < new Date()) throw new BadRequestException("Invalid or expired token");
  
	  const hashed = await bcrypt.hash(password, 10);
  
	  const user = await this.prisma.$transaction(async (tx) => {
		const updatedUser = await tx.user.update({
		  where: { id: rec.userId },
		  data: { password: hashed, isVerified: true },
		  include: { company: true },
		});
  
		await tx.verificationToken.delete({ where: { id: rec.id } });
  
		return updatedUser;
	  });
  
	  const payload = {
		sub: user.id,
		email: user.email,
		kind: user.kind,
	  };
  
	  const accessToken = this.signAccessToken(payload);
  
	  const rawRefresh = this.createRefreshTokenRaw();
	  const tokenHash = this.hashToken(rawRefresh);
	  const expiresAt = add(new Date(), { days: this.refreshDays });
  
	  await this.prisma.refreshToken.create({
		data: {
		  userId: user.id,
		  tokenHash,
		  userAgent: null,
		  expiresAt,
		},
	  });
  
	  return {
		ok: true,
		accessToken,
		refreshToken: rawRefresh,
		user: {
		  id: user.id,
		  email: user.email,
		  phone: user.phone,
		  kind: user.kind,
		  name: user.company?.fullName ?? "User",
		  companyId: user.company?.id ?? null,
		  company: user.company
			? { id: user.company.id, businessName: user.company.businessName }
			: null,
		},
	  };
	}
  
	private signAccessToken(payload: any) {
	  const secret = this.cfg.get("JWT_SECRET");
	  const expiresIn = this.cfg.get("JWT_EXPIRES_IN") ?? "30m";
	  return this.jwt.sign(payload, { secret, expiresIn });
	}
  
	private createRefreshTokenRaw() {
	  return randomBytes(48).toString("hex");
	}
  
	private hashToken(token: string) {
	  return createHash("sha256").update(token).digest("hex");
	}
  
	async login(identifier: string, password: string) {
	  const user = await this.prisma.user.findFirst({
		where: { OR: [{ email: identifier }, { phone: identifier }] },
		include: {
		  company: true,
		},
	  });
  
	  if (!user || !user.password) throw new UnauthorizedException("Invalid credentials");
  
	  const ok = await bcrypt.compare(password, user.password);
	  if (!ok) throw new UnauthorizedException("Invalid credentials");
	  if (!user.isVerified) throw new UnauthorizedException("Email not verified");
  
	  const payload = {
		sub: user.id,
		email: user.email,
		kind: user.kind,
	  };
  
	  const accessToken = this.signAccessToken(payload);
	  const rawRefresh = this.createRefreshTokenRaw();
	  const tokenHash = this.hashToken(rawRefresh);
	  const expiresAt = add(new Date(), { days: this.refreshDays });
  
	  await this.prisma.refreshToken.create({
		data: {
		  userId: user.id,
		  tokenHash,
		  userAgent: null,
		  expiresAt,
		},
	  });
  
	  return {
		accessToken,
		refreshToken: rawRefresh,
		user: {
		  id: user.id,
		  email: user.email,
		  profilePicture: user.profilePicture,
		  phone: user.phone,
		  kind: user.kind,
		  name: user.company?.fullName ?? null,
		  companyId: user.company?.id ?? null,
		  company: user.company
			? { id: user.company.id, businessName: user.company.businessName }
			: null,
		},
	  };
	}
  
	async logout(input: { userId?: string | null; refreshToken?: string; refreshTokenId?: string }) {
	  try {
		if (input.refreshToken) {
		  const tokenHash = this.hashToken(input.refreshToken);
		  await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
		}
		if (input.refreshTokenId) {
		  await this.prisma.refreshToken.deleteMany({
			where: { id: input.refreshTokenId },
		  });
		}
		if (input.userId) {
		  await this.prisma.refreshToken.deleteMany({
			where: { userId: input.userId },
		  });
		}
	  } catch (err) {
		this.logger.error("Logout error (ignored): " + ((err as any)?.message ?? String(err)));
	  }
	}
  
	async requestPasswordReset(email: string) {
	  const genericResp = {
		ok: true,
		message:
		  "Password Reset Email Sent. Your password reset email has been successfully sent. It typically arrives within 5 minutes but may take up to 24 hours. If you have not received it after 24 hours, please contact our support team for assistance.",
	  };
  
	  if (!email) return genericResp;
  
	  const normalized = email.trim().toLowerCase();
  
	  const user = await this.prisma.user.findUnique({
		where: { email: normalized },
		include: { company: true },
	  });
  
	  if (!user) {
		await new Promise((r) => setTimeout(r, 150));
		return genericResp;
	  }
  
	  const recent = await this.prisma.passwordResetToken.findFirst({
		where: { userId: user.id },
		orderBy: { createdAt: "desc" },
	  });
  
	  if (recent) {
		const msSince = Date.now() - new Date(recent.createdAt).getTime();
		const cooldownMs = 60 * 1000;
		if (msSince < cooldownMs) {
		  this.logger.verbose(`Password reset requested too soon for user ${user.id}`);
		  return genericResp;
		}
	  }
  
	  const tokenRec = await this.tokenService.createPasswordResetToken(user.id);
	  const resetUrl = this.urlService.resetUrl(tokenRec.token);
  
	  const emailContext = {
		fullName: user.company?.fullName ?? user.email,
		resetUrl,
	  };
  
	  try {
		await this.mailer.sendResetPasswordEmail(user.email!, emailContext);
	  } catch (error) {
		try {
		  await this.tokenService.deletePasswordResetToken(tokenRec.id);
		} catch (delErr) {
		  this.logger.error(
			"Failed to delete password reset token after email failure: " +
			  ((delErr as any)?.message ?? delErr)
		  );
		}
		this.logger.error("Failed to send reset email:", (error as any)?.message ?? error);
	  }
  
	  return genericResp;
	}
  
	async resendVerificationEmail(email: string) {
	  if (!email) throw new BadRequestException("Missing email");
  
	  const user = await this.prisma.user.findUnique({
		where: { email },
		include: { company: true },
	  });
  
	  if (!user) return { ok: true };
  
	  if (user.isVerified) {
		return { ok: true, message: "Email already verified" };
	  }
  
	  const latestToken = await this.prisma.verificationToken.findFirst({
		where: { userId: user.id },
		orderBy: { createdAt: "desc" },
	  });
  
	  if (latestToken) {
		const msSince = Date.now() - new Date(latestToken.createdAt).getTime();
		const cooldownMs = 60 * 1000;
		if (msSince < cooldownMs) {
		  throw new BadRequestException(
			"Verification email recently sent. Please wait a moment before retrying."
		  );
		}
	  }
  
	  await this.tokenService.deleteVerificationTokensByUser(user.id);
  
	  const tokenRec = await this.tokenService.createVerificationToken(user.id);
	  const verificationUrl = this.urlService.verificationUrl(tokenRec.token);
  
	  const emailContext = {
		fullName: (user.company && (user.company as any).fullName) ?? user.email,
		businessName: (user.company && (user.company as any).businessName) ?? "",
		verificationUrl,
	  };
  
	  try {
		await this.mailer.sendVerificationEmail(user.email!, emailContext);
	  } catch (err) {
		try {
		  await this.tokenService.deleteVerificationTokensByUser(user.id);
		} catch (cleanupErr) {
		  this.logger.error(
			"Failed to cleanup token after resend email failure: " +
			  ((cleanupErr as any)?.message ?? String(cleanupErr))
		  );
		}
		this.logger.error(
		  "Failed to resend verification email: " +
			((err as any)?.message ?? String(err))
		);
		throw new BadRequestException(
		  "Failed to send verification email. Please try again later."
		);
	  }
  
	  return { ok: true, message: "Verification email resent" };
	}
  
	async resetPassword(token: string, password: string, retype: string) {
	  if (password !== retype) throw new BadRequestException("Passwords do not match");
	  if (!isStrongPassword(password)) throw new BadRequestException("Password is not strong enough");
  
	  const rec = await this.tokenService.findPasswordResetToken(token);
	  if (!rec || rec.used || rec.expiresAt < new Date()) {
		throw new BadRequestException("Invalid or expired token");
	  }
  
	  const existingUser = await this.prisma.user.findUnique({
		where: { id: rec.userId },
		select: { password: true },
	  });
  
	  if (existingUser?.password) {
		const isSameAsOld = await bcrypt.compare(password, existingUser.password);
		if (isSameAsOld) {
		  throw new BadRequestException("New password must be different from your previous password.");
		}
	  }
  
	  const hashed = await bcrypt.hash(password, 10);
  
	  const user = await this.prisma.$transaction(async (tx) => {
		const updatedUser = await tx.user.update({
		  where: { id: rec.userId },
		  data: {
			password: hashed,
			isVerified: true,
		  },
		  include: { company: true },
		});
  
		await tx.passwordResetToken.update({
		  where: { id: rec.id },
		  data: { used: true },
		});
  
		return updatedUser;
	  });
  
	  const payload = {
		sub: user.id,
		email: user.email,
		kind: user.kind,
	  };
  
	  const accessToken = this.signAccessToken(payload);
  
	  const rawRefresh = this.createRefreshTokenRaw();
	  const tokenHash = this.hashToken(rawRefresh);
	  const expiresAt = add(new Date(), { days: this.refreshDays });
  
	  await this.prisma.refreshToken.create({
		data: {
		  userId: user.id,
		  tokenHash,
		  userAgent: null,
		  expiresAt,
		},
	  });
  
	  return {
		ok: true,
		accessToken,
		refreshToken: rawRefresh,
		user: {
		  id: user.id,
		  email: user.email,
		  phone: user.phone,
		  kind: user.kind,
		  name: user.company?.fullName ?? "User",
		  company: user.company
			? { id: user.company.id, businessName: user.company.businessName }
			: null,
		},
	  };
	}
  }
