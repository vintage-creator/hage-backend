import { Controller, Post, Get, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TransporterRatingService } from './transporter-rating.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { Request } from 'express';

@ApiTags('transporter-ratings')
@Controller('transporters/:transporterId/ratings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class TransporterRatingController {
   constructor(private readonly svc: TransporterRatingService) {}

   @Post()
   @ApiParam({ name: 'transporterId' })
   @ApiOperation({ summary: 'Rate a transporter', description: 'Submit a star rating (1–5) for a transporter after a completed shipment. One rating per shipment per user.' })
   rateTransporter(@Param('transporterId') transporterId: string, @Body() dto: CreateRatingDto, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.rateTransporter(transporterId, userId, dto);
   }

   @Get()
   @ApiParam({ name: 'transporterId' })
   @ApiQuery({ name: 'page', required: false, type: Number })
   @ApiQuery({ name: 'limit', required: false, type: Number })
   @ApiOperation({ summary: "Get transporter's ratings", description: 'Returns all ratings with average score — powers the "Transporter Ratings" popup.' })
   getTransporterRatings(@Param('transporterId') transporterId: string, @Query('page') page?: number, @Query('limit') limit?: number) {
      return this.svc.getTransporterRatings(transporterId, page ? Number(page) : 1, limit ? Number(limit) : 20);
   }
}
