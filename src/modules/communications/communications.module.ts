import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { VoiceWebhookController } from './voice-webhook.controller';

@Module({
   imports: [ConfigModule, PrismaModule],
   controllers: [CommunicationsController, VoiceWebhookController],
   providers: [CommunicationsService],
})
export class CommunicationsModule {}
