import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';

@Injectable()
export class MarketplaceWaitlistService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly mail: MailService,
      private readonly config: ConfigService,
   ) {}

   async register(dto: CreateWaitlistDto) {
      const existing = await this.prisma.marketplaceWaitlist.findUnique({
         where: { email: dto.email },
      });

      if (existing) {
         throw new BadRequestException('This email has already joined the waitlist.');
      }

      const entry = await this.prisma.marketplaceWaitlist.create({
         data: {
            fullName: dto.fullName,
            email: dto.email,
            country: dto.country,
            industry: dto.industry,
         },
      });

      const adminEmail = this.config.get('ADMIN_EMAIL');
      if (adminEmail) {
         await this.mail.sendWaitlistAdminNotification(adminEmail, {
            fullName: entry.fullName,
            email: entry.email,
            country: entry.country,
            industry: entry.industry,
         });
      }

      return {
         message: 'Successfully joined the marketplace waitlist.',
         entry,
      };
   }

   async getAll() {
      return this.prisma.marketplaceWaitlist.findMany({
         orderBy: { createdAt: 'desc' },
      });
   }
}
