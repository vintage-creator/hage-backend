-- Step 0: Drop defaults temporarily
ALTER TABLE "Shipment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ShipmentStatusHistory" ALTER COLUMN "status" DROP DEFAULT;

-- Step 1: Create temporary enum including old + new values
CREATE TYPE "ShipmentStatus_tmp" AS ENUM (
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'EN_ROUTE_TO_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_AT_DESTINATION',
  'COMPLETED',
  'CANCELLED',
  'NEW_ORDER',
  'PENDING',
  'IN_WAREHOUSE'
);

-- Step 2: Alter columns to use temporary enum
ALTER TABLE "Shipment" ALTER COLUMN "status" TYPE "ShipmentStatus_tmp"
  USING "status"::text::"ShipmentStatus_tmp";

ALTER TABLE "ShipmentStatusHistory" ALTER COLUMN "status" TYPE "ShipmentStatus_tmp"
  USING "status"::text::"ShipmentStatus_tmp";

-- Step 3: Map old values to new simplified statuses
UPDATE "Shipment" SET status = 'NEW_ORDER'
  WHERE status IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'PICKED_UP', 'CANCELLED');

UPDATE "Shipment" SET status = 'PENDING'
  WHERE status = 'IN_TRANSIT';

UPDATE "Shipment" SET status = 'IN_WAREHOUSE'
  WHERE status IN ('ARRIVED_AT_DESTINATION', 'COMPLETED');

UPDATE "ShipmentStatusHistory" SET status = 'NEW_ORDER'
  WHERE status IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'PICKED_UP', 'CANCELLED');

UPDATE "ShipmentStatusHistory" SET status = 'PENDING'
  WHERE status = 'IN_TRANSIT';

UPDATE "ShipmentStatusHistory" SET status = 'IN_WAREHOUSE'
  WHERE status IN ('ARRIVED_AT_DESTINATION', 'COMPLETED');

-- Step 4: Drop old enum (no more dependencies now)
DROP TYPE "ShipmentStatus";

-- Step 5: Create new enum
CREATE TYPE "ShipmentStatus" AS ENUM (
  'NEW_ORDER',
  'PENDING',
  'IN_WAREHOUSE'
);

-- Step 6: Alter columns to use new enum
ALTER TABLE "Shipment" ALTER COLUMN "status" TYPE "ShipmentStatus"
  USING "status"::text::"ShipmentStatus";

ALTER TABLE "ShipmentStatusHistory" ALTER COLUMN "status" TYPE "ShipmentStatus"
  USING "status"::text::"ShipmentStatus";

-- Step 7: Restore defaults
ALTER TABLE "Shipment" ALTER COLUMN "status" SET DEFAULT 'NEW_ORDER';
ALTER TABLE "ShipmentStatusHistory" ALTER COLUMN "status" SET DEFAULT 'NEW_ORDER';
