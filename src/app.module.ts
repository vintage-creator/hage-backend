import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProfileModule } from './modules/profile/profile.module';
import { MarketplaceWaitlistModule } from './modules/marketplace-waitlist/marketplace-waitlist.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TransporterBidModule } from './modules/transporter-bid/transporter-bid.module';
import { TransporterRatingModule } from './modules/transporter-rating/transporter-rating.module';
import { PaymentModule } from './modules/payment/payment.module';

@Module({
   imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule,
      AuthModule,
      ShipmentsModule,
      NotificationsModule,
      WarehousesModule,
      InventoryModule,
      ProfileModule,
      SettingsModule,
      MarketplaceWaitlistModule,
      TransporterBidModule,
      TransporterRatingModule,
      PaymentModule,
   ],
   controllers: [],
   providers: [],
})
export class AppModule {}
