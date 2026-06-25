import { Module } from '@nestjs/common';
import { TransporterBidController } from './transporter-bid.controller';
import { TransporterBidService } from './transporter-bid.service';
import { ShipmentsModule } from '../shipments/shipments.module';

@Module({
   imports: [ShipmentsModule],
   controllers: [TransporterBidController],
   providers: [TransporterBidService],
   exports: [TransporterBidService],
})
export class TransporterBidModule {}
