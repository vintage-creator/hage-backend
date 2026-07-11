import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { LastMileController } from './last-mile.controller';
import { LastMileService } from './last-mile.service';

@Module({
   imports: [PrismaModule, ConfigModule],
   controllers: [LastMileController],
   providers: [LastMileService],
   exports: [LastMileService],
})
export class LastMileModule {}
