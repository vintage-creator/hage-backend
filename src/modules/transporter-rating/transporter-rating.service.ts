import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class TransporterRatingService {
   constructor(private readonly prisma: PrismaService) {}

   async rateTransporter(transporterId: string, ratedById: string, dto: CreateRatingDto) {
      const transporter = await this.prisma.user.findUnique({ where: { id: transporterId } });
      if (!transporter) throw new NotFoundException('Transporter not found');
      if (transporter.kind !== 'LAST_MILE_DELIVERY') throw new BadRequestException('User is not a transporter');
      if (transporterId === ratedById) throw new BadRequestException('You cannot rate yourself');

      if (dto.shipmentId) {
         // Verify the rater was actually involved in this shipment
         const shipment = await this.prisma.shipment.findUnique({ where: { id: dto.shipmentId } });
         if (!shipment) throw new NotFoundException('Shipment not found');
         if (shipment.createdBy !== ratedById && shipment.customerId !== ratedById) {
            throw new ForbiddenException('You were not involved in this shipment');
         }
         if (shipment.assignedTransporterId !== transporterId) {
            throw new BadRequestException('This transporter was not assigned to the shipment');
         }
      }

      // One rating per (transporterId, ratedById, shipmentId) combo
      const existingWhere: any = { transporterId, ratedById };
      if (dto.shipmentId) existingWhere.shipmentId = dto.shipmentId;

      const existing = await this.prisma.transporterRating.findFirst({ where: existingWhere });

      const rating = existing
         ? await this.prisma.transporterRating.update({ where: { id: existing.id }, data: { rating: dto.rating, comment: dto.comment }, include: { ratedBy: { select: { id: true, email: true } } } })
         : await this.prisma.transporterRating.create({ data: { transporterId, ratedById, shipmentId: dto.shipmentId, rating: dto.rating, comment: dto.comment }, include: { ratedBy: { select: { id: true, email: true } } } });

      return rating;
   }

   async getTransporterRatings(transporterId: string, page = 1, limit = 20) {
      const transporter = await this.prisma.user.findUnique({ where: { id: transporterId } });
      if (!transporter) throw new NotFoundException('Transporter not found');

      const skip = (page - 1) * limit;

      const [ratings, total, aggregate] = await Promise.all([
         this.prisma.transporterRating.findMany({
            where: { transporterId },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { ratedBy: { select: { id: true, email: true } } },
         }),
         this.prisma.transporterRating.count({ where: { transporterId } }),
         this.prisma.transporterRating.aggregate({ where: { transporterId }, _avg: { rating: true }, _count: { rating: true } }),
      ]);

      return {
         transporterId,
         averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : null,
         totalRatings: aggregate._count.rating,
         data: ratings,
         pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
   }

   // Used by bid listing to show transporter ratings inline
   async getAverageRating(transporterId: string) {
      const agg = await this.prisma.transporterRating.aggregate({
         where: { transporterId },
         _avg: { rating: true },
         _count: { rating: true },
      });
      return { averageRating: agg._avg.rating ? Number(agg._avg.rating.toFixed(1)) : null, totalRatings: agg._count.rating };
   }
}
