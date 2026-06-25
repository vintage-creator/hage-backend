import { Module } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
   imports: [PrismaModule],
   controllers: [WarehousesController],
   providers: [WarehousesService],
   exports: [WarehousesService],
})
export class WarehousesModule {}
