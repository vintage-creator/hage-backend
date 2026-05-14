import { Module } from '@nestjs/common';
import { MarketplaceWaitlistController } from './marketplace-waitlist.controller';
import { MarketplaceWaitlistService } from './marketplace-waitlist.service';
import { PrismaService } from '../../prisma/prisma.service';
@Module({
  controllers: [MarketplaceWaitlistController],
  providers: [MarketplaceWaitlistService, PrismaService],
})
export class MarketplaceWaitlistModule {}
