import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommunicationsService } from './communications.service';
import { SendShipmentMessageDto, StartShipmentCallDto, UpdateShipmentCallDto } from './dto/communications.dto';

@ApiTags('communications')
@Controller('communications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class CommunicationsController {
   constructor(private readonly communications: CommunicationsService) {}

   private userId(req: Request) {
      const user = req.user as any;
      return user?.sub || user?.id;
   }

   @Get('shipments/:shipmentId')
   @ApiOperation({ summary: 'Get active shipment communication context' })
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   getContext(@Param('shipmentId') shipmentId: string, @Req() req: Request) {
      return this.communications.getContext(shipmentId, this.userId(req));
   }

   @Get('token')
   @ApiOperation({
      summary: 'Create Twilio client token for in-app messaging/calling',
      description:
         'Returns a short-lived token for Twilio Conversations and/or Voice SDK when the required Twilio env vars are configured. For voice calls, the frontend should call the Twilio SDK with `To` set to the other participant user id from the shipment communication context.',
   })
   createClientToken(@Req() req: Request) {
      return this.communications.createClientToken(this.userId(req));
   }

   @Get('shipments/:shipmentId/messages')
   @ApiOperation({ summary: 'List shipment messages between enterprise and assigned transporter' })
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   listMessages(@Param('shipmentId') shipmentId: string, @Req() req: Request) {
      return this.communications.listMessages(shipmentId, this.userId(req));
   }

   @Post('shipments/:shipmentId/messages')
   @ApiOperation({ summary: 'Send a shipment message' })
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   @ApiResponse({ status: 201, description: 'Message sent' })
   sendMessage(@Param('shipmentId') shipmentId: string, @Req() req: Request, @Body() dto: SendShipmentMessageDto) {
      return this.communications.sendMessage(shipmentId, this.userId(req), dto);
   }

   @Patch('shipments/:shipmentId/messages/read')
   @ApiOperation({ summary: 'Mark received shipment messages as read' })
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   markMessagesRead(@Param('shipmentId') shipmentId: string, @Req() req: Request) {
      return this.communications.markMessagesRead(shipmentId, this.userId(req));
   }

   @Get('shipments/:shipmentId/calls')
   @ApiOperation({ summary: 'List shipment call sessions' })
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   listCalls(@Param('shipmentId') shipmentId: string, @Req() req: Request) {
      return this.communications.listCalls(shipmentId, this.userId(req));
   }

   @Post('shipments/:shipmentId/calls')
   @ApiOperation({
      summary: 'Start/log an in-app shipment call',
      description:
         'Creates a backend call session record. The response includes `recipientId`; the frontend should pass that value to Twilio Voice as `To`. Live audio, mute, volume, and hangup controls are handled by the frontend calling SDK.',
   })
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   @ApiResponse({
      status: 201,
      description: 'Call session created. Use recipientId as Twilio Voice `To`.',
      schema: {
         example: {
            id: 'call_session_id',
            threadId: 'communication_thread_id',
            shipmentId: 'shipment_id',
            initiatedById: 'enterprise_user_id',
            recipientId: 'assigned_transporter_user_id',
            status: 'REQUESTED',
            provider: 'IN_APP',
            providerCallId: null,
            startedAt: null,
            endedAt: null,
            createdAt: '2026-06-08T10:00:00.000Z',
            updatedAt: '2026-06-08T10:00:00.000Z',
         },
      },
   })
   startCall(@Param('shipmentId') shipmentId: string, @Req() req: Request, @Body() dto: StartShipmentCallDto) {
      return this.communications.startCall(shipmentId, this.userId(req), dto);
   }

   @Patch('shipments/:shipmentId/calls/:callId')
   @ApiOperation({
      summary: 'Update shipment call status',
      description: 'Use this to mark a call as ringing, ongoing, ended, missed, rejected, or cancelled.',
   })
   @ApiParam({ name: 'shipmentId', description: 'Shipment ID' })
   @ApiParam({ name: 'callId', description: 'Call session ID' })
   updateCall(@Param('shipmentId') shipmentId: string, @Param('callId') callId: string, @Req() req: Request, @Body() dto: UpdateShipmentCallDto) {
      return this.communications.updateCall(shipmentId, callId, this.userId(req), dto);
   }
}
