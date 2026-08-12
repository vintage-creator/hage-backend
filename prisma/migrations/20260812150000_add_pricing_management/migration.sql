-- ============================================================
-- Migration: add_pricing_management
-- Adds enterprise pricing management: a PricingRule per lane
-- (origin, destination, vehicle type, currency, service level)
-- with one or more PricingTier tonnage/price bands. Powers the
-- "Pricing Info" settings screen and the shipment fee endpoint.
-- ============================================================

-- 1. PricingRule table
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "serviceLevel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- 2. PricingTier table (tonnage bands belonging to a PricingRule)
CREATE TABLE "PricingTier" (
    "id" TEXT NOT NULL,
    "pricingRuleId" TEXT NOT NULL,
    "fromTons" DOUBLE PRECISION NOT NULL,
    "toTons" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingTier_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes
CREATE INDEX "PricingRule_companyId_idx" ON "PricingRule"("companyId");
CREATE INDEX "PricingRule_origin_destination_vehicleType_serviceLevel_idx" ON "PricingRule"("origin", "destination", "vehicleType", "serviceLevel");
CREATE INDEX "PricingTier_pricingRuleId_idx" ON "PricingTier"("pricingRuleId");

-- 4. Foreign keys
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingTier" ADD CONSTRAINT "PricingTier_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
