-- ============================================================
-- Migration: add_last_mile_wallet
-- Adds driver availability/wallet fields, and the DriverEarning /
-- Withdrawal tables that power the LAST_MILE_DELIVERY dashboard,
-- wallet, and withdrawal screens.
-- Run this against your Render PostgreSQL database.
-- ============================================================

-- 1. New enums
CREATE TYPE "DriverEarningStatus" AS ENUM ('PENDING', 'AVAILABLE', 'WITHDRAWN');
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- 2. Driver availability + wallet fields on User
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "isAvailable"   BOOLEAN          NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "walletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 3. Default withdrawal bank account flag on PaymentMethod
ALTER TABLE "PaymentMethod"
    ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- 4. DriverEarning table
CREATE TABLE IF NOT EXISTS "DriverEarning" (
    "id"         TEXT                  NOT NULL,
    "driverId"   TEXT                  NOT NULL,
    "shipmentId" TEXT                  NOT NULL,
    "amount"     DOUBLE PRECISION      NOT NULL,
    "status"     "DriverEarningStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt"  TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)          NOT NULL,
    CONSTRAINT "DriverEarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriverEarning_shipmentId_key" ON "DriverEarning"("shipmentId");
CREATE INDEX IF NOT EXISTS "DriverEarning_driverId_idx" ON "DriverEarning"("driverId");
CREATE INDEX IF NOT EXISTS "DriverEarning_status_idx" ON "DriverEarning"("status");

ALTER TABLE "DriverEarning"
    ADD CONSTRAINT "DriverEarning_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "DriverEarning_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Withdrawal table
CREATE TABLE IF NOT EXISTS "Withdrawal" (
    "id"                 TEXT               NOT NULL,
    "userId"             TEXT               NOT NULL,
    "amount"             DOUBLE PRECISION   NOT NULL,
    "fee"                DOUBLE PRECISION   NOT NULL DEFAULT 0,
    "netAmount"          DOUBLE PRECISION   NOT NULL,
    "bankAccountId"      TEXT,
    "bankName"           TEXT,
    "accountName"        TEXT,
    "accountNumberLast4" TEXT,
    "status"             "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "reference"          TEXT               NOT NULL,
    "failureReason"      TEXT,
    "createdAt"          TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt"        TIMESTAMP(3),
    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Withdrawal_reference_key" ON "Withdrawal"("reference");
CREATE INDEX IF NOT EXISTS "Withdrawal_userId_idx" ON "Withdrawal"("userId");
CREATE INDEX IF NOT EXISTS "Withdrawal_status_idx" ON "Withdrawal"("status");

ALTER TABLE "Withdrawal"
    ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Withdrawal_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
