import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { InitiatePaymentDto, PaymentProvider } from './dto/initiate-payment.dto';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class PaymentService {
   private readonly logger = new Logger(PaymentService.name);

   constructor(
      private readonly prisma: PrismaService,
      private readonly cfg: ConfigService,
   ) {}

   // ─── INITIATE PAYMENT ──────────────────────────────────────────────────────
   async initiatePayment(userId: string, dto: InitiatePaymentDto) {
      const shipment = await this.prisma.shipment.findUnique({
         where: { id: dto.shipmentId },
         include: { customer: { select: { id: true, email: true } } },
      });

      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.createdBy !== userId && shipment.customerId !== userId) {
         throw new BadRequestException('You are not authorized to pay for this shipment');
      }

      const existingPayment = await this.prisma.payment.findUnique({ where: { shipmentId: dto.shipmentId } });
      if (existingPayment && existingPayment.status === 'SUCCESS') {
         throw new BadRequestException('This shipment has already been paid for');
      }

      const reference = `HAGE-${shipment.orderId}-${Date.now()}`;
      const amount = shipment.totalCost;
      const email = shipment.customer?.email ?? (shipment as any).email ?? '';
      const provider = dto.provider ?? PaymentProvider.PAYSTACK;

      // Upsert payment record (idempotent)
      await this.prisma.payment.upsert({
         where: { shipmentId: dto.shipmentId },
         create: { shipmentId: dto.shipmentId, userId, amount, provider, reference, status: 'PENDING', currency: 'NGN' },
         update: { reference, status: 'PENDING', amount, provider },
      });

      if (provider === PaymentProvider.PAYSTACK) {
         return this.initiatePaystack({ email, amount, reference, callbackUrl: dto.callbackUrl });
      }

      return this.initiateFlutterwave({ email, amount, reference, name: shipment.clientName, callbackUrl: dto.callbackUrl });
   }

   private async initiatePaystack(params: { email: string; amount: number; reference: string; callbackUrl?: string }) {
      const secretKey = this.cfg.get<string>('PAYSTACK_SECRET_KEY');
      if (!secretKey) throw new BadRequestException('Payment gateway not configured');

      const payload: any = {
         email: params.email,
         amount: Math.round(params.amount * 100), // Paystack uses kobo
         reference: params.reference,
         currency: 'NGN',
      };
      if (params.callbackUrl) payload.callback_url = params.callbackUrl;

      try {
         const { data } = await axios.post('https://api.paystack.co/transaction/initialize', payload, {
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
         });

         return {
            provider: 'PAYSTACK',
            reference: params.reference,
            paymentUrl: data.data.authorization_url,
            accessCode: data.data.access_code,
         };
      } catch (err: any) {
         this.logger.error('Paystack initiation failed', err?.response?.data ?? err.message);
         throw new BadRequestException('Failed to initiate payment with Paystack');
      }
   }

   private async initiateFlutterwave(params: { email: string; amount: number; reference: string; name: string; callbackUrl?: string }) {
      const secretKey = this.cfg.get<string>('FLUTTERWAVE_SECRET_KEY');
      if (!secretKey) throw new BadRequestException('Payment gateway not configured');

      const payload = {
         tx_ref: params.reference,
         amount: params.amount,
         currency: 'NGN',
         redirect_url: params.callbackUrl ?? '',
         customer: { email: params.email, name: params.name },
         customizations: { title: 'Hage Logistics', logo: '' },
      };

      try {
         const { data } = await axios.post('https://api.flutterwave.com/v3/payments', payload, {
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
         });

         return { provider: 'FLUTTERWAVE', reference: params.reference, paymentUrl: data.data.link };
      } catch (err: any) {
         this.logger.error('Flutterwave initiation failed', err?.response?.data ?? err.message);
         throw new BadRequestException('Failed to initiate payment with Flutterwave');
      }
   }

   // ─── VERIFY & HANDLE PAYSTACK WEBHOOK ──────────────────────────────────────
   async handlePaystackWebhook(payload: any, signature: string) {
      const secret = this.cfg.get<string>('PAYSTACK_SECRET_KEY') ?? '';
      const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(payload)).digest('hex');

      if (hash !== signature) {
         this.logger.warn('Invalid Paystack webhook signature');
         return { received: false };
      }

      if (payload.event === 'charge.success') {
         await this.confirmPayment(payload.data.reference, 'PAYSTACK', payload.data);
      }

      return { received: true };
   }

   // ─── VERIFY & HANDLE FLUTTERWAVE WEBHOOK ───────────────────────────────────
   async handleFlutterwaveWebhook(payload: any, signature: string) {
      const secret = this.cfg.get<string>('FLUTTERWAVE_WEBHOOK_SECRET') ?? '';
      const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

      if (hash !== signature) {
         this.logger.warn('Invalid Flutterwave webhook signature');
         return { received: false };
      }

      if (payload.event === 'charge.completed' && payload.data?.status === 'successful') {
         await this.confirmPayment(payload.data.tx_ref, 'FLUTTERWAVE', payload.data);
      }

      return { received: true };
   }

   private async confirmPayment(reference: string, provider: string, metadata: any) {
      const payment = await this.prisma.payment.findUnique({ where: { reference } });
      if (!payment) {
         this.logger.warn(`Payment not found for reference: ${reference}`);
         return;
      }
      if (payment.status === 'SUCCESS') return; // already processed (idempotent)

      await this.prisma.$transaction(async (tx: any) => {
         await tx.payment.update({
            where: { reference },
            data: { status: 'SUCCESS', paidAt: new Date(), metadata },
         });

         // Move shipment status forward if still ACCEPTED
         const shipment = await tx.shipment.findUnique({ where: { id: payment.shipmentId } });
         if (shipment && ['PENDING', 'ACCEPTED'].includes(shipment.status)) {
            await tx.shipment.update({ where: { id: payment.shipmentId }, data: { status: 'IN_TRANSIT' as any } });
            await tx.shipmentStatusHistory.create({
               data: { shipmentId: payment.shipmentId, status: 'IN_TRANSIT' as any, updatedBy: payment.userId, note: `Payment confirmed via ${provider}` },
            });
         }
      });

      this.logger.log(`Payment confirmed: ${reference}`);
   }

   // ─── GET PAYMENT STATUS ────────────────────────────────────────────────────
   async getPaymentStatus(shipmentId: string, userId: string) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.createdBy !== userId && shipment.customerId !== userId) {
         throw new BadRequestException('Access denied');
      }

      const payment = await this.prisma.payment.findUnique({ where: { shipmentId } });
      if (!payment) return { status: 'NOT_INITIATED', shipmentId, amount: shipment.totalCost };

      return {
         id: payment.id,
         shipmentId,
         amount: payment.amount,
         currency: payment.currency,
         provider: payment.provider,
         reference: payment.reference,
         status: payment.status,
         paidAt: payment.paidAt,
         createdAt: payment.createdAt,
      };
   }

   // ─── VERIFY PAYMENT MANUALLY (polling fallback) ────────────────────────────
   async verifyPayment(reference: string, userId: string) {
      const payment = await this.prisma.payment.findUnique({ where: { reference } });
      if (!payment) throw new NotFoundException('Payment record not found');

      if (payment.userId !== userId) throw new BadRequestException('Access denied');
      if (payment.status === 'SUCCESS') return { verified: true, status: 'SUCCESS', payment };

      if (payment.provider === 'PAYSTACK') {
         const secretKey = this.cfg.get<string>('PAYSTACK_SECRET_KEY');
         try {
            const { data } = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
               headers: { Authorization: `Bearer ${secretKey}` },
            });
            if (data.data.status === 'success') {
               await this.confirmPayment(reference, 'PAYSTACK', data.data);
               return { verified: true, status: 'SUCCESS' };
            }
         } catch (err: any) {
            this.logger.error('Paystack verify failed', err?.response?.data);
         }
      }

      return { verified: false, status: payment.status };
   }
}
