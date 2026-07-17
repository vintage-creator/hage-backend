import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryService } from '../../common/storage/cloudinary.service';
import { LastMileController } from './last-mile.controller';
import { LastMileService } from './last-mile.service';

@Module({
   imports: [PrismaModule, ConfigModule],
   controllers: [LastMileController],
   providers: [LastMileService, { provide: 'StorageService', useClass: CloudinaryService }],
   exports: [LastMileService],
})
export class LastMileModule {}
