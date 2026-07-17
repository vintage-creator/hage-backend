import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LastMileService } from './last-mile.service';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { SetBankAccountDto } from './dto/set-bank-account.dto';
import { WithdrawFundsDto } from './dto/withdraw-funds.dto';
import { StatementQueryDto } from './dto/statement-query.dto';
import { NavigationQueryDto } from './dto/navigation-query.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto';
import { ConfirmCodeDto } from './dto/confirm-code.dto';

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
   const ext = path.extname(file.originalname).toLowerCase();
   const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
   const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

   if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
   } else {
      cb(new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), false);
   }
};

@ApiTags('last-mile-delivery')
@Controller('last-mile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('LAST_MILE_DELIVERY')
@ApiBearerAuth('access-token')
export class LastMileController {
   constructor(private readonly svc: LastMileService) {}

   private userId(req: Request) {
      const user = req.user as any;
      return user?.id || user?.sub;
   }

   // ─── DASHBOARD (Image 1) ────────────────────────────────────────────────
   @Get('dashboard')
   @ApiOperation({
      summary: 'Get last-mile driver dashboard',
      description: 'Returns availability status, current (withdrawable) earnings, delivery stats (total/completed/pending/failed), and the active delivery card.',
   })
   @ApiResponse({
      status: 200,
      schema: {
         example: {
            isAvailable: false,
            earnings: { currentEarnings: 12456.55, currency: 'NGN' },
            stats: { totalDeliveries: 24, completed: 18, pending: 3, failed: 2 },
            currentDelivery: {
               id: 'shp_123',
               orderId: 'SHP-2026-53678',
               status: 'IN_TRANSIT',
               eta: '2026-07-10T15:30:00.000Z',
               customerName: 'Alexander Hamil',
               customerPhone: '070 4345 7543',
               pickup: { address: '14, Biodun street, Lekki', lat: 6.4478, lng: 3.4721 },
               delivery: { address: '14, Biodun street, Lekki', lat: 6.4478, lng: 3.4721 },
            },
         },
      },
   })
   getDashboard(@Req() req: Request) {
      return this.svc.getDashboard(this.userId(req));
   }

   // ─── AVAILABILITY TOGGLE ────────────────────────────────────────────────
   @Patch('availability')
   @ApiOperation({ summary: 'Toggle Online/Offline availability', description: 'Controls the "AVAILABILITY" switch on the dashboard.' })
   setAvailability(@Body() dto: SetAvailabilityDto, @Req() req: Request) {
      return this.svc.setAvailability(this.userId(req), dto.isAvailable);
   }

   // ─── DELIVERIES LIST (Images 1 & 2 — Total/Pending/Completed/Failed tabs) ─
   @Get('deliveries')
   @ApiOperation({
      summary: 'List deliveries by tab (Total/Pending/Completed/Failed)',
      description:
         'Powers the "Deliveries / Metrics" screen. Filter by `filter` (all/pending/in_transit/completed/failed), search by ID or customer, and sort by distance (pass `lat`/`lng`) or ETA.',
   })
   @ApiResponse({
      status: 200,
      schema: {
         example: {
            page: 1,
            limit: 20,
            total: 3,
            totalPages: 1,
            items: [
               {
                  id: 'shp_123',
                  orderId: 'SHP-2026-53678',
                  status: 'IN_TRANSIT',
                  eta: '2026-07-10T15:30:00.000Z',
                  customerName: 'Alexander Hamil',
                  customerPhone: '070 4345 7543',
                  pickup: { address: '14, Biodun street, Lekki', lat: 6.4478, lng: 3.4721 },
                  delivery: { address: '14, Biodun street, Lekki', lat: 6.4478, lng: 3.4721 },
                  failureReason: null,
                  canStart: false,
                  canComplete: true,
                  canRetry: false,
               },
            ],
         },
      },
   })
   listDeliveries(@Query() query: ListDeliveriesQueryDto, @Req() req: Request) {
      return this.svc.listDeliveries(this.userId(req), query);
   }

   // ─── CURRENT DELIVERY ───────────────────────────────────────────────────
   @Get('deliveries/current')
   @ApiOperation({
      summary: 'Get the active current delivery',
      description: 'Returns the in-progress delivery assigned to the driver, or `empty: true` when there is none (matches the "Empty" state in the design).',
   })
   getCurrentDelivery(@Req() req: Request) {
      return this.svc.getCurrentDelivery(this.userId(req));
   }

   // ─── START DELIVERY ─────────────────────────────────────────────────────
   @Post('deliveries/:id/start')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Start a pending delivery',
      description: 'Powers the "Start Delivery" button on a Pending card — moves the delivery to In Transit and generates the customer\'s 4-digit delivery confirmation code.',
   })
   startDelivery(@Param('id') id: string, @Req() req: Request) {
      return this.svc.startDelivery(this.userId(req), id);
   }

   // ─── CANCEL / FAIL DELIVERY ─────────────────────────────────────────────
   @Post('deliveries/:id/cancel')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Cancel / fail the current delivery',
      description: 'Powers the red "Cancel Delivery" button — marks the delivery as Failed with a reason (e.g. "Rider denied entry"), shown on the "Failed deliveries" tab.',
   })
   cancelDelivery(@Param('id') id: string, @Body() dto: CancelDeliveryDto, @Req() req: Request) {
      return this.svc.cancelDelivery(this.userId(req), id, dto);
   }

   // ─── RETRY TASK ──────────────────────────────────────────────────────────
   @Post('deliveries/:id/retry')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({ summary: 'Retry a failed delivery', description: 'Powers the "Retry Task" button on a Failed card — moves the delivery back to In Transit.' })
   retryDelivery(@Param('id') id: string, @Req() req: Request) {
      return this.svc.retryDelivery(this.userId(req), id);
   }

   // ─── COMPLETED DELIVERY FLOW (Image 3) ──────────────────────────────────
   @Post('deliveries/:id/proof-photo')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({ summary: 'Upload proof-of-delivery photo', description: 'Powers the "Take Photo" step.' })
   @ApiConsumes('multipart/form-data')
   @ApiBody({
      schema: {
         type: 'object',
         properties: { photo: { type: 'string', format: 'binary', description: 'Proof-of-delivery photo (JPEG, PNG, or WebP, max 5MB)' } },
         required: ['photo'],
      },
   })
   @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage(), fileFilter: imageFileFilter, limits: { fileSize: 5 * 1024 * 1024 } }))
   uploadProofPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request) {
      return this.svc.uploadProofPhoto(this.userId(req), id, file);
   }

   @Post('deliveries/:id/confirm-code')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({ summary: 'Confirm the delivery code', description: 'Powers the "Confirm Code" step — validates the 4-digit code against the one generated when the delivery started.' })
   confirmCode(@Param('id') id: string, @Body() dto: ConfirmCodeDto, @Req() req: Request) {
      return this.svc.confirmCode(this.userId(req), id, dto);
   }

   @Post('deliveries/:id/signature')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Submit customer signature and complete the delivery',
      description: 'Powers the "Signature" step. Requires the proof photo and code to already be confirmed. Marks the shipment Delivered, credits the driver\'s wallet, and returns the "Delivery Completed!" payload.',
   })
   @ApiConsumes('multipart/form-data')
   @ApiBody({
      schema: {
         type: 'object',
         properties: { signature: { type: 'string', format: 'binary', description: 'Signature image captured on the signature pad' } },
         required: ['signature'],
      },
   })
   @UseInterceptors(FileInterceptor('signature', { storage: memoryStorage(), fileFilter: imageFileFilter, limits: { fileSize: 5 * 1024 * 1024 } }))
   submitSignature(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request) {
      return this.svc.submitSignature(this.userId(req), id, file);
   }

   // ─── NAVIGATION (Image 3) ───────────────────────────────────────────────
   @Get('deliveries/:id/navigation')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Get turn-by-turn navigation for a delivery',
      description:
         'Returns ETA, distance, and the next driving instruction from the driver current position to the pickup (if en route) or drop-off (if picked up). Optionally pass `lat`/`lng` to report a fresh position, which is also saved to the shipment.',
   })
   @ApiResponse({
      status: 200,
      schema: {
         example: {
            destinationLabel: 'Next Drop-off',
            destinationAddress: '14, Biodun street, Lekki',
            distance: '90m',
            etaText: '20 MINS',
            etaMinutes: 20,
            nextInstruction: 'Turn right to Salami street',
            nextInstructionDistance: '90m',
            polyline: null,
            origin: { lat: 6.5095, lng: 3.3711 },
            destination: { lat: 6.4478, lng: 3.4721 },
            provider: 'ESTIMATE',
         },
      },
   })
   getNavigation(@Param('id') id: string, @Query() query: NavigationQueryDto, @Req() req: Request) {
      return this.svc.getNavigation(this.userId(req), id, query);
   }

   // ─── DELIVERY DETAIL (Image 2 "Delivery detail" screen) ─────────────────
   @Get('deliveries/:id')
   @ApiParam({ name: 'id', description: 'Shipment ID' })
   @ApiOperation({
      summary: 'Get full delivery detail',
      description: 'Returns the same fields as the list, plus proof-of-delivery (photo/code/signature) and failure detail for the "View Details" screen.',
   })
   getDeliveryDetail(@Param('id') id: string, @Req() req: Request) {
      return this.svc.getDeliveryDetail(this.userId(req), id);
   }

   // ─── WALLET (Image 2) ───────────────────────────────────────────────────
   @Get('wallet')
   @ApiOperation({ summary: 'Get wallet balance and default withdrawal bank account' })
   getWallet(@Req() req: Request) {
      return this.svc.getWallet(this.userId(req));
   }

   @Get('wallet/bank-accounts')
   @ApiOperation({ summary: 'List saved withdrawal bank accounts' })
   listBankAccounts(@Req() req: Request) {
      return this.svc.listBankAccounts(this.userId(req));
   }

   @Post('wallet/bank-account')
   @ApiOperation({
      summary: 'Set/update the withdrawal bank account',
      description: 'Powers the "Set BankAccount" action shown when the wallet has no account on file yet. Saving a new account makes it the default.',
   })
   setBankAccount(@Body() dto: SetBankAccountDto, @Req() req: Request) {
      return this.svc.setBankAccount(this.userId(req), dto);
   }

   @Post('wallet/withdraw')
   @ApiOperation({
      summary: 'Withdraw funds',
      description: 'Withdraws `amount` from the available wallet balance to the default (or specified) bank account. Applies the flat withdrawal fee shown on the wallet screen.',
   })
   withdraw(@Body() dto: WithdrawFundsDto, @Req() req: Request) {
      return this.svc.withdraw(this.userId(req), dto);
   }

   @Get('wallet/withdrawals')
   @ApiOperation({ summary: 'List past withdrawal requests' })
   listWithdrawals(@Req() req: Request) {
      return this.svc.listWithdrawals(this.userId(req));
   }

   @Get('wallet/statement')
   @ApiOperation({
      summary: 'Generate an earnings/withdrawal statement',
      description: 'Powers the "Generate Statement" button — returns earnings and withdrawal transactions for the given period (defaults to the last 30 days).',
   })
   getStatement(@Query() query: StatementQueryDto, @Req() req: Request) {
      return this.svc.getStatement(this.userId(req), query);
   }
}
