import { Router, type Request, type Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { Decimal, toMoney, toQuantity, formatMoney, formatQuantity } from '@erp/business-rules';
import type { StockOwnershipType } from '@erp/shared-types';
import { cleanupOrphanItems } from '../items/items.routes.js';

const router = Router();

// Batches List with filters
router.get('/batches', async (req: Request, res: Response) => {
  const { itemId, ownershipType, supplierId, status } = req.query;

  const whereClause: Record<string, unknown> = {};
  if (itemId) whereClause.itemId = BigInt(itemId as string);
  if (ownershipType) whereClause.ownershipType = ownershipType as StockOwnershipType;
  if (supplierId) whereClause.supplierId = BigInt(supplierId as string);
  if (status) whereClause.status = status as string;

  const batches = await prisma.stockBatch.findMany({
    where: whereClause,
    include: {
      item: { include: { baseUnit: true } },
      supplier: true,
    },
    orderBy: [{ receivedDate: 'asc' }, { id: 'asc' }],
  });

  return res.json({ success: true, data: batches });
});

// Central Inventory Summary (Item-wise, Ownership-wise, Valuation)
router.get('/summary', async (_req: Request, res: Response) => {
  await cleanupOrphanItems();

  const items = await prisma.item.findMany({
    where: { isActive: true },
    include: {
      baseUnit: true,
      category: true,
      stockBatches: {
        where: { remainingBaseQty: { gt: 0 } },
        include: { supplier: true },
      },
      openingStockItems: {
        select: { baseQuantity: true },
      },
      purchaseInvoiceItems: {
        select: { baseQuantity: true },
      },
      salesInvoiceItems: {
        where: { ownershipType: 'OWN' },
        select: { baseQuantity: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const summary = items.map((item) => {
    let ownStockBaseQty = new Decimal(0);
    let ownStockValuation = new Decimal(0);
    let consignmentStockBaseQty = new Decimal(0);

    const supplierConsignmentMap: Record<string, { supplierName: string; baseQty: Decimal }> = {};

    for (const batch of item.stockBatches) {
      const remaining = toQuantity(batch.remainingBaseQty);
      if (batch.ownershipType === 'OWN') {
        ownStockBaseQty = ownStockBaseQty.plus(remaining);
        const cost = toMoney(batch.unitCost);
        ownStockValuation = ownStockValuation.plus(remaining.times(cost));
      } else {
        consignmentStockBaseQty = consignmentStockBaseQty.plus(remaining);
        const suppKey = batch.supplierId ? batch.supplierId.toString() : 'UNKNOWN';
        const suppName = batch.supplier?.name || 'Unassigned Supplier';
        if (!supplierConsignmentMap[suppKey]) {
          supplierConsignmentMap[suppKey] = { supplierName: suppName, baseQty: new Decimal(0) };
        }
        supplierConsignmentMap[suppKey].baseQty = supplierConsignmentMap[suppKey].baseQty.plus(remaining);
      }
    }

    const totalPhysicalBaseQty = ownStockBaseQty.plus(consignmentStockBaseQty);

    const openingQty = item.openingStockItems.reduce((acc, it) => acc.plus(toQuantity(it.baseQuantity)), new Decimal(0));
    const purchasedQty = item.purchaseInvoiceItems.reduce((acc, it) => acc.plus(toQuantity(it.baseQuantity)), new Decimal(0));
    const soldOwnQty = item.salesInvoiceItems.reduce((acc, it) => acc.plus(toQuantity(it.baseQuantity)), new Decimal(0));

    return {
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      categoryName: item.category.name,
      baseUnit: item.baseUnit.name,
      totalPhysicalBaseQty: formatQuantity(totalPhysicalBaseQty),
      ownStockBaseQty: formatQuantity(ownStockBaseQty),
      consignmentStockBaseQty: formatQuantity(consignmentStockBaseQty),
      ownStockValuation: formatMoney(ownStockValuation),
      openingQty: formatQuantity(openingQty),
      purchasedQty: formatQuantity(purchasedQty),
      soldOwnQty: formatQuantity(soldOwnQty),
      supplierConsignmentBreakdown: Object.entries(supplierConsignmentMap).map(([suppId, val]) => ({
        supplierId: suppId,
        supplierName: val.supplierName,
        baseQty: formatQuantity(val.baseQty),
      })),
      activeBatchCount: item.stockBatches.length,
    };
  });

  return res.json({ success: true, data: summary });
});

// Consignment stock available for a specific supplier — used in Sale form
// Returns distinct items that have ACTIVE CONSIGNMENT batches for the given supplier
router.get('/consignment-stock', async (req: Request, res: Response) => {
  const { supplierId } = req.query;
  if (!supplierId) {
    return res.status(400).json({ success: false, message: 'supplierId query param is required' });
  }

  const batches = await prisma.stockBatch.findMany({
    where: {
      ownershipType: 'CONSIGNMENT',
      supplierId: BigInt(supplierId as string),
      remainingBaseQty: { gt: 0 },
      status: 'ACTIVE',
    },
    include: {
      item: {
        include: {
          baseUnit: true,
          conversions: { include: { unit: true } },
        },
      },
    },
    orderBy: [{ receivedDate: 'asc' }, { id: 'asc' }],
  });

  // Group by item — sum remaining qty per item
  const itemMap = new Map<string, {
    id: number;
    name: string;
    code: string;
    itemId: number;
    itemName: string;
    itemCode: string;
    baseUnit: { id: number; name: string };
    conversions: Array<{ unitId: number; unit: { id: number; name: string }; multiplierToBase: string }>;
    totalRemainingBaseQty: Decimal;
  }>();

  for (const batch of batches) {
    const key = batch.itemId.toString();
    const existing = itemMap.get(key);
    const remaining = new Decimal(batch.remainingBaseQty.toString());
    if (existing) {
      existing.totalRemainingBaseQty = existing.totalRemainingBaseQty.plus(remaining);
    } else {
      itemMap.set(key, {
        id: Number(batch.itemId),
        name: batch.item.name,
        code: batch.item.code,
        itemId: Number(batch.itemId),
        itemName: batch.item.name,
        itemCode: batch.item.code,
        baseUnit: { id: Number(batch.item.baseUnitId), name: batch.item.baseUnit.name },
        conversions: batch.item.conversions.map((c) => ({
          unitId: Number(c.unitId),
          unit: { id: Number(c.unit.id), name: c.unit.name },
          multiplierToBase: c.multiplierToBase.toString(),
        })),
        totalRemainingBaseQty: remaining,
      });
    }
  }

  const result = Array.from(itemMap.values()).map((v) => ({
    ...v,
    totalRemainingBaseQty: formatQuantity(v.totalRemainingBaseQty),
  }));

  return res.json({ success: true, data: result });
});

// Stock Movements Audit Ledger
router.get('/movements', async (req: Request, res: Response) => {
  const { itemId, batchId, limit } = req.query;
  const whereClause: Record<string, unknown> = {};
  if (itemId) whereClause.itemId = BigInt(itemId as string);
  if (batchId) whereClause.batchId = BigInt(batchId as string);

  const movements = await prisma.stockMovement.findMany({
    where: whereClause,
    include: {
      item: true,
      batch: true,
    },
    take: limit ? parseInt(limit as string, 10) : 100,
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ success: true, data: movements });
});

export const inventoryRoutes = router;
