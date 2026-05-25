import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSlaDto } from './dto/create-sla.dto';
import {
   InviteTeamMemberDto,
   LanguageSettingDto,
   NotificationSettingsDto,
   PaymentMethodDto,
   PaymentMethodInputType,
   ReportIssueDto,
   UpdateEndUserProfileDto,
   UpdateEnterpriseProfileDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService {
   constructor(private readonly prisma: PrismaService) {}

   private async getUser(userId: string) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
      if (!user) throw new NotFoundException('User not found');
      return user;
   }

   private last4(value?: string) {
      return value ? value.slice(-4) : undefined;
   }

   async createEnterpriseSla(userId: string, dto: CreateSlaDto) {
      const user = await this.getUser(userId);
      if (user.kind !== 'ENTERPRISE') {
         throw new ForbiddenException('SLA settings are only available to enterprise users');
      }
      if (!user.companyId) throw new BadRequestException('Enterprise company profile is required');

      return this.prisma.slaSetting.create({
         data: {
            companyId: user.companyId,
            companyName: dto.companyName,
            deliveryTimeCommitment: dto.deliveryTimeCommitment,
            routeFrom: dto.route.from,
            routeTo: dto.route.to,
            vehicleType: dto.vehicleType,
            onTimeDeliveryTargetValue: dto.onTimeDeliveryRate.targetValue,
            onTimeDeliveryThresholdType: dto.onTimeDeliveryRate.thresholdType,
            statePenalty: dto.statePenalty,
            stateIncentive: dto.stateIncentive,
            validityStartDate: new Date(dto.validityPeriod.startDate),
            validityEndDate: new Date(dto.validityPeriod.endDate),
         },
      });
   }

   async listEnterpriseSlas(userId: string) {
      const user = await this.getUser(userId);
      if (user.kind !== 'ENTERPRISE') throw new ForbiddenException('SLA settings are only available to enterprise users');
      if (!user.companyId) return [];
      return this.prisma.slaSetting.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: 'desc' } });
   }

   async reportIssue(userId: string, dto: ReportIssueDto) {
      return this.prisma.reportedIssue.create({
         data: {
            userId,
            text: dto.text,
         },
      });
   }

   async addPaymentMethod(userId: string, dto: PaymentMethodDto) {
      if (dto.type === PaymentMethodInputType.CARD) {
         if (!dto.cardNumber || !dto.cardBrand || !dto.cardholderName || !dto.expiration || !dto.cvv || !dto.postalCode) {
            throw new BadRequestException('Card payment method requires cardholderName, cardBrand, cardNumber, expiration, cvv, and postalCode');
         }

         return this.prisma.paymentMethod.create({
            data: {
               userId,
               type: 'CARD',
               cardholderName: dto.cardholderName,
               cardBrand: dto.cardBrand,
               cardLast4: this.last4(dto.cardNumber),
               expiration: dto.expiration,
               postalCode: dto.postalCode,
            },
         });
      }

      if (!dto.bankName || !dto.accountName || !dto.accountNumber || !dto.bankSortCode || !dto.currency) {
         throw new BadRequestException('Local bank payment method requires bankName, accountName, accountNumber, bankSortCode, and currency');
      }

      return this.prisma.paymentMethod.create({
         data: {
            userId,
            type: 'LOCAL_BANK',
            bankName: dto.bankName,
            accountName: dto.accountName,
            accountNumberLast4: this.last4(dto.accountNumber),
            bankSortCode: dto.bankSortCode,
            currency: dto.currency,
         },
      });
   }

   async listPaymentMethods(userId: string) {
      return this.prisma.paymentMethod.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
   }

   async updatePaymentMethod(userId: string, id: string, dto: PaymentMethodDto) {
      const existing = await this.prisma.paymentMethod.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundException('Payment method not found');

      const data =
         dto.type === PaymentMethodInputType.CARD
            ? {
                 type: 'CARD' as const,
                 cardholderName: dto.cardholderName,
                 cardBrand: dto.cardBrand,
                 cardLast4: this.last4(dto.cardNumber),
                 expiration: dto.expiration,
                 postalCode: dto.postalCode,
                 bankName: null,
                 accountName: null,
                 accountNumberLast4: null,
                 bankSortCode: null,
                 currency: null,
              }
            : {
                 type: 'LOCAL_BANK' as const,
                 bankName: dto.bankName,
                 accountName: dto.accountName,
                 accountNumberLast4: this.last4(dto.accountNumber),
                 bankSortCode: dto.bankSortCode,
                 currency: dto.currency,
                 cardholderName: null,
                 cardBrand: null,
                 cardLast4: null,
                 expiration: null,
                 postalCode: null,
              };

      return this.prisma.paymentMethod.update({ where: { id }, data });
   }

   async removePaymentMethod(userId: string, id: string) {
      const existing = await this.prisma.paymentMethod.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundException('Payment method not found');
      await this.prisma.paymentMethod.delete({ where: { id } });
      return { ok: true };
   }

   async updateLanguage(userId: string, dto: LanguageSettingDto) {
      const user = await this.getUser(userId);
      if (!user.companyId) throw new BadRequestException('Company profile is required');
      return this.prisma.company.update({
         where: { id: user.companyId },
         data: { language: dto.language },
      });
   }

   async updateNotifications(userId: string, dto: NotificationSettingsDto) {
      return this.prisma.notificationSetting.upsert({
         where: { userId },
         create: {
            userId,
            realTimeShipmentStatus: dto.realTimeShipmentStatus,
            messaging: dto.messaging,
            escalationsOrDispute: dto.escalationsOrDispute,
         },
         update: {
            realTimeShipmentStatus: dto.realTimeShipmentStatus,
            messaging: dto.messaging,
            escalationsOrDispute: dto.escalationsOrDispute,
         },
      });
   }

   async getNotifications(userId: string) {
      return this.prisma.notificationSetting.upsert({
         where: { userId },
         create: { userId },
         update: {},
      });
   }

   async inviteTeamMember(userId: string, dto: InviteTeamMemberDto) {
      const user = await this.getUser(userId);
      if (user.kind !== 'ENTERPRISE') throw new ForbiddenException('Team management is only available to enterprise users');
      return this.prisma.teamInvite.create({
         data: {
            invitedById: userId,
            companyId: user.companyId,
            email: dto.email,
         },
      });
   }

   async updateEnterpriseProfile(userId: string, dto: UpdateEnterpriseProfileDto) {
      const user = await this.getUser(userId);
      if (user.kind !== 'ENTERPRISE') throw new ForbiddenException('Enterprise profile update is only available to enterprise users');
      if (!user.companyId) throw new BadRequestException('Company profile is required');
      return this.prisma.$transaction(async (tx) => {
         const company = await tx.company.update({
            where: { id: user.companyId! },
            data: {
               businessName: dto.enterpriseName,
               fullName: dto.enterpriseName,
               businessAddress: dto.physicalAddress,
               emailAddress: dto.email,
               phoneNumber: dto.phoneNumber,
            },
         });
         const updatedUser = await tx.user.update({
            where: { id: userId },
            data: {
               email: dto.email,
               phone: dto.phoneNumber,
            },
         });
         return { company, user: updatedUser };
      });
   }

   async updateEndUserProfile(userId: string, dto: UpdateEndUserProfileDto) {
      const user = await this.getUser(userId);
      if (user.kind !== 'INDIVIDUAL') throw new ForbiddenException('End user profile update is only available to individual users');
      if (!user.companyId) throw new BadRequestException('Profile is required');
      return this.prisma.$transaction(async (tx) => {
         const company = await tx.company.update({
            where: { id: user.companyId! },
            data: {
               fullName: dto.userName,
               businessName: dto.userName,
               businessAddress: dto.physicalAddress,
               emailAddress: dto.email,
               phoneNumber: dto.phoneNumber,
            },
         });
         const updatedUser = await tx.user.update({
            where: { id: userId },
            data: {
               email: dto.email,
               phone: dto.phoneNumber,
            },
         });
         return { company, user: updatedUser };
      });
   }

   async deactivateAccount(userId: string) {
      await this.prisma.$transaction([this.prisma.refreshToken.deleteMany({ where: { userId } }), this.prisma.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } })]);
      return { ok: true, message: 'Account deactivated' };
   }

   async logout(userId: string) {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
      return { ok: true, message: 'Logged out' };
   }
}
