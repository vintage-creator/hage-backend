import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallSessionStatus, ShipmentStatus } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SendShipmentMessageDto, StartShipmentCallDto, UpdateShipmentCallDto } from './dto/communications.dto';

const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [ShipmentStatus.ACCEPTED, ShipmentStatus.IN_WAREHOUSE, ShipmentStatus.IN_TRANSIT, ShipmentStatus.PICKED_UP];

@Injectable()
export class CommunicationsService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly cfg: ConfigService,
   ) {}

   private base64Url(input: Buffer | string) {
      return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
   }

   private signTwilioToken(payload: Record<string, any>, secret: string) {
      const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
      const encodedHeader = this.base64Url(JSON.stringify(header));
      const encodedPayload = this.base64Url(JSON.stringify(payload));
      const signature = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest();
      return `${encodedHeader}.${encodedPayload}.${this.base64Url(signature)}`;
   }

   private async getUser(userId: string) {
      const user = await this.prisma.user.findUnique({
         where: { id: userId },
         select: { id: true, email: true, phone: true, kind: true, company: { select: { fullName: true, businessName: true } } },
      });
      if (!user) throw new NotFoundException('User not found');
      return user;
   }

   private async getShipmentForCommunication(shipmentId: string, userId: string) {
      const shipment = await this.prisma.shipment.findUnique({
         where: { id: shipmentId },
         include: {
            customer: { select: { id: true, email: true, phone: true, kind: true, company: { select: { fullName: true, businessName: true } } } },
            transporter: { select: { id: true, email: true, phone: true, kind: true, company: { select: { fullName: true, businessName: true } } } },
            communicationThread: true,
         },
      });

      if (!shipment) throw new NotFoundException('Shipment not found');
      if (!ACTIVE_SHIPMENT_STATUSES.includes(shipment.status as ShipmentStatus)) {
         throw new BadRequestException('Communications are only available for active assigned shipments');
      }
      if (!shipment.assignedTransporterId || !shipment.transporter) {
         throw new BadRequestException('Shipment must have an assigned transporter before communications can start');
      }
      const isEnterpriseOwner = shipment.customerId === userId || shipment.createdBy === userId;
      const isAssignedTransporter = shipment.assignedTransporterId === userId;
      if (!isEnterpriseOwner && !isAssignedTransporter) {
         throw new ForbiddenException('Not authorized to access communications for this shipment');
      }

      return shipment;
   }

   private async getOrCreateThread(shipment: Awaited<ReturnType<CommunicationsService['getShipmentForCommunication']>>) {
      if (shipment.communicationThread) return shipment.communicationThread;

      return this.prisma.communicationThread.create({
         data: {
            shipmentId: shipment.id,
            enterpriseUserId: shipment.customerId,
            transporterUserId: shipment.assignedTransporterId!,
         },
      });
   }

   private otherParticipantId(thread: { enterpriseUserId: string; transporterUserId: string }, userId: string) {
      return thread.enterpriseUserId === userId ? thread.transporterUserId : thread.enterpriseUserId;
   }

   async createClientToken(userId: string) {
      const user = await this.getUser(userId);
      const accountSid = this.cfg.get<string>('TWILIO_ACCOUNT_SID');
      const apiKeySid = this.cfg.get<string>('TWILIO_API_KEY_SID');
      const apiKeySecret = this.cfg.get<string>('TWILIO_API_KEY_SECRET');
      const conversationsServiceSid = this.cfg.get<string>('TWILIO_CONVERSATIONS_SERVICE_SID');
      const twimlAppSid = this.cfg.get<string>('TWILIO_TWIML_APP_SID');

      if (!accountSid || !apiKeySid || !apiKeySecret) {
         throw new BadRequestException('Twilio client token credentials are not configured');
      }

      const grants: Record<string, any> = {
         identity: user.id,
      };

      if (conversationsServiceSid) {
         grants.chat = { service_sid: conversationsServiceSid };
      }

      if (twimlAppSid) {
         grants.voice = {
            outgoing: { application_sid: twimlAppSid },
            incoming: { allow: true },
         };
      }

      if (!grants.chat && !grants.voice) {
         throw new BadRequestException('Twilio Conversations or Voice is not configured');
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 60 * 60;
      const token = this.signTwilioToken(
         {
            jti: `${apiKeySid}-${now}-${randomBytes(8).toString('hex')}`,
            iss: apiKeySid,
            sub: accountSid,
            iat: now,
            exp: expiresAt,
            grants,
         },
         apiKeySecret,
      );

      return {
         token,
         identity: user.id,
         expiresAt: new Date(expiresAt * 1000).toISOString(),
         grants: {
            conversations: Boolean(grants.chat),
            voice: Boolean(grants.voice),
         },
      };
   }

   async getContext(shipmentId: string, userId: string) {
      const [user, shipment] = await Promise.all([this.getUser(userId), this.getShipmentForCommunication(shipmentId, userId)]);
      const thread = await this.getOrCreateThread(shipment);

      return {
         shipment: {
            id: shipment.id,
            orderId: shipment.orderId,
            status: shipment.status,
            origin: shipment.origin,
            destination: shipment.destination,
            deliveryDate: shipment.deliveryDate,
         },
         thread,
         participants: {
            currentUser: user,
            enterprise: shipment.customer,
            transporter: shipment.transporter,
         },
      };
   }

   async listMessages(shipmentId: string, userId: string) {
      const shipment = await this.getShipmentForCommunication(shipmentId, userId);
      const thread = await this.getOrCreateThread(shipment);

      return this.prisma.communicationMessage.findMany({
         where: { threadId: thread.id },
         orderBy: { createdAt: 'asc' },
         include: {
            sender: {
               select: { id: true, email: true, phone: true, kind: true, company: { select: { fullName: true, businessName: true } } },
            },
         },
      });
   }

   async sendMessage(shipmentId: string, userId: string, dto: SendShipmentMessageDto) {
      const shipment = await this.getShipmentForCommunication(shipmentId, userId);
      const thread = await this.getOrCreateThread(shipment);

      return this.prisma.communicationMessage.create({
         data: {
            threadId: thread.id,
            senderId: userId,
            body: dto.body.trim(),
         },
         include: {
            sender: {
               select: { id: true, email: true, phone: true, kind: true, company: { select: { fullName: true, businessName: true } } },
            },
         },
      });
   }

   async markMessagesRead(shipmentId: string, userId: string) {
      const shipment = await this.getShipmentForCommunication(shipmentId, userId);
      const thread = await this.getOrCreateThread(shipment);

      const result = await this.prisma.communicationMessage.updateMany({
         where: {
            threadId: thread.id,
            senderId: { not: userId },
            readAt: null,
         },
         data: { readAt: new Date() },
      });

      return { ok: true, markedRead: result.count };
   }

   async startCall(shipmentId: string, userId: string, dto: StartShipmentCallDto) {
      const shipment = await this.getShipmentForCommunication(shipmentId, userId);
      const thread = await this.getOrCreateThread(shipment);
      const recipientId = this.otherParticipantId(thread, userId);

      return this.prisma.callSession.create({
         data: {
            threadId: thread.id,
            shipmentId,
            initiatedById: userId,
            recipientId,
            status: CallSessionStatus.REQUESTED,
            providerCallId: dto.providerCallId,
         },
      });
   }

   async updateCall(shipmentId: string, callId: string, userId: string, dto: UpdateShipmentCallDto) {
      const shipment = await this.getShipmentForCommunication(shipmentId, userId);
      const call = await this.prisma.callSession.findFirst({
         where: { id: callId, shipmentId, thread: { shipmentId: shipment.id } },
      });
      if (!call) throw new NotFoundException('Call session not found');
      if (call.initiatedById !== userId && call.recipientId !== userId) {
         throw new ForbiddenException('Not authorized to update this call');
      }

      const status = dto.status as CallSessionStatus;
      const now = new Date();
      const terminalStatuses: CallSessionStatus[] = [CallSessionStatus.ENDED, CallSessionStatus.MISSED, CallSessionStatus.REJECTED, CallSessionStatus.CANCELLED];

      return this.prisma.callSession.update({
         where: { id: call.id },
         data: {
            status,
            providerCallId: dto.providerCallId ?? call.providerCallId,
            startedAt: status === CallSessionStatus.ONGOING && !call.startedAt ? now : call.startedAt,
            endedAt: terminalStatuses.includes(status) ? now : call.endedAt,
         },
      });
   }

   async listCalls(shipmentId: string, userId: string) {
      const shipment = await this.getShipmentForCommunication(shipmentId, userId);
      const thread = await this.getOrCreateThread(shipment);

      return this.prisma.callSession.findMany({
         where: { threadId: thread.id },
         orderBy: { createdAt: 'desc' },
      });
   }
}
