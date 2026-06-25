// src/modules/auth/auth.service.ts
import { Inject, Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import TokenService from './token.service';
import UrlService from './url.service';
import { isStrongPassword } from '../../utils/password';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { add } from 'date-fns';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StorageService } from '../../common/storage/storage.interface';
import { MailService } from '../../common/mail/mail.service';
import { RegisterCompanyDto, RegisterKind } from './dto/register-company.dto';

@Injectable()
export class AuthService {
   private readonly logger = new Logger(AuthService.name);
   private refreshDays: number;

   private usesCodeVerification(kind?: string | null) {
      return kind === RegisterKind.ENTERPRISE || kind === RegisterKind.INDIVIDUAL;
   }

   private cleanEmail(email?: string | null) {
      return email?.trim();
   }

   private normalizePhoneNumber(phone?: string | null, country?: string | null) {
      if (!phone) return undefined;

      const raw = phone.trim();
      const compact = raw.replace(/[\s().-]/g, '');
      if (!compact) return undefined;

      const countryValue = country?.trim().toLowerCase();
      const isNigeria = countryValue === 'nigeria' || countryValue === 'ng';

      if (compact.startsWith('+')) return compact;
      if (compact.startsWith('00')) return `+${compact.slice(2)}`;
      if (isNigeria && compact.startsWith('0')) return `+234${compact.slice(1)}`;
      if (isNigeria && compact.startsWith('234')) return `+${compact}`;

      return compact;
   }

   private normalizeRegistration(dto: RegisterCompanyDto) {
      const isIndividual = dto.kind === RegisterKind.INDIVIDUAL;
      const isEnterprise = dto.kind === RegisterKind.ENTERPRISE;
      const fullName = (dto.fullName ?? dto.name ?? dto.companyName ?? dto.businessName)?.trim();
      const country = dto.country?.trim();
      const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber ?? dto.companyPhoneNumber, country);
      const emailAddress = this.cleanEmail(dto.emailAddress ?? dto.companyEmailAddress);
      const businessName = (dto.businessName ?? dto.companyName ?? (isIndividual ? dto.name : undefined) ?? fullName)?.trim();
      const businessAddress = (dto.businessAddress ?? dto.physicalAddress ?? dto.companyAddress)?.trim();
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
      @Inject('StorageService') private readonly storage: StorageService,
      private readonly mailer: MailService,
      private readonly tokenService: TokenService,
      private readonly urlService: UrlService,
   ) {
      this.refreshDays = Number(this.cfg.get('REFRESH_EXPIRES_DAYS') ?? 30);
   }

   async registerCompany(
      dto: RegisterCompanyDto,
      files: {
         companyCert?: Express.Multer.File;
         taxCert?: Express.Multer.File;
      },
   ) {
      if (!dto.kind) throw new BadRequestException('User kind is required');
      const normalized = this.normalizeRegistration(dto);

      if (dto.kind === RegisterKind.LOGISTIC_SERVICE_PROVIDER && !dto.role) {
         throw new BadRequestException('role is required when kind is LOGISTIC_SERVICE_PROVIDER');
      }

      if (dto.kind !== RegisterKind.LOGISTIC_SERVICE_PROVIDER && dto.role) {
         throw new BadRequestException('role is only allowed when kind is LOGISTIC_SERVICE_PROVIDER');
      }

      if (!normalized.fullName) {
         throw new BadRequestException(normalized.isEnterprise ? 'companyName is required' : 'name is required');
      }

      if (!normalized.phoneNumber) {
         throw new BadRequestException(normalized.isEnterprise ? 'companyPhoneNumber is required' : 'phoneNumber is required');
      }

      if (this.usesCodeVerification(dto.kind) && !/^\+[1-9]\d{7,14}$/.test(normalized.phoneNumber)) {
         throw new BadRequestException('Phone number must be in international format, for example +2347065737817');
      }

      if (!normalized.emailAddress) {
         throw new BadRequestException(normalized.isEnterprise ? 'companyEmailAddress is required' : 'emailAddress is required');
      }

      if (!normalized.businessName) {
         throw new BadRequestException(normalized.isEnterprise ? 'companyName is required' : 'name is required');
      }

      if (!normalized.businessAddress) {
         throw new BadRequestException(normalized.isEnterprise ? 'companyAddress is required' : 'physicalAddress is required');
      }

      const existingUser = await this.prisma.user.findFirst({
         where: { email: { equals: normalized.emailAddress, mode: 'insensitive' } },
      });

      if (existingUser) {
         if (!existingUser.isVerified) {
            const usesCodeVerification = this.usesCodeVerification(existingUser.kind);

            if (!usesCodeVerification) {
               const latestToken = await this.prisma.verificationToken.findFirst({
                  where: { userId: existingUser.id },
                  orderBy: { createdAt: 'desc' },
               });
               if (latestToken) {
                  const msSince = Date.now() - new Date(latestToken.createdAt).getTime();
                  const cooldownMs = 60 * 1000;
                  if (msSince < cooldownMs) {
                     throw new BadRequestException('Verification email recently sent. Please wait a moment before retrying.');
                  }
               }
            }

            await this.tokenService.deleteVerificationTokensByUser(existingUser.id);

            if (usesCodeVerification) {
               const phoneForVerification = this.normalizePhoneNumber(existingUser.phone ?? normalized.phoneNumber, normalized.country);
               if (!phoneForVerification || !/^\+[1-9]\d{7,14}$/.test(phoneForVerification)) {
                  throw new BadRequestException('Phone number must be in international format, for example +2347065737817');
               }
               const tokenRec = await this.tokenService.createVerificationCode(existingUser.id);

               const emailContext = {
                  fullName: normalized.fullName ?? existingUser.email,
                  businessName: normalized.businessName ?? '',
                  verificationCode: tokenRec.token,
                  phoneNumber: phoneForVerification,
               };

               try {
                  await this.mailer.sendVerificationEmail(existingUser.email!, emailContext);
               } catch (emailErr) {
                  try {
                     await this.tokenService.deleteVerificationTokensByUser(existingUser.id);
                  } catch (e) {
                     this.logger.error('Failed to cleanup token after code email send failure: ' + ((e as any)?.message ?? e));
                  }
                  throw new BadRequestException('Failed to send verification code. Please try again later.');
               }
            } else {
               const tokenRec = await this.tokenService.createVerificationToken(existingUser.id);
               const verificationUrl = this.urlService.verificationUrl(tokenRec.token);

               const emailContext = {
                  fullName: normalized.fullName ?? existingUser.email,
                  businessName: normalized.businessName ?? '',
                  verificationUrl,
                  phoneNumber: normalized.phoneNumber,
               };

               try {
                  await this.mailer.sendVerificationEmail(existingUser.email!, emailContext);
               } catch (emailErr) {
                  try {
                     await this.tokenService.deleteVerificationTokensByUser(existingUser.id);
                  } catch (e) {
                     this.logger.error('Failed to cleanup token after email send failure: ' + ((e as any)?.message ?? e));
                  }
                  throw new BadRequestException('Failed to send verification email. Please try again later.');
               }
            }

            return {
               ok: true,
               message: usesCodeVerification ? 'Account exists but not verified — phone verification code resent.' : 'Account exists but not verified — verification email resent.',
            };
         }

         throw new BadRequestException('Email is already registered');
      }

      const uploadPromises: Promise<any>[] = [];
      if (files?.companyCert) {
         uploadPromises.push(this.storage.uploadFile(files.companyCert, { folder: 'company-docs' }));
      }
      if (files?.taxCert) {
         uploadPromises.push(this.storage.uploadFile(files.taxCert, { folder: 'company-docs' }));
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
                  role: dto.kind === RegisterKind.LOGISTIC_SERVICE_PROVIDER ? dto.role : null,
                  documents: {
                     create: results.map((r, idx) => ({
                        type: idx === 0 ? 'COMPANY_REGISTRATION_CERTIFICATE' : 'TAX_REGISTRATION_CERTIFICATE',
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
         try {
            if (usesCodeVerification) {
               const tokenRec = await this.tokenService.createVerificationCode(user.id);

               const emailContext = {
                  fullName: normalized.fullName,
                  businessName: normalized.businessName,
                  verificationCode: tokenRec.token,
                  phoneNumber: normalized.phoneNumber,
               };

               await this.mailer.sendVerificationEmail(user.email!, emailContext);
            } else {
               const tokenRec = await this.tokenService.createVerificationToken(user.id);
               const verificationUrl = this.urlService.verificationUrl(tokenRec.token);

               const emailContext = {
                  fullName: normalized.fullName,
                  businessName: normalized.businessName,
                  verificationUrl,
                  phoneNumber: normalized.phoneNumber,
               };

               await this.mailer.sendVerificationEmail(user.email!, emailContext);
            }
         } catch (verificationErr) {
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
               this.logger.error('Failed to cleanup after verification send failure: ' + ((cleanupErr as any)?.message ?? String(cleanupErr)));
            }

            const message = (verificationErr as any)?.response?.message || (verificationErr as any)?.message;
            throw new BadRequestException(message || (usesCodeVerification ? 'Failed to send verification code. Please try again.' : 'Failed to send verification email. Please try again.'));
         }

         return {
            ok: true,
            verificationMethod: usesCodeVerification ? 'PHONE_CODE' : 'EMAIL_LINK',
         };
      } catch (err: any) {
         if (err?.code === 'P2002') {
            throw new BadRequestException('Email or phone already registered');
         }
         throw new BadRequestException(err.message || 'Registration failed');
      }
   }
   async verifyEmail(token: string) {
      const rec = await this.tokenService.findVerificationToken(token);

      if (!rec || rec.expiresAt < new Date()) {
         throw new BadRequestException('Invalid or expired token');
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
      if (!emailAddress) throw new BadRequestException('Missing emailAddress');
      if (!verificationCode) throw new BadRequestException('Missing verificationCode');

      const normalizedEmail = this.cleanEmail(emailAddress);
      if (!normalizedEmail) throw new BadRequestException('Missing emailAddress');
      const rec = await this.tokenService.findVerificationTokenForEmail(normalizedEmail, verificationCode);

      if (!rec || rec.expiresAt < new Date()) {
         throw new BadRequestException('Invalid or expired verification code');
      }

      if (!this.usesCodeVerification(rec.user?.kind)) {
         throw new BadRequestException('Verification code is only supported for enterprise and individual accounts');
      }

      if (!rec.user?.phone) {
         throw new BadRequestException('Phone number is required for verification');
      }

      await this.prisma.verificationToken.delete({ where: { id: rec.id } });
      const emailToken = await this.tokenService.createVerificationToken(rec.user.id);
      const verificationUrl = this.urlService.verificationUrl(emailToken.token);

      const emailContext = {
         fullName: rec.user.email,
         businessName: '',
         verificationUrl,
         phoneNumber: rec.user.phone,
      };

      try {
         await this.mailer.sendVerificationEmail(rec.user.email!, emailContext);
      } catch (emailErr) {
         try {
            await this.tokenService.deleteVerificationTokensByUser(rec.user.id);
         } catch (cleanupErr) {
            this.logger.error('Failed to cleanup token after phone OTP email send failure: ' + ((cleanupErr as any)?.message ?? String(cleanupErr)));
         }
         throw new BadRequestException('Phone verified, but failed to send verification email. Please try again.');
      }

      return {
         ok: true,
         message: 'Phone number verified. Verification email sent.',
         email: rec.user.email ?? null,
         phone: rec.user.phone ?? null,
         companyId: rec.user.companyId ?? null,
         expiresAt: emailToken.expiresAt,
      };
   }

   async verifyResetToken(token: string) {
      if (!token) throw new BadRequestException('Missing token');

      const rec = await this.tokenService.findPasswordResetToken(token);
      if (!rec || rec.used || rec.expiresAt < new Date()) {
         throw new BadRequestException('Invalid or expired token');
      }

      return {
         ok: true,
         expiresAt: rec.expiresAt,
         token: rec.token,
      };
   }

   async setPassword(verificationToken: string, password: string, retype: string) {
      if (password !== retype) throw new BadRequestException('Passwords do not match');
      if (!isStrongPassword(password)) throw new BadRequestException('Password is not strong enough');
      if (/^\d{4}$/.test(verificationToken)) {
         throw new BadRequestException('Verify the code before setting a password');
      }

      const rec = await this.tokenService.findVerificationToken(verificationToken);
      if (!rec || rec.expiresAt < new Date()) throw new BadRequestException('Invalid or expired token');

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
            name: user.company?.fullName ?? 'User',
            companyId: user.company?.id ?? null,
            company: user.company ? { id: user.company.id, businessName: user.company.businessName } : null,
         },
      };
   }

   private signAccessToken(payload: any) {
      const secret = this.cfg.get('JWT_SECRET');
      const expiresIn = this.cfg.get<string>('JWT_EXPIRES_IN');
      const sessionsNeverExpire = ['never', 'none', 'false', '0'].includes((expiresIn ?? '').trim().toLowerCase());
      return sessionsNeverExpire ? this.jwt.sign(payload, { secret }) : this.jwt.sign(payload, { secret, expiresIn: (expiresIn ?? '30m') as any });
   }

   private createRefreshTokenRaw() {
      return randomBytes(48).toString('hex');
   }

   private hashToken(token: string) {
      return createHash('sha256').update(token).digest('hex');
   }

   async login(identifier: string, password: string) {
      const normalizedIdentifier = identifier?.trim();
      const user = await this.prisma.user.findFirst({
         where: {
            OR: [
               { email: { equals: normalizedIdentifier, mode: 'insensitive' } },
               { phone: normalizedIdentifier },
            ],
         },
         include: {
            company: true,
         },
      });

      if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) throw new UnauthorizedException('Invalid credentials');
      if (user.deactivatedAt) throw new UnauthorizedException('Account deactivated');
      if (!user.isVerified) throw new UnauthorizedException('Email not verified');

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
            company: user.company ? { id: user.company.id, businessName: user.company.businessName } : null,
         },
      };
   }

   async refreshSession(refreshToken: string) {
      if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

      const tokenHash = this.hashToken(refreshToken);
      const stored = await this.prisma.refreshToken.findFirst({
         where: { tokenHash },
         include: {
            user: {
               include: {
                  company: true,
               },
            },
         },
      });

      const refreshTokensNeverExpire = ['never', 'none', 'false', '0'].includes((this.cfg.get<string>('JWT_EXPIRES_IN') ?? '').trim().toLowerCase());

      if (!stored || (!refreshTokensNeverExpire && stored.expiresAt < new Date())) {
         if (stored) {
            await this.prisma.refreshToken.delete({ where: { id: stored.id } });
         }
         throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (!stored.user?.isVerified) {
         throw new UnauthorizedException('Invalid refresh token');
      }
      if (stored.user.deactivatedAt) {
         throw new UnauthorizedException('Account deactivated');
      }

      const payload = {
         sub: stored.user.id,
         email: stored.user.email,
         kind: stored.user.kind,
      };

      const accessToken = this.signAccessToken(payload);
      const rawRefresh = this.createRefreshTokenRaw();
      const newTokenHash = this.hashToken(rawRefresh);
      const expiresAt = add(new Date(), { days: this.refreshDays });

      await this.prisma.$transaction([
         this.prisma.refreshToken.delete({ where: { id: stored.id } }),
         this.prisma.refreshToken.create({
            data: {
               userId: stored.user.id,
               tokenHash: newTokenHash,
               userAgent: stored.userAgent,
               expiresAt,
            },
         }),
      ]);

      return {
         accessToken,
         refreshToken: rawRefresh,
         user: {
            id: stored.user.id,
            email: stored.user.email,
            profilePicture: stored.user.profilePicture,
            phone: stored.user.phone,
            kind: stored.user.kind,
            name: stored.user.company?.fullName ?? null,
            companyId: stored.user.company?.id ?? null,
            company: stored.user.company ? { id: stored.user.company.id, businessName: stored.user.company.businessName } : null,
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
         this.logger.error('Logout error (ignored): ' + ((err as any)?.message ?? String(err)));
      }
   }

   async requestPasswordReset(email: string) {
      const genericResp = {
         ok: true,
         message:
            'Password Reset Email Sent. Your password reset email has been successfully sent. It typically arrives within 5 minutes but may take up to 24 hours. If you have not received it after 24 hours, please contact our support team for assistance.',
      };

      if (!email) return genericResp;

      const normalized = this.cleanEmail(email);

      const user = await this.prisma.user.findFirst({
         where: { email: { equals: normalized, mode: 'insensitive' } },
         include: { company: true },
      });

      if (!user) {
         await new Promise((r) => setTimeout(r, 150));
         return genericResp;
      }

      const recent = await this.prisma.passwordResetToken.findFirst({
         where: { userId: user.id },
         orderBy: { createdAt: 'desc' },
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
            this.logger.error('Failed to delete password reset token after email failure: ' + ((delErr as any)?.message ?? delErr));
         }
         this.logger.error('Failed to send reset email:', (error as any)?.message ?? error);
      }

      return genericResp;
   }

   async resendVerificationEmail(email: string) {
      if (!email) throw new BadRequestException('Missing email');

      const normalized = this.cleanEmail(email);

      const user = await this.prisma.user.findFirst({
         where: { email: { equals: normalized, mode: 'insensitive' } },
         include: { company: true },
      });

      if (!user) return { ok: true };

      if (user.isVerified) {
         return { ok: true, message: 'Email already verified' };
      }

      const latestToken = await this.prisma.verificationToken.findFirst({
         where: { userId: user.id },
         orderBy: { createdAt: 'desc' },
      });

      if (latestToken) {
         const msSince = Date.now() - new Date(latestToken.createdAt).getTime();
         const cooldownMs = 60 * 1000;
         if (msSince < cooldownMs) {
            throw new BadRequestException('Verification email recently sent. Please wait a moment before retrying.');
         }
      }

      await this.tokenService.deleteVerificationTokensByUser(user.id);

      const tokenRec = await this.tokenService.createVerificationToken(user.id);
      const verificationUrl = this.urlService.verificationUrl(tokenRec.token);

      const emailContext = {
         fullName: (user.company && (user.company as any).fullName) ?? user.email,
         businessName: (user.company && (user.company as any).businessName) ?? '',
         verificationUrl,
      };

      try {
         await this.mailer.sendVerificationEmail(user.email!, emailContext);
      } catch (err) {
         try {
            await this.tokenService.deleteVerificationTokensByUser(user.id);
         } catch (cleanupErr) {
            this.logger.error('Failed to cleanup token after resend email failure: ' + ((cleanupErr as any)?.message ?? String(cleanupErr)));
         }
         this.logger.error('Failed to resend verification email: ' + ((err as any)?.message ?? String(err)));
         throw new BadRequestException('Failed to send verification email. Please try again later.');
      }

      return { ok: true, message: 'Verification email resent' };
   }

   async resetPassword(token: string, password: string, retype: string) {
      if (password !== retype) throw new BadRequestException('Passwords do not match');
      if (!isStrongPassword(password)) throw new BadRequestException('Password is not strong enough');

      const rec = await this.tokenService.findPasswordResetToken(token);
      if (!rec || rec.used || rec.expiresAt < new Date()) {
         throw new BadRequestException('Invalid or expired token');
      }

      const existingUser = await this.prisma.user.findUnique({
         where: { id: rec.userId },
         select: { password: true },
      });

      if (existingUser?.password) {
         const isSameAsOld = await bcrypt.compare(password, existingUser.password);
         if (isSameAsOld) {
            throw new BadRequestException('New password must be different from your previous password.');
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
            name: user.company?.fullName ?? 'User',
            company: user.company ? { id: user.company.id, businessName: user.company.businessName } : null,
         },
      };
   }
}
