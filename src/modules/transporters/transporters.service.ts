import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import UrlService from '../auth/url.service';
import { AddTransporterDto } from './dto/add-transporter.dto';
import { UpdateTransporterDto } from './dto/update-transporter.dto';
import { ListLspTransportersDto } from './dto/list-lsp-transporters.dto';

// A registered account counts as an eligible "transporter" if it is either
// a LAST_MILE_DELIVERY driver, or a LOGISTIC_SERVICE_PROVIDER company whose
// CompanyRole is TRANSPORTER.
const TRANSPORTER_KIND = 'LAST_MILE_DELIVERY';
const TRANSPORTER_ROLE = 'TRANSPORTER';
const TRANSPORTER_LSP_KIND = 'LOGISTIC_SERVICE_PROVIDER';

@Injectable()
export class TransportersService {
   private readonly logger = new Logger(TransportersService.name);

   constructor(
      private readonly prisma: PrismaService,
      private readonly mailer: MailService,
      private readonly urlService: UrlService,
   ) {}

   private async findMatchingTransporterAccount(email: string) {
      const user = await this.prisma.user.findUnique({
         where: { email: email.toLowerCase() },
         include: { company: true },
      });
      if (!user) return null;
      const isEligible = user.kind === TRANSPORTER_KIND || user.company?.role === TRANSPORTER_ROLE;
      return isEligible ? user : null;
   }

   // ─── shared setup for both "add" flows ─────────────────────────────────────
   private async prepareAdd(ownerId: string, dto: AddTransporterDto) {
      const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, include: { company: true } });
      if (!owner) throw new NotFoundException('User not found');

      const email = dto.email.toLowerCase();
      const countryCode = dto.countryCode ?? '+1';

      const existing = await this.prisma.savedTransporter.findUnique({
         where: { ownerId_email: { ownerId, email } },
      });
      if (existing) {
         throw new BadRequestException('You already added a transporter with this email');
      }

      const inviterName = owner.company?.businessName ?? owner.company?.fullName ?? 'A Hage enterprise partner';
      return { owner, email, countryCode, inviterName };
   }

   // ─── ADD NEW TRANSPORTER (not yet on the platform → email invite) ─────────
   async addNewTransporter(ownerId: string, dto: AddTransporterDto) {
      const { email, countryCode, inviterName } = await this.prepareAdd(ownerId, dto);

      // Safety net: if this email actually already belongs to an eligible,
      // registered transporter, link it instead of sending a "join Hage"
      // invite to someone who already has an account.
      const matchedUser = await this.findMatchingTransporterAccount(email);

      const saved = await this.prisma.savedTransporter.create({
         data: {
            ownerId,
            name: dto.name,
            countryCode,
            phone: dto.phone,
            email,
            transporterId: matchedUser?.id ?? null,
            status: matchedUser ? 'ACTIVE' : 'INVITED',
         },
      });

      try {
         await this.mailer.sendTransporterInvite(email, {
            transporterName: dto.name,
            inviterName,
            alreadyRegistered: !!matchedUser,
            signupUrl: this.urlService.build('register-company'),
            dashboardUrl: this.urlService.build('dashboard'),
         });
      } catch (err: any) {
         this.logger.warn(`Failed to send transporter invite email: ${err?.message ?? err}`);
      }

      if (matchedUser) {
         await this.notify(matchedUser.id, `${inviterName} added you as a saved transporter`);
      }

      return saved;
   }

   // ─── ADD EXISTING TRANSPORTER (already a registered platform user) ────────
   async addExistingTransporter(ownerId: string, dto: AddTransporterDto) {
      const { email, countryCode, inviterName } = await this.prepareAdd(ownerId, dto);

      const matchedUser = await this.findMatchingTransporterAccount(email);
      if (!matchedUser) {
         throw new BadRequestException('No registered transporter account was found with this email. Use "Add New" to invite them to Hage instead.');
      }

      const saved = await this.prisma.savedTransporter.create({
         data: {
            ownerId,
            name: dto.name,
            countryCode,
            phone: dto.phone,
            email,
            transporterId: matchedUser.id,
            status: 'ACTIVE',
         },
      });

      try {
         // Existing platform users never get a "create an account" invite —
         // just a short heads-up that they've been linked.
         await this.mailer.sendTransporterInvite(email, {
            transporterName: dto.name,
            inviterName,
            alreadyRegistered: true,
            signupUrl: this.urlService.build('register-company'),
            dashboardUrl: this.urlService.build('dashboard'),
         });
      } catch (err: any) {
         this.logger.warn(`Failed to send transporter-added email: ${err?.message ?? err}`);
      }

      await this.notify(matchedUser.id, `${inviterName} added you as a saved transporter`);

      return saved;
   }

   // ─── LIST SAVED TRANSPORTERS ────────────────────────────────────────────────
   async listSavedTransporters(ownerId: string) {
      const transporters = await this.prisma.savedTransporter.findMany({
         where: { ownerId },
         orderBy: { createdAt: 'desc' },
         include: { transporter: { select: { id: true, email: true, phone: true, kind: true } } },
      });
      return { data: transporters };
   }

   // ─── GET ONE ─────────────────────────────────────────────────────────────────
   async getSavedTransporter(ownerId: string, id: string) {
      const transporter = await this.prisma.savedTransporter.findUnique({
         where: { id },
         include: { transporter: { select: { id: true, email: true, phone: true, kind: true } } },
      });
      if (!transporter || transporter.ownerId !== ownerId) throw new NotFoundException('Saved transporter not found');
      return transporter;
   }

   // ─── UPDATE (edit) ───────────────────────────────────────────────────────────
   async updateTransporter(ownerId: string, id: string, dto: UpdateTransporterDto) {
      const existing = await this.prisma.savedTransporter.findUnique({ where: { id } });
      if (!existing || existing.ownerId !== ownerId) throw new NotFoundException('Saved transporter not found');

      const nextEmail = dto.email ? dto.email.toLowerCase() : existing.email;
      let transporterId = existing.transporterId;
      let status = existing.status;

      if (dto.email && nextEmail !== existing.email) {
         const dup = await this.prisma.savedTransporter.findUnique({ where: { ownerId_email: { ownerId, email: nextEmail } } });
         if (dup && dup.id !== id) throw new BadRequestException('You already added a transporter with this email');

         const matchedUser = await this.findMatchingTransporterAccount(nextEmail);
         transporterId = matchedUser?.id ?? null;
         status = matchedUser ? 'ACTIVE' : 'INVITED';
      }

      return this.prisma.savedTransporter.update({
         where: { id },
         data: {
            name: dto.name ?? existing.name,
            countryCode: dto.countryCode ?? existing.countryCode,
            phone: dto.phone ?? existing.phone,
            email: nextEmail,
            transporterId,
            status,
         },
      });
   }

   // ─── DELETE ──────────────────────────────────────────────────────────────────
   async removeTransporter(ownerId: string, id: string) {
      const existing = await this.prisma.savedTransporter.findUnique({ where: { id } });
      if (!existing || existing.ownerId !== ownerId) throw new NotFoundException('Saved transporter not found');

      await this.prisma.savedTransporter.delete({ where: { id } });
      return { message: 'Transporter removed' };
   }

   // ─── LIST LSP-AS-TRANSPORTER ACCOUNTS ───────────────────────────────────────
   // Public directory of LOGISTIC_SERVICE_PROVIDER accounts whose Company.role
   // is TRANSPORTER — i.e. LSPs that can be picked as the `transporterId` on a
   // shipment (most relevant for CROSS_BORDER shipments) instead of a
   // third-party LAST_MILE_DELIVERY driver. This is intentionally separate from
   // listSavedTransporters(), which is a per-account address book.
   async listLspTransporters(filters: ListLspTransportersDto) {
      const { page = 1, limit = 20, country, search } = filters;
      const skip = (page - 1) * limit;

      const where: any = {
         kind: TRANSPORTER_LSP_KIND,
         deactivatedAt: null,
         company: {
            role: TRANSPORTER_ROLE,
            ...(country ? { country: { contains: country, mode: 'insensitive' } } : {}),
            ...(search ? { businessName: { contains: search, mode: 'insensitive' } } : {}),
         },
      };

      const [transporters, total] = await Promise.all([
         this.prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { company: true },
         }),
         this.prisma.user.count({ where }),
      ]);

      const ids = transporters.map((t: any) => t.id);
      const ratingAgg = ids.length
         ? await this.prisma.transporterRating.groupBy({
              by: ['transporterId'],
              where: { transporterId: { in: ids } },
              _avg: { rating: true },
              _count: { rating: true },
           })
         : [];
      const ratingMap = new Map<string, { averageRating: number | null; totalRatings: number }>(
         ratingAgg.map((r: any) => [r.transporterId, { averageRating: r._avg.rating ? Number(r._avg.rating.toFixed(1)) : null, totalRatings: r._count.rating }]),
      );

      const data = transporters.map((t: any) => ({
         id: t.id,
         businessName: t.company?.businessName ?? null,
         email: t.email,
         phone: t.phone,
         profilePicture: t.profilePicture,
         country: t.company?.country ?? null,
         city: t.company?.city ?? null,
         businessAddress: t.company?.businessAddress ?? null,
         vehicleType: t.company?.vehicleType ?? null,
         isVerified: t.isVerified,
         averageRating: ratingMap.get(t.id)?.averageRating ?? null,
         totalRatings: ratingMap.get(t.id)?.totalRatings ?? 0,
      }));

      return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
   }

   private async notify(userId: string, message: string) {
      try {
         await this.prisma.notification.create({ data: { userId, message, type: 'IN_APP', read: false } });
      } catch (err: any) {
         this.logger.warn(`Failed to create notification: ${err?.message ?? err}`);
      }
   }
}
