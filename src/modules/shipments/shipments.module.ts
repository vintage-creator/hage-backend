import { Module } from '@nestjs/common';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryService } from '../../common/storage/cloudinary.service';
import { MailService } from '../../common/mail/mail.service';
import { ConfigModule } from '@nestjs/config';
import UrlService from '../auth/url.service';

@Module({
   imports: [
      PrismaModule,
      ConfigModule, // ensures MailService has access to env vars
   ],
   controllers: [ShipmentsController],
   providers: [ShipmentsService, MailService, UrlService, { provide: 'StorageService', useClass: CloudinaryService }],
   exports: [ShipmentsService],
})
export class ShipmentsModule {}
