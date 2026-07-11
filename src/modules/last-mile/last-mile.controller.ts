import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
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

   // ─── CURRENT DELIVERY ───────────────────────────────────────────────────
   @Get('deliveries/current')
   @ApiOperation({
      summary: 'Get the active current delivery',
      description: 'Returns the in-progress delivery assigned to the driver, or `empty: true` when there is none (matches the "Empty" state in the design).',
   })
   getCurrentDelivery(@Req() req: Request) {
      return this.svc.getCurrentDelivery(this.userId(req));
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
