-- ============================================================
-- Migration: add_saved_transporter
-- Adds the enterprise "Add transporter" / "Saved transporter"
-- address book. Enterprises invite transporters by name, phone,
-- and email; once a matching transporter account exists it is
-- linked automatically.
-- Run this against your Render PostgreSQL database.
-- ============================================================

-- 1. Status enum for the saved-transporter relationship
DO $$ BEGIN
    CREATE TYPE "SavedTransporterStatus" AS ENUM ('INVITED', 'ACTIVE', 'DECLINED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. SavedTransporter table
CREATE TABLE IF NOT EXISTS "SavedTransporter" (
    "id"            TEXT NOT NULL,
    "ownerId"       TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "countryCode"   TEXT NOT NULL DEFAULT '+1',
    "phone"         TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "transporterId" TEXT,
    "status"        "SavedTransporterStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedTransporter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavedTransporter_ownerId_email_key" ON "SavedTransporter"("ownerId", "email");
CREATE INDEX IF NOT EXISTS "SavedTransporter_ownerId_idx" ON "SavedTransporter"("ownerId");
CREATE INDEX IF NOT EXISTS "SavedTransporter_transporterId_idx" ON "SavedTransporter"("transporterId");

ALTER TABLE "SavedTransporter"
    ADD CONSTRAINT "SavedTransporter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedTransporter"
    ADD CONSTRAINT "SavedTransporter_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
