import { Router, type Request, type Response } from 'express';
import { prisma, dbTx } from '../../database/prisma.js';
import { ItemCreateSchema } from '@erp/validation';
import { requireOwnerAuth } from '../../middleware/auth.js';
import { Decimal } from '@erp/business-rules';

const router = Router();

// Helper to cleanup unused / orphaned items that have no stock and no transaction history
export async function cleanupOrphanItems(): Promise<number> {
  try {
    const allItems = await prisma.item.findMany({
      select: { id: true, name: true, code: true },
    });

    let deleted = 0;
    for (const item of allItems) {
      const [batchCount, openingCount, purchaseCount, saleCount, consignmentCount] = await Promise.all([
        prisma.stockBatch.count({ where: { itemId: item.id } }),
        prisma.openingStockItem.count({ where: { itemId: item.id } }),
        prisma.purchaseInvoiceItem.count({ where: { itemId: item.id } }),
        prisma.salesInvoiceItem.count({ where: { itemId: item.id } }),
        prisma.consignmentReceiptItem.count({ where: { itemId: item.id } }),
      ]);

      if (
        batchCount === 0 &&
        openingCount === 0 &&
        purchaseCount === 0 &&
        saleCount === 0 &&
        consignmentCount === 0
      ) {
        await dbTx(async (tx) => {
          await tx.commissionAgreement.deleteMany({ where: { itemId: item.id } });
          await tx.itemUnitConversion.deleteMany({ where: { itemId: item.id } });
          await tx.stockMovement.deleteMany({ where: { itemId: item.id } });
          await tx.item.delete({ where: { id: item.id } });
        });
        deleted++;
      }
    }
    return deleted;
  } catch (err) {
    console.error('Error during auto-cleanup of orphan items:', err);
    return 0;
  }
}

// Units List
router.get('/units', async (_req: Request, res: Response) => {
  const units = await prisma.unit.findMany({
    orderBy: { isBaseUnit: 'desc' },
  });
  return res.json({ success: true, data: units });
});

// Categories List
router.get('/categories', async (_req: Request, res: Response) => {
  const categories = await prisma.itemCategory.findMany({
    orderBy: { name: 'asc' },
  });
  return res.json({ success: true, data: categories });
});

// Items List with conversions & stock summary (with auto-cleanup of orphans)
router.get('/', async (_req: Request, res: Response) => {
  await cleanupOrphanItems();

  const items = await prisma.item.findMany({
    where: { isActive: true },
    include: {
      category: true,
      baseUnit: true,
      conversions: {
        include: { unit: true },
      },
      stockBatches: {
        where: { remainingBaseQty: { gt: 0 } },
        select: {
          ownershipType: true,
          remainingBaseQty: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const [allUnits, mannSetting, bagSetting] = await Promise.all([
    prisma.unit.findMany(),
    prisma.appSettings.findUnique({ where: { settingKey: 'mann_default_kg' } }),
    prisma.appSettings.findUnique({ where: { settingKey: 'bag_default_kg' } }),
  ]);
  const mannUnit = allUnits.find((u) => u.code.toUpperCase() === 'MANN');
  const bagUnit = allUnits.find((u) => u.code.toUpperCase() === 'BAG');
  const mannMultiplier = mannSetting?.settingValue || '40';
  const bagMultiplier = bagSetting?.settingValue || '50';

  const enrichedItems = items.map((item) => {
    let ownStockRemaining = new Decimal(0);
    let consignmentStockRemaining = new Decimal(0);

    for (const batch of item.stockBatches) {
      const qty = new Decimal(batch.remainingBaseQty.toString());
      if (batch.ownershipType === 'OWN') {
        ownStockRemaining = ownStockRemaining.plus(qty);
      } else {
        consignmentStockRemaining = consignmentStockRemaining.plus(qty);
      }
    }

    const totalStockRemaining = ownStockRemaining.plus(consignmentStockRemaining);

    // Merge default MANN and BAG conversions if not present
    const itemConversions = [...item.conversions];
    if (mannUnit && item.baseUnitId !== mannUnit.id && !itemConversions.some((c) => c.unitId === mannUnit.id)) {
      itemConversions.push({
        id: BigInt(0),
        uuid: 'virtual-mann',
        itemId: item.id,
        unitId: mannUnit.id,
        multiplierToBase: new Decimal(mannMultiplier),
        createdAt: new Date(),
        updatedAt: new Date(),
        unit: mannUnit,
      } as any);
    }
    if (bagUnit && item.baseUnitId !== bagUnit.id && !itemConversions.some((c) => c.unitId === bagUnit.id)) {
      itemConversions.push({
        id: BigInt(0),
        uuid: 'virtual-bag',
        itemId: item.id,
        unitId: bagUnit.id,
        multiplierToBase: new Decimal(bagMultiplier),
        createdAt: new Date(),
        updatedAt: new Date(),
        unit: bagUnit,
      } as any);
    }

    return {
      ...item,
      conversions: itemConversions,
      ownStockRemaining: ownStockRemaining.toFixed(2),
      consignmentStockRemaining: consignmentStockRemaining.toFixed(2),
      totalStockRemaining: totalStockRemaining.toFixed(2),
    };
  });

  return res.json({ success: true, data: enrichedItems });
});

// Create Item & Conversions
router.post('/', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = ItemCreateSchema.parse(req.body);

  const item = await dbTx(async (tx) => {
    const newItem = await tx.item.create({
      data: {
        code: validated.code,
        name: validated.name,
        categoryId: BigInt(validated.categoryId),
        baseUnitId: BigInt(validated.baseUnitId),
        description: validated.description,
        minStockLevel: new Decimal(validated.minStockLevel),
        defaultSaleRate: validated.defaultSaleRate ? new Decimal(validated.defaultSaleRate) : null,
      },
    });

    const userConvs = validated.conversions || [];
    const convUnitIds = new Set(userConvs.map((c) => BigInt(c.unitId)));

    for (const conv of userConvs) {
      await tx.itemUnitConversion.create({
        data: {
          itemId: newItem.id,
          unitId: BigInt(conv.unitId),
          multiplierToBase: new Decimal(conv.multiplierToBase),
        },
      });
    }

    // Auto-create MANN and BAG if not explicitly passed
    const [mannUnit, bagUnit, mannSetting, bagSetting] = await Promise.all([
      tx.unit.findFirst({ where: { code: 'MANN' } }),
      tx.unit.findFirst({ where: { code: 'BAG' } }),
      tx.appSettings.findUnique({ where: { settingKey: 'mann_default_kg' } }),
      tx.appSettings.findUnique({ where: { settingKey: 'bag_default_kg' } }),
    ]);

    if (mannUnit && newItem.baseUnitId !== mannUnit.id && !convUnitIds.has(mannUnit.id)) {
      await tx.itemUnitConversion.create({
        data: {
          itemId: newItem.id,
          unitId: mannUnit.id,
          multiplierToBase: new Decimal(mannSetting?.settingValue || '40'),
        },
      });
    }

    if (bagUnit && newItem.baseUnitId !== bagUnit.id && !convUnitIds.has(bagUnit.id)) {
      await tx.itemUnitConversion.create({
        data: {
          itemId: newItem.id,
          unitId: bagUnit.id,
          multiplierToBase: new Decimal(bagSetting?.settingValue || '50'),
        },
      });
    }

    return newItem;
  });

  return res.status(201).json({ success: true, data: item });
});

// Update Item & Conversions
router.put('/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const itemId = BigInt(req.params.id);
  const { name, description, minStockLevel, defaultSaleRate, conversions } = req.body;

  const updated = await dbTx(async (tx) => {
    const item = await tx.item.update({
      where: { id: itemId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(minStockLevel !== undefined && { minStockLevel: new Decimal(minStockLevel) }),
        ...(defaultSaleRate !== undefined && {
          defaultSaleRate: defaultSaleRate ? new Decimal(defaultSaleRate) : null,
        }),
      },
    });

    if (conversions && Array.isArray(conversions)) {
      for (const conv of conversions) {
        if (conv.unitId && conv.multiplierToBase) {
          await tx.itemUnitConversion.upsert({
            where: {
              itemId_unitId: {
                itemId,
                unitId: BigInt(conv.unitId),
              },
            },
            update: {
              multiplierToBase: new Decimal(conv.multiplierToBase),
            },
            create: {
              itemId,
              unitId: BigInt(conv.unitId),
              multiplierToBase: new Decimal(conv.multiplierToBase),
            },
          });
        }
      }
    }

    return item;
  });

  return res.json({ success: true, data: updated });
});

// Cleanup unused / orphaned items that have no stock and no transaction history
router.post('/cleanup-orphans', requireOwnerAuth, async (_req: Request, res: Response) => {
  const allItems = await prisma.item.findMany({
    select: { id: true, name: true, code: true },
  });

  let deletedCount = 0;
  const deletedNames: string[] = [];

  for (const item of allItems) {
    const [batchCount, openingCount, purchaseCount, saleCount, consignmentCount] = await Promise.all([
      prisma.stockBatch.count({ where: { itemId: item.id } }),
      prisma.openingStockItem.count({ where: { itemId: item.id } }),
      prisma.purchaseInvoiceItem.count({ where: { itemId: item.id } }),
      prisma.salesInvoiceItem.count({ where: { itemId: item.id } }),
      prisma.consignmentReceiptItem.count({ where: { itemId: item.id } }),
    ]);

    if (
      batchCount === 0 &&
      openingCount === 0 &&
      purchaseCount === 0 &&
      saleCount === 0 &&
      consignmentCount === 0
    ) {
      await dbTx(async (tx) => {
        await tx.commissionAgreement.deleteMany({ where: { itemId: item.id } });
        await tx.itemUnitConversion.deleteMany({ where: { itemId: item.id } });
        await tx.stockMovement.deleteMany({ where: { itemId: item.id } });
        await tx.item.delete({ where: { id: item.id } });
      });
      deletedCount++;
      deletedNames.push(item.name);
    }
  }

  return res.json({
    success: true,
    deletedCount,
    deletedNames,
    message: deletedCount > 0
      ? `Cleaned up ${deletedCount} unused item(s): ${deletedNames.join(', ')}`
      : 'No unused items found to clean up.',
  });
});

// Delete Item
router.delete('/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const itemId = BigInt(req.params.id);

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      stockBatches: { select: { id: true }, take: 1 },
      purchaseInvoiceItems: { select: { id: true }, take: 1 },
      salesInvoiceItems: { select: { id: true }, take: 1 },
      openingStockItems: { select: { id: true }, take: 1 },
      consignmentReceiptItems: { select: { id: true }, take: 1 },
    },
  });

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found' });
  }

  const hasHistory =
    item.stockBatches.length > 0 ||
    item.purchaseInvoiceItems.length > 0 ||
    item.salesInvoiceItems.length > 0 ||
    item.openingStockItems.length > 0 ||
    item.consignmentReceiptItems.length > 0;

  if (hasHistory) {
    await prisma.item.update({
      where: { id: itemId },
      data: { isActive: false },
    });
    return res.json({
      success: true,
      message: `Item '${item.name}' has existing stock/transaction history and has been deactivated.`,
      deactivated: true,
    });
  }

  await dbTx(async (tx) => {
    await tx.commissionAgreement.deleteMany({ where: { itemId } });
    await tx.itemUnitConversion.deleteMany({ where: { itemId } });
    await tx.stockMovement.deleteMany({ where: { itemId } });
    await tx.item.delete({ where: { id: itemId } });
  });

  return res.json({ success: true, message: `Item '${item.name}' deleted successfully.` });
});

export const itemRoutes = router;
