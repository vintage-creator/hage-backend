import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { ShipmentsService } from '../shipments/shipments.service';

@Injectable()
export class TransporterBidService {
   private readonly logger = new Logger(TransporterBidService.name);

   constructor(
      private readonly prisma: PrismaService,
      private readonly shipmentsService: ShipmentsService,
   ) {}

   // ─── SUBMIT A BID (transporter) ────────────────────────────────────────────
   async submitBid(shipmentId: string, transporterId: string, dto: CreateBidDto) {
      // A "transporter" is either a LAST_MILE_DELIVERY driver, or an LSP account
      // whose Company.role is TRANSPORTER — same rule used for shipment assignment
      // in ShipmentsService (see isTransporterAccount).
      const transporter = await this.prisma.user.findUnique({ where: { id: transporterId }, include: { company: true } });
      if (!transporter) throw new NotFoundException('Transporter not found');
      if (!this.shipmentsService.isTransporterAccount(transporter)) throw new ForbiddenException('Only transporters can submit bids');

      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      // Only PUBLIC shipments are open for bidding; PRIVATE/ASSIGNED go direct
      if ((shipment as any).visibility !== 'PUBLIC') {
         throw new BadRequestException('This shipment is not open for bidding');
      }

      if (!['PENDING'].includes(shipment.status)) {
         throw new BadRequestException('Shipment is no longer accepting bids');
      }

      // Upsert: transporter can update their bid before it's accepted
      const bid = await this.prisma.transporterBid.upsert({
         where: { shipmentId_transporterId: { shipmentId, transporterId } },
         create: { shipmentId, transporterId, price: dto.price, note: dto.note, status: 'PENDING' as any },
         update: { price: dto.price, note: dto.note, status: 'PENDING' as any },
         include: { transporter: { select: { id: true, email: true, phone: true } } },
      });

      // Notify shipment owner that a new bid has arrived
      await this.shipmentsService.createNotification(shipment.createdBy, `Transporter submitted a bid of ₦${dto.price.toLocaleString()} for shipment ${shipment.orderId}`, 'in-app');

      return bid;
   }

   // ─── LIST BIDS FOR A SHIPMENT (owner sees available transporters) ──────────
   async listBids(shipmentId: string, userId: string) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      // Only the shipment owner or the transporter themselves can see bids
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
      if (!user) throw new NotFoundException('User not found');

      const isOwner = shipment.createdBy === userId || shipment.customerId === userId;
      const isTransporter = this.shipmentsService.isTransporterAccount(user);

      if (!isOwner && !isTransporter) throw new ForbiddenException('Access denied');

      const where: any = { shipmentId };
      if (isTransporter && !isOwner) {
         // Transporter only sees their own bid
         where.transporterId = userId;
      }

      const bids = await this.prisma.transporterBid.findMany({
         where,
         include: {
            transporter: {
               select: {
                  id: true,
                  email: true,
                  phone: true,
                  kind: true,
                  // include average rating as a computed field below
               },
            },
         },
         orderBy: { price: 'asc' },
      });

      // Attach average rating to each transporter
      const enriched = await Promise.all(
         bids.map(async (bid) => {
            const ratingAgg = await this.prisma.transporterRating.aggregate({
               where: { transporterId: bid.transporterId },
               _avg: { rating: true },
               _count: { rating: true },
            });
            return {
               ...bid,
               transporter: {
                  ...bid.transporter,
                  averageRating: ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : null,
                  totalRatings: ratingAgg._count.rating,
               },
            };
         }),
      );

      return {
         shipmentId,
         orderId: shipment.orderId,
         totalPrice: enriched.reduce((sum, b) => (b.status === 'PENDING' ? Math.min(sum, b.price) : sum), Infinity),
         bids: enriched,
      };
   }

   // ─── ACCEPT A BID (shipment owner) ─────────────────────────────────────────
   async acceptBid(shipmentId: string, bidId: string, userId: string) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.createdBy !== userId && shipment.customerId !== userId) throw new ForbiddenException('Only the shipment owner can accept bids');
      if (!['PENDING'].includes(shipment.status)) throw new BadRequestException('Shipment is not accepting bids');

      const bid = await this.prisma.transporterBid.findUnique({ where: { id: bidId } });
      if (!bid || bid.shipmentId !== shipmentId) throw new NotFoundException('Bid not found for this shipment');
      if (bid.status !== 'PENDING') throw new BadRequestException('This bid has already been processed');

      await this.prisma.$transaction(async (tx: any) => {
         // Accept the selected bid
         await tx.transporterBid.update({ where: { id: bidId }, data: { status: 'ACCEPTED' as any } });

         // Reject all other pending bids for this shipment
         await tx.transporterBid.updateMany({
            where: { shipmentId, id: { not: bidId }, status: 'PENDING' as any },
            data: { status: 'REJECTED' as any },
         });

         // Update shipment: assign transporter, move to ACCEPTED
         await tx.shipment.update({
            where: { id: shipmentId },
            data: { assignedTransporterId: bid.transporterId, status: 'ACCEPTED' as any },
         });

         await tx.shipmentStatusHistory.create({
            data: { shipmentId, status: 'ACCEPTED' as any, updatedBy: userId, note: `Transporter bid accepted` },
         });
      });

      // Notify winning transporter
      await this.shipmentsService.createNotification(bid.transporterId, `Your bid for shipment ${shipment.orderId} was accepted! Price: ₦${bid.price.toLocaleString()}`, 'in-app');

      // Notify owner
      await this.shipmentsService.createNotification(userId, `You accepted a transporter for shipment ${shipment.orderId}`, 'in-app');

      return { message: 'Bid accepted successfully', bidId, transporterId: bid.transporterId };
   }

   // ─── REJECT A BID (shipment owner) ─────────────────────────────────────────
   async rejectBid(shipmentId: string, bidId: string, userId: string) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.createdBy !== userId && shipment.customerId !== userId) throw new ForbiddenException('Only the shipment owner can reject bids');

      const bid = await this.prisma.transporterBid.findUnique({ where: { id: bidId } });
      if (!bid || bid.shipmentId !== shipmentId) throw new NotFoundException('Bid not found for this shipment');
      if (bid.status !== 'PENDING') throw new BadRequestException('Bid has already been processed');

      await this.prisma.transporterBid.update({ where: { id: bidId }, data: { status: 'REJECTED' as any } });

      await this.shipmentsService.createNotification(bid.transporterId, `Your bid for shipment ${shipment.orderId} was not accepted this time.`, 'in-app');

      return { message: 'Bid rejected' };
   }
}
