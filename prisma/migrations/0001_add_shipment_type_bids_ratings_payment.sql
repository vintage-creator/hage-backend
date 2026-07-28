-- ============================================================
-- Migration: add_shipment_type_bids_ratings_payment
-- Run this against your Render PostgreSQL database.
-- ============================================================

-- 1. New enums
CREATE TYPE "ShipmentType" AS ENUM ('INLAND', 'CROSS_BORDER');
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'ASSIGNED');
CREATE TYPE "FreightType" AS ENUM ('SEA_FREIGHT', 'AIR_FREIGHT');
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- 2. Extend ShipmentStatus with new values
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'PICKED_UP';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 3. Add new columns to Shipment
ALTER TABLE "Shipment"
    ADD COLUMN IF NOT EXISTS "shipmentType"        "ShipmentType"   NOT NULL DEFAULT 'INLAND',
    ADD COLUMN IF NOT EXISTS "visibility"           "Visibility"     NOT NULL DEFAULT 'PUBLIC',
    ADD COLUMN IF NOT EXISTS "freightType"          "FreightType",
    ADD COLUMN IF NOT EXISTS "truckType"            TEXT,
    ADD COLUMN IF NOT EXISTS "truckSize"            TEXT,
    ADD COLUMN IF NOT EXISTS "destinationCountry"   TEXT,
    ADD COLUMN IF NOT EXISTS "customDocumentUrls"   TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "cargoDuty"            DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "nameOfItem"           TEXT,
    ADD COLUMN IF NOT EXISTS "customerName"         TEXT,
    ADD COLUMN IF NOT EXISTS "customerPhone"        TEXT,
    ADD COLUMN IF NOT EXISTS "additionalNote"       TEXT,
    ADD COLUMN IF NOT EXISTS "pickupTimeslot"       TEXT,
    ADD COLUMN IF NOT EXISTS "bookingOfficerPhone"  TEXT,
    ADD COLUMN IF NOT EXISTS "waybillUrl"           TEXT,
    ADD COLUMN IF NOT EXISTS "orderNumber"          TEXT,
    ADD COLUMN IF NOT EXISTS "transactionFee"       DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Shipment"
    ALTER COLUMN "tons"        SET DEFAULT 0,
    ALTER COLUMN "weight"      SET DEFAULT 0,
    ALTER COLUMN "baseFrieght" SET DEFAULT 0,
    ALTER COLUMN "handlingFee" SET DEFAULT 0,
    ALTER COLUMN "totalCost"   SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Shipment_shipmentType_idx" ON "Shipment"("shipmentType");
CREATE INDEX IF NOT EXISTS "Shipment_visibility_idx"   ON "Shipment"("visibility");

-- 4. TransporterBid table
CREATE TABLE IF NOT EXISTS "TransporterBid" (
    "id"            TEXT             NOT NULL,
    "shipmentId"    TEXT             NOT NULL,
    "transporterId" TEXT             NOT NULL,
    "price"         DOUBLE PRECISION NOT NULL,
    "status"        "BidStatus"      NOT NULL DEFAULT 'PENDING',
    "note"          TEXT,
    "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "TransporterBid_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TransporterBid" ADD CONSTRAINT "TransporterBid_shipmentId_transporterId_key" UNIQUE ("shipmentId", "transporterId");
CREATE INDEX IF NOT EXISTS "TransporterBid_shipmentId_idx"    ON "TransporterBid"("shipmentId");
CREATE INDEX IF NOT EXISTS "TransporterBid_transporterId_idx" ON "TransporterBid"("transporterId");
CREATE INDEX IF NOT EXISTS "TransporterBid_status_idx"        ON "TransporterBid"("status");
ALTER TABLE "TransporterBid"
    ADD CONSTRAINT "TransporterBid_shipmentId_fkey"    FOREIGN KEY ("shipmentId")    REFERENCES "Shipment"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "TransporterBid_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "User"("id");

-- 5. TransporterRating table
CREATE TABLE IF NOT EXISTS "TransporterRating" (
    "id"            TEXT         NOT NULL,
    "transporterId" TEXT         NOT NULL,
    "ratedById"     TEXT         NOT NULL,
    "shipmentId"    TEXT,
    "rating"        INTEGER      NOT NULL,
    "comment"       TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransporterRating_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TransporterRating_transporterId_idx" ON "TransporterRating"("transporterId");
CREATE INDEX IF NOT EXISTS "TransporterRating_ratedById_idx"     ON "TransporterRating"("ratedById");
CREATE INDEX IF NOT EXISTS "TransporterRating_shipmentId_idx"    ON "TransporterRating"("shipmentId");
ALTER TABLE "TransporterRating"
    ADD CONSTRAINT "TransporterRating_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "User"("id"),
    ADD CONSTRAINT "TransporterRating_ratedById_fkey"     FOREIGN KEY ("ratedById")     REFERENCES "User"("id");

-- 6. Payment table
CREATE TABLE IF NOT EXISTS "Payment" (
    "id"         TEXT             NOT NULL,
    "shipmentId" TEXT             NOT NULL,
    "userId"     TEXT             NOT NULL,
    "amount"     DOUBLE PRECISION NOT NULL,
    "currency"   TEXT             NOT NULL DEFAULT 'NGN',
    "provider"   TEXT             NOT NULL DEFAULT 'PAYSTACK',
    "reference"  TEXT             NOT NULL,
    "status"     TEXT             NOT NULL DEFAULT 'PENDING',
    "metadata"   JSONB,
    "paidAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shipmentId_key" UNIQUE ("shipmentId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reference_key"  UNIQUE ("reference");
CREATE INDEX IF NOT EXISTS "Payment_userId_idx"    ON "Payment"("userId");
CREATE INDEX IF NOT EXISTS "Payment_reference_idx" ON "Payment"("reference");
CREATE INDEX IF NOT EXISTS "Payment_status_idx"    ON "Payment"("status");
ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "Payment_userId_fkey"     FOREIGN KEY ("userId")     REFERENCES "User"("id");
