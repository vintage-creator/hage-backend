import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto, ListPricingRulesQueryDto, UpdatePricingRuleDto } from './dto/pricing.dto';

@ApiTags('pricing')
@Controller('pricing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class PricingController {
   constructor(private readonly pricing: PricingService) {}

   private userId(req: Request) {
      return (req as any).user.sub;
   }

   @Post('rules')
   @ApiOperation({ summary: 'Create a pricing rule (origin, destination, vehicle type, currency, service level + tonnage price bands)' })
   @ApiResponse({ status: 201, description: 'Pricing rule created' })
   createRule(@Req() req: Request, @Body() dto: CreatePricingRuleDto) {
      return this.pricing.createRule(this.userId(req), dto);
   }

   @Get('rules')
   @ApiOperation({ summary: 'List pricing rules for the enterprise, optionally filtered by origin/destination/vehicle type' })
   listRules(@Req() req: Request, @Query() query: ListPricingRulesQueryDto) {
      return this.pricing.listRules(this.userId(req), query);
   }

   @Get('rules/:id')
   @ApiOperation({ summary: 'Get a single pricing rule' })
   getRule(@Req() req: Request, @Param('id') id: string) {
      return this.pricing.getRule(this.userId(req), id);
   }

   @Patch('rules/:id')
   @ApiOperation({ summary: 'Update a pricing rule. Sending `tiers` replaces all existing tonnage bands.' })
   updateRule(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePricingRuleDto) {
      return this.pricing.updateRule(this.userId(req), id, dto);
   }

   @Delete('rules/:id')
   @ApiOperation({ summary: 'Delete a pricing rule' })
   deleteRule(@Req() req: Request, @Param('id') id: string) {
      return this.pricing.deleteRule(this.userId(req), id);
   }

   @Get('shipments/:shipmentId/fees')
   @ApiOperation({
      summary: 'Get the shipping fee and transporter fee for a shipment',
      description:
         'Looks up the enterprise pricing rule matching the shipment\'s origin, destination, vehicle type and service level, ' +
         'computes the shipping fee from the configured tonnage price bands, and returns the transporter fee as 5% of the shipping fee.',
   })
   @ApiResponse({ status: 200, description: 'Shipping fee and transporter fee for the shipment' })
   getShipmentFees(@Req() req: Request, @Param('shipmentId') shipmentId: string) {
      return this.pricing.getShipmentFees(this.userId(req), shipmentId);
   }
}
