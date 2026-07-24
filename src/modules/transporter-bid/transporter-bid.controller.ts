import { Controller, Post, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TransporterBidService } from './transporter-bid.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { Request } from 'express';

@ApiTags('transporter-bids')
@Controller('shipments/:shipmentId/bids')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class TransporterBidController {
   constructor(private readonly svc: TransporterBidService) {}

   @Post()
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   @ApiOperation({ summary: 'Submit a bid for a shipment', description: 'Transporters submit a price quote for a PUBLIC shipment. Can be updated before acceptance.' })
   submitBid(@Param('shipmentId') shipmentId: string, @Body() dto: CreateBidDto, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.submitBid(shipmentId, userId, dto);
   }

   @Get()
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   @ApiOperation({ summary: 'List all bids for a shipment', description: 'Shipment owner sees all transporter bids with ratings and prices (the "Available Transporters" screen).' })
   listBids(@Param('shipmentId') shipmentId: string, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.listBids(shipmentId, userId);
   }

   @Patch(':bidId/accept')
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   @ApiParam({ name: 'bidId', description: 'Bid ID' })
   @ApiOperation({ summary: 'Accept a transporter bid', description: 'Shipment owner accepts one bid — all other bids are auto-rejected and the transporter is assigned.' })
   acceptBid(@Param('shipmentId') shipmentId: string, @Param('bidId') bidId: string, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.acceptBid(shipmentId, bidId, userId);
   }

   @Patch(':bidId/reject')
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   @ApiParam({ name: 'bidId', description: 'Bid ID' })
   @ApiOperation({ summary: 'Reject a transporter bid' })
   rejectBid(@Param('shipmentId') shipmentId: string, @Param('bidId') bidId: string, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.rejectBid(shipmentId, bidId, userId);
   }
}
