import { Module } from '@nestjs/common';
import { TransporterRatingController } from './transporter-rating.controller';
import { TransporterRatingService } from './transporter-rating.service';

@Module({
   controllers: [TransporterRatingController],
   providers: [TransporterRatingService],
   exports: [TransporterRatingService],
})
export class TransporterRatingModule {}
