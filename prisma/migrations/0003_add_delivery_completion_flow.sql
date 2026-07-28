-- ============================================================
-- Migration: add_delivery_completion_flow
-- Adds the driver-facing delivery completion flow: FAILED status,
-- proof-of-photo / confirmation-code / signature fields, and
-- failure-reason tracking on Shipment. Powers the "Deliveries",
-- "Metrics", and "Completed delivery" (Take Photo / Confirm Code /
-- Signature) screens.
-- Run this against your Render PostgreSQL database.
-- ============================================================

-- 1. New ShipmentStatus value (driver-side delivery failure,
--    distinct from an upstream CANCELLED shipment)
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- 2. New DocumentType values for the audit-trail copies of the
--    proof-of-delivery photo / signature stored in ShipmentDocument
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROOF_OF_DELIVERY';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SIGNATURE';

-- 3. Delivery completion + failure fields on Shipment
ALTER TABLE "Shipment"
    ADD COLUMN IF NOT EXISTS "deliveryCode"    TEXT,
    ADD COLUMN IF NOT EXISTS "proofPhotoUrl"   TEXT,
    ADD COLUMN IF NOT EXISTS "codeConfirmedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "signatureUrl"    TEXT,
    ADD COLUMN IF NOT EXISTS "deliveredAt"     TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "failureReason"   TEXT,
    ADD COLUMN IF NOT EXISTS "failedAt"        TIMESTAMP(3);
