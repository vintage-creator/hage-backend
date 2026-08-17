import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePricingRuleDto, ListPricingRulesQueryDto, UpdatePricingRuleDto } from './dto/pricing.dto';

// Transporter's cut of the shipping fee (5%)
const TRANSPORTER_FEE_RATE = 0.05;

@Injectable()
export class PricingService {
   constructor(private readonly prisma: PrismaService) {}

   // ─────────────────────────────────────────────────────────────────────
   // HELPERS
   // ─────────────────────────────────────────────────────────────────────
   private async getUser(userId: string) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
      if (!user) throw new NotFoundException('User not found');
      return user;
   }

   /** Only enterprise users with a company profile can manage pricing. */
   private async ensureEnterprisePricingManager(userId: string) {
      const user = await this.getUser(userId);
      if (user.kind !== 'ENTERPRISE') throw new ForbiddenException('Pricing management is only available to enterprise users');
      if (!user.companyId) throw new BadRequestException('Enterprise company profile is required');
      return user;
   }

   private round2(value: number) {
      return Math.round(value * 100) / 100;
   }

   private normalize(value?: string | null) {
      return (value ?? '')
         .toString()
         .trim()
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, '');
   }

   private matches(a?: string | null, b?: string | null) {
      const na = this.normalize(a);
      const nb = this.normalize(b);
      if (!na || !nb) return false;
      return na === nb || na.includes(nb) || nb.includes(na);
   }

   private extractLocationKeys(loc: any): string[] {
      if (!loc || typeof loc !== 'object') return [];
      return [loc.state, loc.region, loc.country, loc.lga, loc.address].filter((v) => typeof v === 'string' && v.trim().length > 0);
   }

   private async assertRuleAccess(userId: string, rule: { companyId: string }) {
      const user = await this.getUser(userId);
      if (user.kind !== 'ENTERPRISE' || user.companyId !== rule.companyId) {
         throw new ForbiddenException('You do not have access to this pricing rule');
      }
   }

   private async assertShipmentAccess(userId: string, shipment: { createdBy: string; customerId: string; assignedTransporterId: string | null; creator?: { companyId: string | null } | null }) {
      const user = await this.getUser(userId);
      if (userId === shipment.createdBy || userId === shipment.customerId || userId === shipment.assignedTransporterId) return;
      if (user.companyId && user.companyId === shipment.creator?.companyId) return;
      throw new ForbiddenException('You do not have access to this shipment');
   }

   // ─────────────────────────────────────────────────────────────────────
   // CRUD — PRICING RULES
   // ─────────────────────────────────────────────────────────────────────
   async createRule(userId: string, dto: CreatePricingRuleDto) {
      const user = await this.ensureEnterprisePricingManager(userId);

      const sortedTiers = [...dto.tiers].sort((a, b) => a.fromTons - b.fromTons);
      for (const tier of sortedTiers) {
         if (tier.toTons < tier.fromTons) throw new BadRequestException('Each tier\'s toTons must be greater than or equal to fromTons');
      }

      return this.prisma.pricingRule.create({
         data: {
            companyId: user.companyId!,
            origin: dto.origin,
            destination: dto.destination,
            vehicleType: dto.vehicleType,
            currency: dto.currency ?? 'NGN',
            serviceLevel: dto.serviceLevel,
            isActive: dto.isActive ?? true,
            tiers: {
               create: sortedTiers.map((t) => ({ fromTons: t.fromTons, toTons: t.toTons, price: t.price })),
            },
         },
         include: { tiers: { orderBy: { fromTons: 'asc' } } },
      });
   }

   async listRules(userId: string, query: ListPricingRulesQueryDto) {
      const user = await this.ensureEnterprisePricingManager(userId);

      const rules = await this.prisma.pricingRule.findMany({
         where: { companyId: user.companyId! },
         include: { tiers: { orderBy: { fromTons: 'asc' } } },
         orderBy: { createdAt: 'desc' },
      });

      return rules.filter(
         (r: any) =>
            (!query.origin || this.matches(r.origin, query.origin)) &&
            (!query.destination || this.matches(r.destination, query.destination)) &&
            (!query.vehicleType || this.matches(r.vehicleType, query.vehicleType)),
      );
   }

   async getRule(userId: string, id: string) {
      const rule = await this.prisma.pricingRule.findUnique({ where: { id }, include: { tiers: { orderBy: { fromTons: 'asc' } } } });
      if (!rule) throw new NotFoundException('Pricing rule not found');
      await this.assertRuleAccess(userId, rule);
      return rule;
   }

   async updateRule(userId: string, id: string, dto: UpdatePricingRuleDto) {
      const rule = await this.prisma.pricingRule.findUnique({ where: { id } });
      if (!rule) throw new NotFoundException('Pricing rule not found');
      await this.assertRuleAccess(userId, rule);

      if (dto.tiers) {
         const sortedTiers = [...dto.tiers].sort((a, b) => a.fromTons - b.fromTons);
         for (const tier of sortedTiers) {
            if (tier.toTons < tier.fromTons) throw new BadRequestException('Each tier\'s toTons must be greater than or equal to fromTons');
         }

         await this.prisma.$transaction([
            this.prisma.pricingTier.deleteMany({ where: { pricingRuleId: id } }),
            this.prisma.pricingRule.update({
               where: { id },
               data: {
                  origin: dto.origin ?? undefined,
                  destination: dto.destination ?? undefined,
                  vehicleType: dto.vehicleType ?? undefined,
                  currency: dto.currency ?? undefined,
                  serviceLevel: dto.serviceLevel ?? undefined,
                  isActive: dto.isActive ?? undefined,
                  tiers: { create: sortedTiers.map((t) => ({ fromTons: t.fromTons, toTons: t.toTons, price: t.price })) },
               },
            }),
         ]);

         return this.getRule(userId, id);
      }

      return this.prisma.pricingRule.update({
         where: { id },
         data: {
            origin: dto.origin ?? undefined,
            destination: dto.destination ?? undefined,
            vehicleType: dto.vehicleType ?? undefined,
            currency: dto.currency ?? undefined,
            serviceLevel: dto.serviceLevel ?? undefined,
            isActive: dto.isActive ?? undefined,
         },
         include: { tiers: { orderBy: { fromTons: 'asc' } } },
      });
   }

   async deleteRule(userId: string, id: string) {
      const rule = await this.prisma.pricingRule.findUnique({ where: { id } });
      if (!rule) throw new NotFoundException('Pricing rule not found');
      await this.assertRuleAccess(userId, rule);
      await this.prisma.pricingRule.delete({ where: { id } });
      return { success: true };
   }

   // ─────────────────────────────────────────────────────────────────────
   // FEE CALCULATION — used when a shipment/order is created or viewed
   // ─────────────────────────────────────────────────────────────────────
   private findMatchingTier(tiers: { id: string; fromTons: number; toTons: number; price: number }[], tons: number) {
      if (!tiers.length) return null;
      const sorted = [...tiers].sort((a, b) => a.fromTons - b.fromTons);

      const inRange = sorted.find((t) => tons >= t.fromTons && tons <= t.toTons);
      if (inRange) return inRange;

      // Tons falls outside every band: extrapolate off the nearest band's per-ton rate
      // rather than than reject, e.g. a 0-5t/$500 band still prices a 10t shipment.
      const highest = sorted[sorted.length - 1];
      const lowest = sorted[0];
      if (tons > highest.toTons) return highest;
      return lowest;
   }

   private async findMatchingRule(companyId: string, origin: string[], destination: string[], vehicleType: string | null, serviceLevel: string | null) {
      const rules = await this.prisma.pricingRule.findMany({
         where: { companyId, isActive: true },
         include: { tiers: { orderBy: { fromTons: 'asc' } } },
         orderBy: { updatedAt: 'desc' },
      });

      const originMatch = (r: any) => origin.some((o) => this.matches(r.origin, o));
      const destinationMatch = (r: any) => destination.some((d) => this.matches(r.destination, d));
      const vehicleMatch = (r: any) => this.matches(r.vehicleType, vehicleType);
      const serviceMatch = (r: any) => this.matches(r.serviceLevel, serviceLevel);

      // Best match first: full match on all four fields, then progressively relax
      // serviceLevel, then vehicleType, since those are more likely to be labelled
      // slightly differently than the lane (origin/destination) is.
      const fullMatch = rules.find((r: any) => originMatch(r) && destinationMatch(r) && vehicleMatch(r) && serviceMatch(r));
      if (fullMatch) return fullMatch;

      const laneAndVehicle = rules.find((r: any) => originMatch(r) && destinationMatch(r) && vehicleMatch(r));
      if (laneAndVehicle) return laneAndVehicle;

      const laneOnly = rules.find((r: any) => originMatch(r) && destinationMatch(r));
      if (laneOnly) return laneOnly;

      return null;
   }

   /**
    * Computes the shipping fee (from the enterprise's price-per-tonnage config)
    * and the transporter fee (5% of the shipping fee) for a given shipment.
    */
   async getShipmentFees(userId: string, shipmentId: string) {
      const shipment = await this.prisma.shipment.findUnique({
         where: { id: shipmentId },
         include: { creator: { select: { id: true, companyId: true } } },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
      await this.assertShipmentAccess(userId, shipment as any);

      const companyId = shipment.creator?.companyId;
      if (!companyId) throw new BadRequestException('This shipment is not linked to an enterprise pricing account');

      const tons = Number(shipment.tons ?? 0);
      if (!tons || tons <= 0) throw new BadRequestException('Shipment has no tonnage recorded to price');

      const origin = this.extractLocationKeys(shipment.origin);
      const destination = this.extractLocationKeys(shipment.destination);

      const rule = await this.findMatchingRule(companyId, origin, destination, shipment.truckType, shipment.serviceType);
      if (!rule) {
         throw new NotFoundException('No pricing rule is configured for this shipment\'s origin, destination and vehicle type. Set one up under Pricing Info first.');
      }

      const tier = this.findMatchingTier(rule.tiers as any, tons);
      if (!tier) {
         throw new NotFoundException('No pricing tier is configured for this shipment\'s tonnage on the matched pricing rule.');
      }

      const ratePerTon = tier.price / tier.toTons;
      const shippingFee = this.round2(ratePerTon * tons);
      const transporterFee = this.round2(shippingFee * TRANSPORTER_FEE_RATE);

      return {
         shipmentId: shipment.id,
         orderId: shipment.orderId,
         tons,
         currency: rule.currency,
         pricingRuleId: rule.id,
         pricingTierId: tier.id,
         matchedLane: { origin: rule.origin, destination: rule.destination, vehicleType: rule.vehicleType, serviceLevel: rule.serviceLevel },
         ratePerTon: this.round2(ratePerTon),
         shippingCost: shippingFee,
         transporterFeeRate: TRANSPORTER_FEE_RATE,
         transactionFee: transporterFee,
      };
   }
}
