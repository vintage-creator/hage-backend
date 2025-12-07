// src/modules/warehouses/helpers/warehouses.helpers.ts
import type { PrismaClient, Prisma } from "@prisma/client";
import { WarehouseStatus } from "@prisma/client";

/**
 * Return aggregated usage for a warehouse:
 * { used, reserved, usedPlusReserved }
 */
export async function getWarehouseUsage(
  prisma: PrismaClient | Prisma.TransactionClient,
  warehouseId: string
) {
  const agg = await (prisma as any).bin.aggregate({
    _sum: { currentQty: true, reservedQty: true },
    where: { rack: { zone: { warehouseId } } },
  });

  const used = Number(agg._sum?.currentQty ?? 0);
  const reserved = Number(agg._sum?.reservedQty ?? 0);
  return { used, reserved, usedPlusReserved: used + reserved };
}

/**
 * Recompute warehouse status and persist change if needed.
 * Uses the transaction client if provided.
 */
export async function refreshWarehouseStatus(
  prisma: PrismaClient | Prisma.TransactionClient,
  warehouseId: string
) {
  const wh = await (prisma as any).warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, totalCapacity: true, status: true },
  });
  if (!wh) return;

  const { used, reserved, usedPlusReserved } = await getWarehouseUsage(
    prisma,
    warehouseId
  );

  const newStatus =
    wh.totalCapacity > 0 && usedPlusReserved >= wh.totalCapacity
      ? WarehouseStatus.INACTIVE
      : WarehouseStatus.ACTIVE;

  if (newStatus !== wh.status) {
    await (prisma as any).warehouse.update({
      where: { id: warehouseId },
      data: { status: newStatus },
    });
  }
}
