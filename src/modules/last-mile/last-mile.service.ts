import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../common/storage/storage.interface';
import { SetBankAccountDto } from './dto/set-bank-account.dto';
import { WithdrawFundsDto } from './dto/withdraw-funds.dto';
import { StatementQueryDto } from './dto/statement-query.dto';
import { NavigationQueryDto } from './dto/navigation-query.dto';
import { ListDeliveriesQueryDto, DeliveryListFilter, DeliverySortBy } from './dto/list-deliveries-query.dto';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto';
import { ConfirmCodeDto } from './dto/confirm-code.dto';

const WITHDRAWAL_FEE = 50; // flat fee in NGN, shown on the withdrawal screen
const IN_PROGRESS_STATUSES = ['ACCEPTED', 'IN_WAREHOUSE', 'IN_TRANSIT', 'PICKED_UP'];
const PENDING_STATUSES = ['ACCEPTED', 'IN_WAREHOUSE']; // assigned, not yet started — "Pending delivery" tab
const ACTIVE_STATUSES = ['IN_TRANSIT', 'PICKED_UP']; // started, en route — "In transit" tab
const COMPLETED_STATUSES = ['DELIVERED', 'COMPLETED'];
const AVG_CITY_SPEED_KMH = 25; // used for the ETA fallback when no maps provider is configured
const DRIVER_EARNING_RATE = 0.8; // mirrors shipments.service.ts — driver's cut of totalCost on completion

@Injectable()
export class LastMileService {
   private readonly logger = new Logger(LastMileService.name);

   constructor(
      private readonly prisma: PrismaService,
      private readonly cfg: ConfigService,
      @Inject('StorageService') private readonly storage: StorageService,
   ) {}

   // ─────────────────────────────────────────────────────────────────────────
   // Helpers
   // ─────────────────────────────────────────────────────────────────────────
   private async requireDriver(userId: string) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      if (user.kind !== 'LAST_MILE_DELIVERY') throw new ForbiddenException('Only last-mile delivery drivers can access this resource');
      return user;
   }

   private formatAddress(loc: any) {
      if (!loc) return null;
      if (typeof loc === 'string') return loc;
      const parts = [loc.address, loc.lga, loc.state ?? loc.region, loc.country].filter(Boolean);
      return parts.join(', ') || null;
   }

   private haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
      const toRad = (v: number) => (v * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
   }

   private formatDistance(km: number) {
      if (km < 1) return `${Math.round(km * 1000)}m`;
      return `${km.toFixed(1)}km`;
   }

   private genReference(prefix: string) {
      return `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
   }

   private genDeliveryCode() {
      return String(Math.floor(1000 + Math.random() * 9000));
   }

   private async createNotification(recipientId: string | undefined | null, message: string, type: 'email' | 'in-app' | 'sms' = 'in-app') {
      if (!recipientId) return;
      try {
         await this.prisma.notification.create({ data: { userId: recipientId, message, type: type.toUpperCase().replace('-', '_') as any, read: false } });
      } catch (err: any) {
         this.logger.error(`Failed to create notification: ${err.message}`);
      }
   }

   // ─────────────────────────────────────────────────────────────────────────
   // DASHBOARD (Image 1)
   // ─────────────────────────────────────────────────────────────────────────
   async getDashboard(userId: string) {
      const user = await this.requireDriver(userId);

      const [totalDeliveries, completed, pending, failed, currentDelivery] = await Promise.all([
         this.prisma.shipment.count({ where: { assignedTransporterId: userId } }),
         this.prisma.shipment.count({ where: { assignedTransporterId: userId, status: { in: COMPLETED_STATUSES as any } } }),
         this.prisma.shipment.count({ where: { assignedTransporterId: userId, status: { in: IN_PROGRESS_STATUSES as any } } }),
         this.prisma.shipment.count({ where: { assignedTransporterId: userId, status: 'FAILED' as any } }),
         this.getCurrentDeliveryRaw(userId),
      ]);

      return {
         isAvailable: user.isAvailable,
         earnings: {
            currentEarnings: user.walletBalance,
            currency: 'NGN',
         },
         stats: {
            totalDeliveries,
            completed,
            pending,
            failed,
         },
         currentDelivery: currentDelivery ? this.serializeDeliveryCard(currentDelivery) : null,
      };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // AVAILABILITY TOGGLE
   // ─────────────────────────────────────────────────────────────────────────
   async setAvailability(userId: string, isAvailable: boolean) {
      await this.requireDriver(userId);
      const user = await this.prisma.user.update({ where: { id: userId }, data: { isAvailable }, select: { id: true, isAvailable: true } });
      return { message: `You are now ${user.isAvailable ? 'Online' : 'Offline'}`, isAvailable: user.isAvailable };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // CURRENT DELIVERY (Image 1 "Current Delivery" card)
   // ─────────────────────────────────────────────────────────────────────────
   private async getCurrentDeliveryRaw(userId: string) {
      return this.prisma.shipment.findFirst({
         where: { assignedTransporterId: userId, status: { in: IN_PROGRESS_STATUSES as any } },
         orderBy: { updatedAt: 'desc' },
         include: { customer: { select: { id: true, email: true, phone: true } } },
      });
   }

   private serializeDeliveryCard(shipment: any) {
      return {
         id: shipment.id,
         orderId: shipment.orderId,
         status: shipment.status,
         eta: shipment.deliveryDate,
         customerName: shipment.customerName || shipment.clientName,
         customerPhone: shipment.customerPhone || shipment.customer?.phone || shipment.phone,
         pickup: {
            address: this.formatAddress(shipment.origin),
            lat: shipment.pickupLat,
            lng: shipment.pickupLng,
         },
         delivery: {
            address: this.formatAddress(shipment.destination),
            lat: shipment.deliveryLat,
            lng: shipment.deliveryLng,
         },
      };
   }

   async getCurrentDelivery(userId: string) {
      await this.requireDriver(userId);
      const shipment = await this.getCurrentDeliveryRaw(userId);
      if (!shipment) return { empty: true, message: 'No delivery in progress', currentDelivery: null };
      return { empty: false, currentDelivery: this.serializeDeliveryCard(shipment) };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // DELIVERIES LIST (Images 1 & 2 — Total/Pending/Completed/Failed tabs)
   // ─────────────────────────────────────────────────────────────────────────
   private serializeDeliveryListItem(shipment: any) {
      return {
         ...this.serializeDeliveryCard(shipment),
         failureReason: shipment.failureReason ?? null,
         canStart: PENDING_STATUSES.includes(shipment.status),
         canComplete: ACTIVE_STATUSES.includes(shipment.status),
         canRetry: shipment.status === 'FAILED',
      };
   }

   async listDeliveries(userId: string, query: ListDeliveriesQueryDto) {
      await this.requireDriver(userId);

      const where: any = { assignedTransporterId: userId };
      switch (query.filter) {
         case DeliveryListFilter.PENDING:
            where.status = { in: PENDING_STATUSES as any };
            break;
         case DeliveryListFilter.IN_TRANSIT:
            where.status = { in: ACTIVE_STATUSES as any };
            break;
         case DeliveryListFilter.COMPLETED:
            where.status = { in: COMPLETED_STATUSES as any };
            break;
         case DeliveryListFilter.FAILED:
            where.status = 'FAILED' as any;
            break;
         case DeliveryListFilter.ALL:
         default:
            break;
      }

      if (query.search) {
         where.OR = [
            { orderId: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
            { clientName: { contains: query.search, mode: 'insensitive' } },
         ];
      }

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const [total, shipments] = await Promise.all([
         this.prisma.shipment.count({ where }),
         this.prisma.shipment.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: { customer: { select: { phone: true } } },
         }),
      ]);

      let items = shipments.map((s: any) => this.serializeDeliveryListItem(s));

      // Attach live distance from the driver's current position, if provided
      if (query.lat != null && query.lng != null) {
         items = items.map((item: any) => ({
            ...item,
            distanceFromDriver: item.delivery.lat != null && item.delivery.lng != null ? this.formatDistance(this.haversineDistanceKm(query.lat!, query.lng!, item.delivery.lat, item.delivery.lng)) : null,
            _distanceKm: item.delivery.lat != null && item.delivery.lng != null ? this.haversineDistanceKm(query.lat!, query.lng!, item.delivery.lat, item.delivery.lng) : Infinity,
         }));
      }

      if (query.sortBy === DeliverySortBy.DISTANCE && query.lat != null && query.lng != null) {
         items = [...items].sort((a: any, b: any) => a._distanceKm - b._distanceKm);
      } else if (query.sortBy === DeliverySortBy.ETA) {
         items = [...items].sort((a, b) => new Date(a.eta ?? 8640000000000000).getTime() - new Date(b.eta ?? 8640000000000000).getTime());
      }

      items = items.map(({ _distanceKm, ...rest }: any) => rest);

      return { page, limit, total, totalPages: Math.ceil(total / limit) || 1, items };
   }

   async getDeliveryDetail(userId: string, shipmentId: string) {
      await this.requireDriver(userId);
      const shipment = await this.prisma.shipment.findUnique({
         where: { id: shipmentId },
         include: { customer: { select: { phone: true, email: true } } },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.assignedTransporterId !== userId) throw new ForbiddenException('This delivery is not assigned to you');

      return {
         ...this.serializeDeliveryListItem(shipment),
         completedAt: shipment.deliveredAt,
         proofOfDelivery: {
            photoUrl: shipment.proofPhotoUrl,
            codeConfirmed: !!shipment.codeConfirmedAt,
            signatureUrl: shipment.signatureUrl,
         },
         failure:
            shipment.status === 'FAILED'
               ? {
                    reason: shipment.failureReason,
                    failedAt: shipment.failedAt,
                 }
               : null,
      };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // START DELIVERY ("Start Delivery" button on a Pending card)
   // ─────────────────────────────────────────────────────────────────────────
   async startDelivery(userId: string, shipmentId: string) {
      await this.requireDriver(userId);
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.assignedTransporterId !== userId) throw new ForbiddenException('This delivery is not assigned to you');
      if (!PENDING_STATUSES.includes(shipment.status)) {
         throw new BadRequestException(`Cannot start a delivery that is currently ${shipment.status}`);
      }

      const deliveryCode = shipment.deliveryCode ?? this.genDeliveryCode();

      const updated = await this.prisma.$transaction(async (tx: any) => {
         const s = await tx.shipment.update({
            where: { id: shipmentId },
            data: { status: 'IN_TRANSIT' as any, deliveryCode },
         });
         await tx.shipmentStatusHistory.create({ data: { shipmentId, status: 'IN_TRANSIT' as any, updatedBy: userId, note: 'Driver started delivery' } });
         return s;
      });

      await this.createNotification(updated.customerId, `Your delivery ${updated.orderId} is on the way. Your delivery confirmation code is ${deliveryCode}.`);

      return { message: 'Delivery started', delivery: this.serializeDeliveryListItem(updated) };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // CANCEL / FAIL DELIVERY ("Cancel Delivery" button + "Rider denied entry" card)
   // ─────────────────────────────────────────────────────────────────────────
   async cancelDelivery(userId: string, shipmentId: string, dto: CancelDeliveryDto) {
      await this.requireDriver(userId);
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.assignedTransporterId !== userId) throw new ForbiddenException('This delivery is not assigned to you');
      if (![...PENDING_STATUSES, ...ACTIVE_STATUSES].includes(shipment.status)) {
         throw new BadRequestException(`Cannot cancel a delivery that is currently ${shipment.status}`);
      }

      const note = dto.note ? `${dto.reason} — ${dto.note}` : dto.reason;

      const updated = await this.prisma.$transaction(async (tx: any) => {
         const s = await tx.shipment.update({
            where: { id: shipmentId },
            data: { status: 'FAILED' as any, failureReason: dto.reason, failedAt: new Date() },
         });
         await tx.shipmentStatusHistory.create({ data: { shipmentId, status: 'FAILED' as any, updatedBy: userId, note } });
         return s;
      });

      await this.createNotification(updated.customerId, `Delivery attempt for ${updated.orderId} was unsuccessful: ${dto.reason}`);

      return { message: 'Delivery marked as failed', delivery: this.serializeDeliveryListItem(updated) };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // RETRY TASK ("Retry Task" button on a Failed card)
   // ─────────────────────────────────────────────────────────────────────────
   async retryDelivery(userId: string, shipmentId: string) {
      await this.requireDriver(userId);
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.assignedTransporterId !== userId) throw new ForbiddenException('This delivery is not assigned to you');
      if (shipment.status !== 'FAILED') throw new BadRequestException('Only a failed delivery can be retried');

      const updated = await this.prisma.$transaction(async (tx: any) => {
         const s = await tx.shipment.update({
            where: { id: shipmentId },
            data: { status: 'IN_TRANSIT' as any, failureReason: null, failedAt: null },
         });
         await tx.shipmentStatusHistory.create({ data: { shipmentId, status: 'IN_TRANSIT' as any, updatedBy: userId, note: 'Driver retried delivery' } });
         return s;
      });

      return { message: 'Retrying delivery', delivery: this.serializeDeliveryListItem(updated) };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // COMPLETED-DELIVERY FLOW (Image 3 — Take Photo → Confirm Code → Signature)
   // ─────────────────────────────────────────────────────────────────────────
   private async requireOwnedActiveDelivery(userId: string, shipmentId: string) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.assignedTransporterId !== userId) throw new ForbiddenException('This delivery is not assigned to you');
      if (!ACTIVE_STATUSES.includes(shipment.status)) {
         throw new BadRequestException(`Delivery must be in transit to complete this step (currently ${shipment.status})`);
      }
      return shipment;
   }

   async uploadProofPhoto(userId: string, shipmentId: string, file: Express.Multer.File) {
      await this.requireDriver(userId);
      if (!file) throw new BadRequestException('A photo file is required');
      await this.requireOwnedActiveDelivery(userId, shipmentId);

      const uploaded = await this.storage.uploadFile(file, { folder: 'last-mile/proof-of-delivery' });

      await this.prisma.$transaction(async (tx: any) => {
         await tx.shipment.update({ where: { id: shipmentId }, data: { proofPhotoUrl: uploaded.url } });
         await tx.shipmentDocument.create({ data: { shipmentId, docType: 'PROOF_OF_DELIVERY' as any, url: uploaded.url, fileName: file.originalname } });
      });

      return { message: 'Photo captured', photoUrl: uploaded.url };
   }

   async confirmCode(userId: string, shipmentId: string, dto: ConfirmCodeDto) {
      await this.requireDriver(userId);
      const shipment = await this.requireOwnedActiveDelivery(userId, shipmentId);

      if (!shipment.proofPhotoUrl) throw new BadRequestException('Take the proof-of-delivery photo first');
      if (!shipment.deliveryCode) throw new BadRequestException('No delivery code was generated for this delivery yet');
      if (dto.code !== shipment.deliveryCode) throw new BadRequestException('Incorrect delivery code');

      await this.prisma.shipment.update({ where: { id: shipmentId }, data: { codeConfirmedAt: new Date() } });

      return { message: 'Code confirmed', codeConfirmed: true };
   }

   async submitSignature(userId: string, shipmentId: string, file: Express.Multer.File) {
      await this.requireDriver(userId);
      if (!file) throw new BadRequestException('A signature image is required');
      const shipment = await this.requireOwnedActiveDelivery(userId, shipmentId);

      if (!shipment.proofPhotoUrl) throw new BadRequestException('Take the proof-of-delivery photo first');
      if (!shipment.codeConfirmedAt) throw new BadRequestException('Confirm the delivery code first');

      const uploaded = await this.storage.uploadFile(file, { folder: 'last-mile/signatures' });

      const result = await this.prisma.$transaction(async (tx: any) => {
         const s = await tx.shipment.update({
            where: { id: shipmentId },
            data: { status: 'DELIVERED' as any, signatureUrl: uploaded.url, deliveredAt: new Date() },
         });
         await tx.shipmentDocument.create({ data: { shipmentId, docType: 'SIGNATURE' as any, url: uploaded.url, fileName: file.originalname } });
         await tx.shipmentStatusHistory.create({ data: { shipmentId, status: 'DELIVERED' as any, updatedBy: userId, note: 'Delivery completed by driver' } });

         // Credit the driver's wallet — mirrors shipments.service.ts#updateStatus
         let earningAmount = 0;
         const existingEarning = await tx.driverEarning.findUnique({ where: { shipmentId } });
         if (!existingEarning) {
            earningAmount = Math.round(s.totalCost * DRIVER_EARNING_RATE * 100) / 100;
            await tx.driverEarning.create({ data: { driverId: userId, shipmentId, amount: earningAmount, status: 'AVAILABLE' } });
            await tx.user.update({ where: { id: userId }, data: { walletBalance: { increment: earningAmount }, totalEarnings: { increment: earningAmount } } });
         }

         return { shipment: s, earningAmount };
      });

      await this.createNotification(result.shipment.customerId, `Your delivery ${result.shipment.orderId} has been completed`);

      return {
         message: 'Delivery Completed!',
         delivery: this.serializeDeliveryListItem(result.shipment),
         earning: result.earningAmount ? { amount: result.earningAmount, currency: 'NGN' } : null,
      };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // WALLET (Image 2 left card)
   // ─────────────────────────────────────────────────────────────────────────
   async getWallet(userId: string) {
      const user = await this.requireDriver(userId);
      const defaultAccount = await this.prisma.paymentMethod.findFirst({
         where: { userId, type: 'LOCAL_BANK' },
         orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });

      return {
         availableToWithdraw: user.walletBalance,
         totalEarnings: user.totalEarnings,
         currency: 'NGN',
         withdrawalFee: WITHDRAWAL_FEE,
         bankAccount: defaultAccount
            ? {
                 id: defaultAccount.id,
                 bankName: defaultAccount.bankName,
                 accountName: defaultAccount.accountName,
                 accountNumberLast4: defaultAccount.accountNumberLast4,
                 currency: defaultAccount.currency ?? 'NGN',
              }
            : null,
      };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // SET / UPDATE BANK ACCOUNT ("Set BankAccount" button on empty state)
   // ─────────────────────────────────────────────────────────────────────────
   async setBankAccount(userId: string, dto: SetBankAccountDto) {
      await this.requireDriver(userId);

      const last4 = dto.accountNumber.slice(-4);

      return this.prisma.$transaction(async (tx: any) => {
         // Only one default withdrawal account per driver
         await tx.paymentMethod.updateMany({ where: { userId, type: 'LOCAL_BANK' }, data: { isDefault: false } });

         const account = await tx.paymentMethod.create({
            data: {
               userId,
               type: 'LOCAL_BANK',
               bankName: dto.bankName,
               accountName: dto.accountName,
               accountNumberLast4: last4,
               bankSortCode: dto.bankSortCode,
               currency: dto.currency ?? 'NGN',
               isDefault: true,
            },
         });

         return {
            message: 'Bank account saved successfully',
            bankAccount: {
               id: account.id,
               bankName: account.bankName,
               accountName: account.accountName,
               accountNumberLast4: account.accountNumberLast4,
               currency: account.currency,
            },
         };
      });
   }

   async listBankAccounts(userId: string) {
      await this.requireDriver(userId);
      const accounts = await this.prisma.paymentMethod.findMany({
         where: { userId, type: 'LOCAL_BANK' },
         orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      return accounts.map((a) => ({
         id: a.id,
         bankName: a.bankName,
         accountName: a.accountName,
         accountNumberLast4: a.accountNumberLast4,
         isDefault: a.isDefault,
         currency: a.currency,
      }));
   }

   // ─────────────────────────────────────────────────────────────────────────
   // WITHDRAW FUNDS (Wallet screen "Withdraw" button)
   // ─────────────────────────────────────────────────────────────────────────
   async withdraw(userId: string, dto: WithdrawFundsDto) {
      const user = await this.requireDriver(userId);

      if (dto.amount > user.walletBalance) {
         throw new BadRequestException('Withdrawal amount exceeds available balance');
      }

      const account = dto.bankAccountId
         ? await this.prisma.paymentMethod.findFirst({ where: { id: dto.bankAccountId, userId, type: 'LOCAL_BANK' } })
         : await this.prisma.paymentMethod.findFirst({ where: { userId, type: 'LOCAL_BANK' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });

      if (!account) {
         throw new BadRequestException('No withdrawal bank account on file. Please set a bank account first.');
      }

      const netAmount = Math.max(dto.amount - WITHDRAWAL_FEE, 0);
      const reference = this.genReference('WD');

      const withdrawal = await this.prisma.$transaction(async (tx: any) => {
         await tx.user.update({ where: { id: userId }, data: { walletBalance: { decrement: dto.amount } } });

         return tx.withdrawal.create({
            data: {
               userId,
               amount: dto.amount,
               fee: WITHDRAWAL_FEE,
               netAmount,
               bankAccountId: account.id,
               bankName: account.bankName,
               accountName: account.accountName,
               accountNumberLast4: account.accountNumberLast4,
               reference,
               status: 'PENDING',
            },
         });
      });

      return {
         message: 'Withdrawal request submitted. It may take up to 24 hours to reflect in your bank account or mobile money.',
         withdrawal: {
            id: withdrawal.id,
            reference: withdrawal.reference,
            amount: withdrawal.amount,
            fee: withdrawal.fee,
            netAmount: withdrawal.netAmount,
            status: withdrawal.status,
            bankName: withdrawal.bankName,
            accountNumberLast4: withdrawal.accountNumberLast4,
            createdAt: withdrawal.createdAt,
         },
      };
   }

   async listWithdrawals(userId: string) {
      await this.requireDriver(userId);
      return this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
   }

   // ─────────────────────────────────────────────────────────────────────────
   // GENERATE STATEMENT ("Generate Statement" button on wallet screen)
   // ─────────────────────────────────────────────────────────────────────────
   async getStatement(userId: string, query: StatementQueryDto) {
      await this.requireDriver(userId);

      const start = query.startDate ? new Date(query.startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
      const end = query.endDate ? new Date(query.endDate) : new Date();

      const [earnings, withdrawals] = await Promise.all([
         this.prisma.driverEarning.findMany({
            where: { driverId: userId, createdAt: { gte: start, lte: end } },
            include: { shipment: { select: { orderId: true, clientName: true, customerName: true } } },
            orderBy: { createdAt: 'desc' },
         }),
         this.prisma.withdrawal.findMany({
            where: { userId, createdAt: { gte: start, lte: end } },
            orderBy: { createdAt: 'desc' },
         }),
      ]);

      const transactions = [
         ...earnings.map((e) => ({
            type: 'EARNING' as const,
            id: e.id,
            date: e.createdAt,
            description: `Delivery earning — ${e.shipment?.orderId ?? ''}`,
            amount: e.amount,
            status: e.status,
         })),
         ...withdrawals.map((w) => ({
            type: 'WITHDRAWAL' as const,
            id: w.id,
            date: w.createdAt,
            description: `Withdrawal to ${w.bankName ?? 'bank account'} (**** ${w.accountNumberLast4 ?? ''})`,
            amount: -w.amount,
            status: w.status,
         })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totalEarned = earnings.reduce((sum, e) => sum + e.amount, 0);
      const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);

      return {
         period: { startDate: start, endDate: end },
         summary: { totalEarned, totalWithdrawn, currency: 'NGN' },
         transactions,
      };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // NAVIGATION (Image 3 — turn-by-turn map)
   // ─────────────────────────────────────────────────────────────────────────
   async getNavigation(userId: string, shipmentId: string, query: NavigationQueryDto) {
      await this.requireDriver(userId);

      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.assignedTransporterId !== userId) throw new ForbiddenException('This delivery is not assigned to you');

      const originLat = query.lat ?? shipment.currentLat ?? shipment.pickupLat;
      const originLng = query.lng ?? shipment.currentLng ?? shipment.pickupLng;

      // Heading to pickup while en route/accepted, heading to drop-off once picked up.
      const headingToPickup = ['ACCEPTED', 'IN_WAREHOUSE', 'IN_TRANSIT'].includes(shipment.status);
      const destLat = headingToPickup ? shipment.pickupLat : shipment.deliveryLat;
      const destLng = headingToPickup ? shipment.pickupLng : shipment.deliveryLng;
      const destinationAddress = headingToPickup ? this.formatAddress(shipment.origin) : this.formatAddress(shipment.destination);

      if (originLat == null || originLng == null || destLat == null || destLng == null) {
         throw new BadRequestException('Coordinates are not available yet for this delivery');
      }

      // persist the latest known position if the driver sent one
      if (query.lat != null && query.lng != null) {
         await this.prisma.shipment.update({ where: { id: shipmentId }, data: { currentLat: query.lat, currentLng: query.lng } });
      }

      const googleKey = this.cfg.get<string>('GOOGLE_MAPS_API_KEY');
      if (googleKey) {
         try {
            const { data } = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
               params: { origin: `${originLat},${originLng}`, destination: `${destLat},${destLng}`, key: googleKey },
            });
            const route = data?.routes?.[0];
            const leg = route?.legs?.[0];
            if (leg) {
               const nextStep = leg.steps?.[0];
               return {
                  destinationLabel: headingToPickup ? 'Pickup' : 'Next Drop-off',
                  destinationAddress,
                  distance: leg.distance?.text,
                  etaText: leg.duration?.text,
                  etaMinutes: Math.round((leg.duration?.value ?? 0) / 60),
                  nextInstruction: nextStep ? nextStep.html_instructions?.replace(/<[^>]+>/g, '') : null,
                  nextInstructionDistance: nextStep?.distance?.text,
                  polyline: route.overview_polyline?.points ?? null,
                  origin: { lat: originLat, lng: originLng },
                  destination: { lat: destLat, lng: destLng },
                  provider: 'GOOGLE_DIRECTIONS',
               };
            }
         } catch (err: any) {
            this.logger.warn(`Google Directions lookup failed, falling back to estimate: ${err?.message}`);
         }
      }

      // Fallback: straight-line estimate when no maps provider is configured / reachable
      const distanceKm = this.haversineDistanceKm(originLat, originLng, destLat, destLng);
      const etaMinutes = Math.max(1, Math.round((distanceKm / AVG_CITY_SPEED_KMH) * 60));

      return {
         destinationLabel: headingToPickup ? 'Pickup' : 'Next Drop-off',
         destinationAddress,
         distance: this.formatDistance(distanceKm),
         etaText: `${etaMinutes} MINS`,
         etaMinutes,
         nextInstruction: `Head towards ${destinationAddress ?? 'the destination'}`,
         nextInstructionDistance: this.formatDistance(distanceKm),
         polyline: null,
         origin: { lat: originLat, lng: originLng },
         destination: { lat: destLat, lng: destLng },
         provider: 'ESTIMATE',
      };
   }
}
