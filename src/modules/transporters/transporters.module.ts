import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../../common/mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { TransportersController } from './transporters.controller';
import { TransportersService } from './transporters.service';

@Module({
   imports: [PrismaModule, MailModule, AuthModule],
   controllers: [TransportersController],
   providers: [TransportersService],
   exports: [TransportersService],
})
export class TransportersModule {}
