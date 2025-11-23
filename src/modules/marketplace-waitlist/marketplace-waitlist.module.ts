import { Module } from '@nestjs/common';
import { MarketplaceWaitlistController } from './marketplace-waitlist.controller';
import { MarketplaceWaitlistService } from './marketplace-waitlist.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [MarketplaceWaitlistController],
  providers: [MarketplaceWaitlistService, PrismaService, MailService, ConfigService],
})
export class MarketplaceWaitlistModule {}
