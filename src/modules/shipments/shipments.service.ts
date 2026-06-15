import { Injectable, NotFoundException, BadRequestException, Logger, Inject, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateShipmentDto, ShipmentTypeEnum, VisibilityEnum } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateStatusDto, ShipmentStatus } from './dto/update-status.dto';
import { AssignShipmentDto } from './dto/assign-shipment.dto';
import { FilterShipmentDto } from './dto/filter-shipment.dto';
import type { Shipment } from '@prisma/client';
import type { StorageService } from '../../common/storage/storage.interface';
import { MailService } from '../../common/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { AnalyticsResponseDto } from './dto/analytics-shipment.dto';
import UrlService from '../auth/url.service';

enum DocumentType {
   COMMERCIAL_INVOICE = 'COMMERCIAL_INVOICE',
   PACKING_LIST = 'PACKING_LIST',
   WAYBILL = 'WAYBILL',
   BILL_OF_LADING = 'BILL_OF_LADING',
   OTHER = 'OTHER',
}

// Platform fee rate (2.5%)
const TRANSACTION_FEE_RATE = 0.025;

@Injectable()
export class ShipmentsService {
   private readonly logger = new Logger(ShipmentsService.name);

   constructor(
      private readonly prisma: PrismaService,
      @Inject('StorageService') private readonly storage: StorageService,
      private readonly mailer: MailService,
      private readonly cfg: ConfigService,
      private readonly urlService: UrlService,
   ) {}

   private safeParseLocation(val: any): any | null {
      if (!val && val !== 0) return null;
      if (typeof val === 'object') return val;
      if (typeof val !== 'string') return val;
      try {
         return JSON.parse(val);
      } catch {
         const stripped = val.replace(/^"+|"+$/g, '');
         try {
            return JSON.parse(stripped);
         } catch {
            return { address: stripped };
         }
      }
   }

   private formatLocationText(loc: any) {
      if (!loc) return '';
      const address = loc.address || loc.addr || '';
      const state = loc.state || loc.region || '';
      const country = loc.country || '';
      const phone = loc.phone || loc.contact || '';
      const parts = [address, state, country].filter(Boolean).join(', ');
      return parts ? `${parts}. Contact: ${phone || 'N/A'}` : phone || 'N/A';
   }

   private prettyDate(d?: Date | string | null) {
      if (!d) return 'TBD';
      const dt = d instanceof Date ? d : new Date(d);
      return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
   }

   // ─────────────────────────────────────────────────────────────────────────
   // CALCULATE PRICE (for summary screen before creating shipment)
   // ─────────────────────────────────────────────────────────────────────────
   calculatePrice(dto: {
      shipmentType: string;
      baseFrieght?: number;
      handlingFee?: number;
      insuranceFee?: number;
      cargoDuty?: number;
   }) {
      const base = Number(dto.baseFrieght ?? 0);
      const handling = Number(dto.handlingFee ?? 0);
      const insurance = Number(dto.insuranceFee ?? 0);
      const duty = Number(dto.cargoDuty ?? 0);
      const subtotal = base + handling + insurance + duty;
      const transactionFee = Math.round(subtotal * TRANSACTION_FEE_RATE);
      const shippingCost = base + handling + insurance;
      const total = subtotal + transactionFee;

      return {
         shippingCost,
         cargoDuty: duty,
         transactionFee,
         total,
         breakdown: { baseFrieght: base, handlingFee: handling, insuranceFee: insurance },
      };
   }

   // ─────────────────────────────────────────────────────────────────────────
   // CREATE SHIPMENT
   // ─────────────────────────────────────────────────────────────────────────
   async create(dto: CreateShipmentDto, userId: string, files?: Express.Multer.File[]): Promise<Shipment> {
      try {
         // If a specific transporter is pre-selected, verify they exist
         if (dto.transporterId) {
            const transporter = await this.prisma.user.findUnique({ where: { id: dto.transporterId } });
            if (!transporter) throw new NotFoundException('Transporter not found');
            if (transporter.kind !== 'LAST_MILE_DELIVERY') throw new BadRequestException('Selected user is not a transporter');
         }

         // Upload waybill / custom docs
         const uploadPromises = (files ?? []).map((f) => this.storage.uploadFile(f, { folder: 'shipment-documents' }));
         const uploadedDocs = await Promise.all(uploadPromises);

         const n = (v?: any) => (isNaN(Number(v)) ? 0 : Number(v));

         const base = n(dto.baseFrieght);
         const handling = n(dto.handlingFee);
         const insurance = n(dto.insuranceFee);
         const duty = n(dto.cargoDuty);
         const subtotal = base + handling + insurance + duty;
         const transactionFee = dto.transactionFee !== undefined ? n(dto.transactionFee) : Math.round(subtotal * TRANSACTION_FEE_RATE);
         const totalCost = subtotal + transactionFee;

         const normalizedOrigin = this.safeParseLocation(dto.origin);
         const normalizedDestination = this.safeParseLocation(dto.destination);

         const shipment = await this.prisma.$transaction(async (tx: any) => {
            const created = await tx.shipment.create({
               data: {
                  orderId: dto.orderId ?? (await this.generateOrderTrackingId()),
                  shipmentType: dto.shipmentType ?? ShipmentTypeEnum.INLAND,
                  visibility: dto.visibility ?? VisibilityEnum.PUBLIC,
                  freightType: dto.freightType ?? null,
                  clientName: dto.clientName ?? dto.customerName ?? 'N/A',
                  email: dto.email,
                  phone: dto.phone,
                  nameOfItem: dto.nameOfItem,
                  customerName: dto.customerName,
                  customerPhone: dto.customerPhone,
                  additionalNote: dto.additionalNote,
                  cargoType: dto.cargoType ?? 'General',
                  tons: n(dto.tons),
                  weight: n(dto.weight),
                  handlingInstructions: dto.handlingInstructions,
                  truckType: dto.truckType,
                  truckSize: dto.truckSize,
                  destinationCountry: dto.destinationCountry,
                  customDocumentUrls: dto.customDocumentUrls ?? [],
                  cargoDuty: duty,
                  origin: normalizedOrigin ?? {},
                  destination: normalizedDestination ?? {},
                  pickupMode: dto.pickupMode ?? 'ROAD',
                  pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : null,
                  pickupTimeslot: dto.pickupTimeslot,
                  bookingOfficerPhone: dto.bookingOfficerPhone,
                  waybillUrl: dto.waybillUrl,
                  deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
                  orderNumber: dto.orderNumber,
                  serviceType: dto.serviceType ?? 'REGULAR_SHIPPING',
                  baseFrieght: base,
                  handlingFee: handling,
                  insuranceFee: insurance,
                  transactionFee,
                  totalCost,
                  status: ShipmentStatus.PENDING as any,
                  assignedTransporterId: dto.transporterId ?? null,
                  pickupLat: dto.pickupLat ?? null,
                  pickupLng: dto.pickupLng ?? null,
                  deliveryLat: dto.deliveryLat ?? null,
                  deliveryLng: dto.deliveryLng ?? null,
                  createdBy: userId,
                  customerId: userId,
               },
            });

            await tx.shipmentStatusHistory.create({
               data: { shipmentId: created.id, status: ShipmentStatus.PENDING as any, updatedBy: userId },
            });

            if (uploadedDocs.length > 0) {
               await tx.shipmentDocument.createMany({
                  data: uploadedDocs.map((doc, i) => ({
                     shipmentId: created.id,
                     docType: this.detectDocumentType(files?.[i]?.originalname) as any,
                     url: doc.url,
                     fileName: doc.name as any,
                  })),
               });
            }

            return created;
         });

         const originText = this.formatLocationText(this.safeParseLocation(shipment.origin ?? dto.origin));
         const destinationText = this.formatLocationText(this.safeParseLocation(shipment.destination ?? dto.destination));

         if (dto.email) {
            try {
               await this.mailer.sendShipmentCreated(dto.email, {
                  clientName: dto.clientName ?? dto.customerName ?? '',
                  trackingNumber: shipment.orderId,
                  origin: originText,
                  destination: destinationText,
                  estimatedDelivery: this.prettyDate(shipment.deliveryDate ?? dto.deliveryDate),
                  status: ShipmentStatus.PENDING,
                  trackingUrl: this.urlService.normalizePrefix(),
               });
            } catch (err: any) {
               this.logger.warn(`Failed to send shipment email: ${err?.message}`);
            }
         }

         await this.createNotification(userId, `New shipment ${shipment.orderId} created successfully`, 'in-app');
         return shipment;
      } catch (err: any) {
         this.logger.error('Shipment creation failed', err);
         if (err.code === 'P2002' && err.meta?.target?.includes('orderId')) {
            throw new BadRequestException(`A shipment with orderId '${dto.orderId}' already exists.`);
         }
         throw err instanceof BadRequestException || err instanceof NotFoundException ? err : new BadRequestException(err.message || 'Shipment creation failed');
      }
   }

   // ─────────────────────────────────────────────────────────────────────────
   // ACCEPT & ASSIGN SHIPMENT (LSP manual assignment)
   // ─────────────────────────────────────────────────────────────────────────
   async acceptAndAssign(shipmentId: string, dto: AssignShipmentDto, lspUserId: string): Promise<Shipment> {
      const user = await this.prisma.user.findUnique({ where: { id: lspUserId } });
      if (!user) throw new NotFoundException('User not found');

      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      if (![ShipmentStatus.PENDING as string, ShipmentStatus.ACCEPTED as string].includes(shipment.status)) {
         throw new BadRequestException('Shipment is not in an assignable state');
      }

      if (dto.transporterId) {
         const transporter = await this.prisma.user.findUnique({ where: { id: dto.transporterId } });
         if (!transporter) throw new NotFoundException('Transporter not found');
         if (transporter.kind !== 'LAST_MILE_DELIVERY') throw new BadRequestException('Invalid transporter');
      }

      let assignedLocation: { zoneId: string; rackId: string; binId: string } | null = null;
      if (dto.zoneId && dto.rackId && dto.binId) {
         const bin = await this.prisma.bin.findUnique({ where: { id: dto.binId }, include: { rack: { include: { zone: true } } } });
         if (!bin || bin.rack.zone.id !== dto.zoneId || bin.rack.id !== dto.rackId) {
            throw new BadRequestException('Invalid or mismatched location details');
         }
         if (bin.currentQty >= bin.capacity) throw new BadRequestException('Bin capacity is full');
         assignedLocation = { zoneId: dto.zoneId, rackId: dto.rackId, binId: dto.binId };
      }

      const updated = await this.prisma.$transaction(async (tx: any) => {
         const updatedShipment = await tx.shipment.update({
            where: { id: shipmentId },
            data: {
               status: ShipmentStatus.IN_WAREHOUSE as any,
               assignedTransporterId: dto.transporterId,
               assignedWarehouseId: dto.warehouseId,
               assignedZoneId: assignedLocation?.zoneId ?? null,
               assignedRackId: assignedLocation?.rackId ?? null,
               assignedBinId: assignedLocation?.binId ?? null,
               specialHandling: dto.special_handling,
               itemCompactibility: dto.itemCompactibility,
            },
            include: { transporter: true, warehouse: true, zone: true, rack: true, bin: true },
         });

         await tx.shipmentStatusHistory.create({ data: { shipmentId, status: ShipmentStatus.IN_WAREHOUSE as any, updatedBy: lspUserId } });

         if (assignedLocation) {
            await tx.bin.update({ where: { id: assignedLocation.binId }, data: { currentQty: { increment: 1 } } });
         }

         return updatedShipment;
      });

      await Promise.all([
         this.createNotification(lspUserId, `You accepted shipment ${updated.orderId}`, 'in-app'),
         this.createNotification(updated.customerId, `Shipment ${updated.orderId} has been accepted`, 'in-app'),
         dto.transporterId ? this.createNotification(dto.transporterId, `You have been assigned to shipment ${updated.orderId}`, 'in-app') : Promise.resolve(),
      ]);

      return updated;
   }

   // ─────────────────────────────────────────────────────────────────────────
   // UPDATE STATUS
   // ─────────────────────────────────────────────────────────────────────────
   async updateStatus(shipmentId: string, dto: UpdateStatusDto, updatedBy: string): Promise<Shipment> {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { transporter: true } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      const user = await this.prisma.user.findUnique({ where: { id: updatedBy } });
      if (!user) throw new NotFoundException('User not found');

      this.validateStatusTransition(shipment.status as ShipmentStatus, dto.status);

      const updated = await this.prisma.$transaction(async (tx: any) => {
         const updatedShipment = await tx.shipment.update({
            where: { id: shipmentId },
            data: { status: dto.status as any },
            include: { transporter: true, warehouse: true, documents: true },
         });
         await tx.shipmentStatusHistory.create({ data: { shipmentId, status: dto.status as any, updatedBy, note: dto.note } });
         return updatedShipment;
      });

      await Promise.all([
         this.createNotification(updatedBy, `You updated shipment ${updated.orderId} to ${dto.status}`, 'in-app'),
         this.createNotification(updated.customerId, `Your shipment ${updated.orderId} status changed to ${dto.status}`, 'in-app'),
         updated.assignedTransporterId ? this.createNotification(updated.assignedTransporterId, `Shipment ${updated.orderId} is now ${dto.status}`, 'in-app') : Promise.resolve(),
      ]);

      return updated;
   }

   // ─────────────────────────────────────────────────────────────────────────
   // LIST SHIPMENTS
   // ─────────────────────────────────────────────────────────────────────────
   async findAll(filters: FilterShipmentDto, userId: string) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, kind: true } });
      if (!user) throw new ForbiddenException('User not found');

      const { page = 1, limit = 20, statusFilter, ...filterCriteria } = filters;
      const skip = (page - 1) * limit;
      const where: any = {};

      if (user.kind === 'LOGISTIC_SERVICE_PROVIDER') {
         where.createdBy = userId;
      } else if (user.kind === 'LAST_MILE_DELIVERY') {
         where.assignedTransporterId = userId;
      } else if (['ENTERPRISE', 'DISTRIBUTOR', 'INDIVIDUAL'].includes(user.kind)) {
         where.OR = [{ createdBy: userId }, { customerId: userId }];
      } else {
         throw new ForbiddenException('You do not have permission to view shipments');
      }

      if (statusFilter) {
         switch (statusFilter.toLowerCase()) {
            case 'new':
            case 'pending':
               where.status = ShipmentStatus.PENDING;
               break;
            case 'accepted':
               where.status = ShipmentStatus.ACCEPTED;
               break;
            case 'in_warehouse':
            case 'warehouse':
               where.status = ShipmentStatus.IN_WAREHOUSE;
               break;
            case 'in_transit':
               where.status = ShipmentStatus.IN_TRANSIT;
               break;
            case 'delivered':
               where.status = ShipmentStatus.DELIVERED;
               break;
            case 'completed':
               where.status = ShipmentStatus.COMPLETED;
               break;
            case 'cancelled':
               where.status = ShipmentStatus.CANCELLED;
               break;
            case 'new_orders': {
               const threeDaysAgo = new Date();
               threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
               where.createdAt = { gte: threeDaysAgo };
               break;
            }
         }
      }

      if (filterCriteria.orderId) where.orderId = { contains: filterCriteria.orderId, mode: 'insensitive' };
      if (filterCriteria.cargoType) where.cargoType = { contains: filterCriteria.cargoType, mode: 'insensitive' };
      if (filterCriteria.origin) where.origin = { path: ['country'], string_contains: filterCriteria.origin };
      if (filterCriteria.destination) where.destination = { path: ['country'], string_contains: filterCriteria.destination };
      if (filterCriteria.startDate) where.createdAt = { ...where.createdAt, gte: new Date(filterCriteria.startDate) };
      if (filterCriteria.endDate) where.createdAt = { ...where.createdAt, lte: new Date(filterCriteria.endDate) };

      const [shipments, total] = await Promise.all([
         this.prisma.shipment.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
               customer: { select: { id: true, email: true, kind: true } },
               transporter: { select: { id: true, email: true, kind: true } },
               warehouse: { select: { id: true, name: true, address: true } },
               documents: { select: { id: true, docType: true, url: true, uploadedAt: true, fileName: true } },
               bids: { where: { status: 'PENDING' as any }, include: { transporter: { select: { id: true, email: true, phone: true, kind: true } } } },
            },
         }),
         this.prisma.shipment.count({ where }),
      ]);

      return { success: true, data: shipments, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
   }

   async findAllForTransporter(transporterId: string, filters: FilterShipmentDto) {
      const user = await this.prisma.user.findUnique({ where: { id: transporterId }, select: { kind: true } });
      if (!user || user.kind !== 'LAST_MILE_DELIVERY') throw new ForbiddenException('User is not a transporter');

      const { page = 1, limit = 20, ...filterCriteria } = filters;
      const skip = (page - 1) * limit;
      const where: any = { assignedTransporterId: transporterId };

      if (filterCriteria.status) where.status = filterCriteria.status;
      if (filterCriteria.orderId) where.orderId = { contains: filterCriteria.orderId, mode: 'insensitive' };

      const [shipments, total] = await Promise.all([
         this.prisma.shipment.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { customer: { select: { id: true, email: true } }, documents: true } }),
         this.prisma.shipment.count({ where }),
      ]);

      return { data: shipments, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
   }

   async findAllForCustomer(customerId: string, filters: FilterShipmentDto) {
      const user = await this.prisma.user.findUnique({ where: { id: customerId }, select: { kind: true } });
      if (!user || !['ENTERPRISE', 'DISTRIBUTOR', 'INDIVIDUAL'].includes(user.kind)) throw new ForbiddenException('Invalid customer access');

      const { page = 1, limit = 20, ...filterCriteria } = filters;
      const skip = (page - 1) * limit;
      const where: any = { OR: [{ createdBy: customerId }, { customerId }] };

      if (filterCriteria.status) where.status = filterCriteria.status;
      if (filterCriteria.orderId) where.orderId = { contains: filterCriteria.orderId, mode: 'insensitive' };

      const [shipments, total] = await Promise.all([
         this.prisma.shipment.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { transporter: { select: { id: true, email: true } }, documents: true, statusHistory: { orderBy: { timestamp: 'desc' }, take: 5 }, bids: { include: { transporter: { select: { id: true, email: true } } } } },
         }),
         this.prisma.shipment.count({ where }),
      ]);

      return { data: shipments, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
   }

   async findAllForLSP(lspUserId: string, filters: FilterShipmentDto) {
      const user = await this.prisma.user.findUnique({ where: { id: lspUserId }, select: { kind: true } });
      if (!user || user.kind !== 'LOGISTIC_SERVICE_PROVIDER') throw new ForbiddenException('Only LSP can access all shipments');

      const { page = 1, limit = 20, ...filterCriteria } = filters;
      const skip = (page - 1) * limit;
      const where: any = { createdBy: lspUserId };

      if (filterCriteria.status) where.status = filterCriteria.status;
      if (filterCriteria.orderId) where.orderId = { contains: filterCriteria.orderId, mode: 'insensitive' };
      if (filterCriteria.origin) where.origin = { path: ['country'], string_contains: filterCriteria.origin };
      if (filterCriteria.destination) where.destination = { path: ['country'], string_contains: filterCriteria.destination };

      const [shipments, total] = await Promise.all([
         this.prisma.shipment.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
               customer: { select: { id: true, email: true, kind: true } },
               creator: { select: { id: true, email: true, kind: true } },
               transporter: { select: { id: true, email: true, kind: true } },
               warehouse: { select: { id: true, name: true, address: true } },
               documents: true,
               bids: { include: { transporter: { select: { id: true, email: true, phone: true } } } },
               statusHistory: { orderBy: { timestamp: 'desc' }, take: 10, include: { updatedByUser: { select: { id: true, email: true } } } },
            },
         }),
         this.prisma.shipment.count({ where }),
      ]);

      const analytics = await this.getShipmentAnalytics(where);
      return { data: shipments, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }, analytics };
   }

   async getDashboardAnalytics(userId: string): Promise<AnalyticsResponseDto> {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, kind: true } });
      if (!user) throw new ForbiddenException('User not found');

      const shipments = await this.prisma.shipment.findMany({ where: { createdBy: userId }, include: { statusHistory: { orderBy: { timestamp: 'desc' } } } });
      const now = new Date();
      const TERMINAL = [ShipmentStatus.COMPLETED, ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED];

      const activeShipmentCount = shipments.filter((s: any) => s.status === ShipmentStatus.IN_WAREHOUSE).length;
      const inTransitCount = shipments.filter((s: any) => s.status === ShipmentStatus.IN_TRANSIT).length;
      const completedCount = shipments.filter((s: any) => TERMINAL.includes(s.status)).length;
      const delayedShipments = shipments.filter((s: any) => {
         if (TERMINAL.includes(s.status)) return false;
         if (!s.deliveryDate) return false;
         return new Date(s.deliveryDate).getTime() < now.getTime();
      }).length;

      const completedWithDates = shipments.filter((s: any) => TERMINAL.includes(s.status) && s.pickupDate && s.deliveryDate);
      let averageMinutes = 0;
      if (completedWithDates.length > 0) {
         const total = completedWithDates.reduce((sum: number, s: any) => sum + (new Date(s.deliveryDate!).getTime() - new Date(s.pickupDate!).getTime()) / 60000, 0);
         averageMinutes = Math.round(total / completedWithDates.length);
      }

      const recentActivity = await this.prisma.shipmentStatusHistory.findMany({
         where: { shipment: { createdBy: userId } },
         take: 10,
         orderBy: { timestamp: 'desc' },
         include: { shipment: { select: { id: true, orderId: true } } },
      });

      return {
         activeShipment: activeShipmentCount,
         shipmentsInTransit: inTransitCount,
         completedDeliveries: completedCount,
         delayedShipments,
         averageDeliveryTime: { hours: Math.floor(averageMinutes / 60), minutes: averageMinutes % 60, totalMinutes: averageMinutes },
         totalShipments: shipments.length,
         recentActivity: recentActivity.map((a: any) => ({ shipmentId: a.shipment.id, orderId: a.shipment.orderId, status: a.status, updatedAt: a.timestamp })),
      };
   }

   private async getShipmentAnalytics(where: any) {
      const [total, pending, accepted, inWarehouse, inTransit, completed, cancelled] = await Promise.all([
         this.prisma.shipment.count({ where }),
         this.prisma.shipment.count({ where: { ...where, status: ShipmentStatus.PENDING } }),
         this.prisma.shipment.count({ where: { ...where, status: ShipmentStatus.ACCEPTED } }),
         this.prisma.shipment.count({ where: { ...where, status: ShipmentStatus.IN_WAREHOUSE } }),
         this.prisma.shipment.count({ where: { ...where, status: ShipmentStatus.IN_TRANSIT } }),
         this.prisma.shipment.count({ where: { ...where, status: ShipmentStatus.COMPLETED } }),
         this.prisma.shipment.count({ where: { ...where, status: ShipmentStatus.CANCELLED } }),
      ]);

      return { totalShipments: total, byStatus: { pending, accepted, inWarehouse, inTransit, completed, cancelled } };
   }

   async findOne(shipmentId: string, userId: string): Promise<Shipment> {
      const shipment = await this.prisma.shipment.findUnique({
         where: { id: shipmentId },
         include: {
            customer: true,
            creator: true,
            transporter: true,
            warehouse: true,
            documents: true,
            bids: { include: { transporter: { select: { id: true, email: true, phone: true, kind: true } } } },
            statusHistory: { orderBy: { timestamp: 'desc' }, include: { updatedByUser: { select: { id: true, email: true } } } },
            payment: true,
         },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
      return shipment;
   }

   async trackByOrderId(orderId: string, userId: string) {
      const shipment = await this.prisma.shipment.findUnique({ where: { orderId }, include: { statusHistory: { orderBy: { timestamp: 'desc' } }, documents: true } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.customerId !== userId) throw new BadRequestException('Unauthorized to track this shipment');

      return {
         orderId: shipment.orderId,
         clientName: shipment.clientName,
         shipmentType: shipment.shipmentType,
         status: shipment.status,
         origin: shipment.origin,
         destination: shipment.destination,
         pickupDate: shipment.pickupDate,
         deliveryDate: shipment.deliveryDate,
         currentLocation: this.getCurrentLocation(shipment.status as ShipmentStatus),
         timeline: shipment.statusHistory.map((h: any) => ({ status: h.status, timestamp: h.timestamp, note: h.note })),
      };
   }

   async updateCurrentLocation(shipmentId: string, lat: number, lng: number) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      return this.prisma.shipment.update({
         where: { id: shipmentId },
         data: { currentLat: lat, currentLng: lng },
         select: { id: true, currentLat: true, currentLng: true },
      });
   }

   async getLocation(shipmentId: string) {
      const shipment = await this.prisma.shipment.findUnique({
         where: { id: shipmentId },
         select: {
            id: true,
            orderId: true,
            status: true,
            pickupLat: true,
            pickupLng: true,
            deliveryLat: true,
            deliveryLng: true,
            currentLat: true,
            currentLng: true,
         },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
      return shipment;
   }

   async update(shipmentId: string, dto: UpdateShipmentDto, userId: string): Promise<Shipment> {
      await this.verifyShipmentOwnership(shipmentId, userId);
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      const base = (dto.baseFrieght as any) ?? shipment.baseFrieght;
      const handling = (dto.handlingFee as any) ?? shipment.handlingFee;
      const insurance = dto.insuranceFee ?? (shipment.insuranceFee as any) ?? 0;
      const duty = (shipment as any).cargoDuty ?? 0;
      const subtotal = Number(base) + Number(handling) + Number(insurance) + Number(duty);
      const transactionFee = Math.round(subtotal * TRANSACTION_FEE_RATE);
      const totalCost = subtotal + transactionFee;

      return this.prisma.shipment.update({
         where: { id: shipmentId },
         data: {
            ...dto,
            totalCost,
            transactionFee,
            pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : shipment.pickupDate,
            deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : shipment.deliveryDate,
            origin: dto.origin as any,
            destination: dto.destination as any,
         },
      });
   }

   async remove(shipmentId: string, userId: string): Promise<{ message: string }> {
      await this.verifyShipmentOwnership(shipmentId, userId);
      await this.prisma.$transaction(async (tx: any) => {
         await tx.shipmentDocument.deleteMany({ where: { shipmentId } });
         await tx.shipmentStatusHistory.deleteMany({ where: { shipmentId } });
         await tx.transporterBid.deleteMany({ where: { shipmentId } });
         await tx.payment.deleteMany({ where: { shipmentId } });
         await tx.shipment.delete({ where: { id: shipmentId } });
      });
      return { message: 'Shipment deleted successfully' };
   }

   async generateOrderTrackingId(): Promise<string> {
      while (true) {
         const year = new Date().getFullYear();
         const randomId = Math.floor(10000 + Math.random() * 90000);
         const trackingId = `SHP-${year}-${randomId}`;
         const existing = await this.prisma.shipment.findFirst({ where: { orderId: trackingId } });
         if (!existing) return trackingId;
      }
   }

   private validateStatusTransition(current: ShipmentStatus, next: ShipmentStatus): void {
      const valid: Record<ShipmentStatus, ShipmentStatus[]> = {
         [ShipmentStatus.PENDING]: [ShipmentStatus.ACCEPTED, ShipmentStatus.CANCELLED],
         [ShipmentStatus.ACCEPTED]: [ShipmentStatus.IN_WAREHOUSE, ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
         [ShipmentStatus.IN_WAREHOUSE]: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
         [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.PICKED_UP, ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
         [ShipmentStatus.PICKED_UP]: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
         [ShipmentStatus.DELIVERED]: [ShipmentStatus.COMPLETED],
         [ShipmentStatus.COMPLETED]: [],
         [ShipmentStatus.CANCELLED]: [],
      };
      if (!valid[current]?.includes(next)) throw new BadRequestException(`Invalid status transition from ${current} to ${next}`);
   }

   private getCurrentLocation(status: ShipmentStatus): string {
      const map: Record<ShipmentStatus, string> = {
         [ShipmentStatus.PENDING]: 'Pending – Awaiting Processing',
         [ShipmentStatus.ACCEPTED]: 'Accepted – Awaiting Pickup',
         [ShipmentStatus.IN_WAREHOUSE]: 'In Warehouse',
         [ShipmentStatus.IN_TRANSIT]: 'In Transit',
         [ShipmentStatus.PICKED_UP]: 'Picked Up',
         [ShipmentStatus.DELIVERED]: 'Delivered',
         [ShipmentStatus.COMPLETED]: 'Completed',
         [ShipmentStatus.CANCELLED]: 'Cancelled',
      };
      return map[status] ?? 'Unknown';
   }

   private detectDocumentType(filename?: string): DocumentType {
      if (!filename) return DocumentType.OTHER;
      const lower = filename.toLowerCase();
      if (lower.includes('invoice')) return DocumentType.COMMERCIAL_INVOICE;
      if (lower.includes('packing')) return DocumentType.PACKING_LIST;
      if (lower.includes('waybill')) return DocumentType.WAYBILL;
      if (lower.includes('lading')) return DocumentType.BILL_OF_LADING;
      return DocumentType.OTHER;
   }

   async createNotification(recipientId: string, message: string, type: 'email' | 'in-app' | 'sms') {
      try {
         const user = await this.prisma.user.findUnique({ where: { id: recipientId } });
         if (user) {
            await this.prisma.notification.create({ data: { userId: user.id, message, type: type.toUpperCase().replace('-', '_') as any, read: false } });
            return;
         }
         const warehouse = await this.prisma.warehouse.findUnique({ where: { id: recipientId }, select: { companyId: true } });
         if (warehouse) {
            const users = await this.prisma.user.findMany({ where: { companyId: warehouse.companyId }, select: { id: true } });
            await Promise.all(users.map((u: any) => this.prisma.notification.create({ data: { userId: u.id, message, type: type.toUpperCase().replace('-', '_') as any, read: false } })));
         }
      } catch (err: any) {
         this.logger.error(`Failed to create notification: ${err.message}`);
      }
   }

   private async verifyShipmentOwnership(shipmentId: string, userId: string): Promise<void> {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, select: { id: true, customerId: true, createdBy: true } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.customerId !== userId && shipment.createdBy !== userId) throw new ForbiddenException('Not authorized to access this shipment');
   }
}
