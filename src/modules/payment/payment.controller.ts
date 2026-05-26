import { Controller, Post, Get, Param, Body, Headers, UseGuards, Req, RawBodyRequest, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { Request } from 'express';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
   constructor(private readonly svc: PaymentService) {}

   // ─── INITIATE PAYMENT (Proceed to payment button) ──────────────────────────
   @Post('initiate')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiOperation({
      summary: 'Initiate payment for a shipment',
      description: 'Creates a payment session with Paystack or Flutterwave and returns a payment URL. Triggered by the "Proceed to payment" button on the summary screen.',
   })
   initiatePayment(@Body() dto: InitiatePaymentDto, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.initiatePayment(userId, dto);
   }

   // ─── GET PAYMENT STATUS ────────────────────────────────────────────────────
   @Get('shipment/:shipmentId')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'shipmentId' })
   @ApiOperation({ summary: 'Get payment status for a shipment' })
   getPaymentStatus(@Param('shipmentId') shipmentId: string, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.getPaymentStatus(shipmentId, userId);
   }

   // ─── VERIFY PAYMENT MANUALLY ───────────────────────────────────────────────
   @Get('verify/:reference')
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @ApiParam({ name: 'reference' })
   @ApiOperation({ summary: 'Manually verify payment by reference (polling fallback)' })
   verifyPayment(@Param('reference') reference: string, @Req() req: Request) {
      const userId = (req.user as any).id;
      return this.svc.verifyPayment(reference, userId);
   }

   // ─── PAYSTACK WEBHOOK ──────────────────────────────────────────────────────
   @Post('webhook/paystack')
   @HttpCode(HttpStatus.OK)
   @ApiOperation({ summary: 'Paystack payment webhook', description: 'Webhook endpoint to be registered on your Paystack dashboard.' })
   paystackWebhook(@Body() payload: any, @Headers('x-paystack-signature') signature: string) {
      return this.svc.handlePaystackWebhook(payload, signature);
   }

   // ─── FLUTTERWAVE WEBHOOK ───────────────────────────────────────────────────
   @Post('webhook/flutterwave')
   @HttpCode(HttpStatus.OK)
   @ApiOperation({ summary: 'Flutterwave payment webhook', description: 'Webhook endpoint to be registered on your Flutterwave dashboard.' })
   flutterwaveWebhook(@Body() payload: any, @Headers('verif-hash') signature: string) {
      return this.svc.handleFlutterwaveWebhook(payload, signature);
   }
}
