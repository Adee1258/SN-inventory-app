import { Router, type Request, type Response } from 'express';
import { prisma, dbTx } from '../../database/prisma.js';
import { OpeningStockCreateSchema } from '@erp/validation';
import { requireOwnerAuth } from '../../middleware/auth.js';
import { calculateBaseQuantity, Decimal, toMoney, toQuantity } from '@erp/business-rules';
import { createBalancedJournalEntry } from '../../accounting/posting-engine.js';

const router = Router();

// List Opening Stock Entries with live batch remaining quantities
router.get('/', async (_req: Request, res: Response) => {
  const entries = await prisma.openingStockEntry.findMany({
    include: {
      items: {
        include: {
          item: true,
          supplier: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: { entryDate: 'desc' },
  });

  // Attach live batch remaining quantity and sold quantity
  const enrichedEntries = await Promise.all(
    entries.map(async (entry) => {
      const itemsWithBatch = await Promise.all(
        entry.items.map(async (it) => {
          const batch = await prisma.stockBatch.findFirst({
            where: {
              sourceType: 'OPENING',
              sourceDocumentId: entry.id,
              itemId: it.itemId,
              batchNumber: it.batchNumber,
            },
            select: {
              remainingBaseQty: true,
              initialBaseQty: true,
              status: true,
            },
          });
          const remainingBaseQty = batch ? batch.remainingBaseQty.toString() : it.enteredQuantity.toString();
          const initialQty = parseFloat(it.enteredQuantity.toString()) || 0;
          const remQty = parseFloat(remainingBaseQty) || 0;
          const soldQty = Math.max(0, initialQty - remQty);

          return {
            ...it,
            remainingQuantity: remQty.toFixed(2),
            soldQuantity: soldQty.toFixed(2),
            batchStatus: batch?.status ?? (remQty <= 0 ? 'EXHAUSTED' : 'ACTIVE'),
          };
        })
      );
      return {
        ...entry,
        items: itemsWithBatch,
      };
    })
  );

  return res.json({ success: true, data: enrichedEntries });
});

// Create Opening Stock Entry
router.post('/', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = OpeningStockCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    // Generate Sequence
    const seq = await tx.documentSequence.upsert({
      where: { sequenceType: 'OPENING_STOCK' },
      update: { currentNumber: { increment: 1 } },
      create: { sequenceType: 'OPENING_STOCK', prefix: 'OP-', currentNumber: BigInt(1), paddingLength: 5 },
    });
    const entryNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;

    const openingEntry = await tx.openingStockEntry.create({
      data: {
        entryNumber,
        entryDate: new Date(validated.entryDate),
        notes: validated.notes,
        isFinalized: true,
      },
    });

    let totalOwnOpeningValuation = new Decimal(0);

    for (const itemInput of validated.items) {
      // Find unit conversion
      const item = await tx.item.findUnique({
        where: { id: BigInt(itemInput.itemId) },
        include: { baseUnit: true, conversions: { include: { unit: true } } },
      });
      if (!item) throw new Error(`Item ID ${itemInput.itemId} not found`);

      let multiplier = new Decimal(1);
      let unitName = item.baseUnit.name;

      if (BigInt(itemInput.unitId) !== item.baseUnitId) {
        const conv = item.conversions.find((c) => c.unitId === BigInt(itemInput.unitId));
        if (conv) {
          multiplier = new Decimal(conv.multiplierToBase);
          unitName = conv.unit.name;
        } else {
          const targetUnit = await tx.unit.findUnique({ where: { id: BigInt(itemInput.unitId) } });
          if (!targetUnit) throw new Error(`Unit ID ${itemInput.unitId} not found`);
          unitName = targetUnit.name;
          const uCode = targetUnit.code.toUpperCase();
          if (uCode === 'MANN') {
            const row = await tx.appSettings.findUnique({ where: { settingKey: 'mann_default_kg' } });
            multiplier = new Decimal(row?.settingValue || '40');
          } else if (uCode === 'BAG') {
            const row = await tx.appSettings.findUnique({ where: { settingKey: 'bag_default_kg' } });
            multiplier = new Decimal(row?.settingValue || '50');
          } else {
            throw new Error(`Conversion not configured for item ${item.name} and unit ID ${itemInput.unitId}`);
          }
        }
      }

      const conversion = calculateBaseQuantity(itemInput.enteredQuantity, multiplier, item.baseUnit.name);
      const baseQtyDec = toQuantity(conversion.baseQuantity);
      const unitCostDec = itemInput.ownershipType === 'OWN' ? toMoney(itemInput.unitCost) : new Decimal(0);
      const extraChargesDec = toMoney(itemInput.extraCharges ?? '0.0000');
      // Landed unit cost = purchase rate + (extra charges spread per base unit)
      const landedUnitCost = baseQtyDec.greaterThan(0)
        ? unitCostDec.plus(extraChargesDec.div(baseQtyDec))
        : unitCostDec;

      // Save Opening Item Line
      await tx.openingStockItem.create({
        data: {
          openingStockEntryId: openingEntry.id,
          itemId: item.id,
          ownershipType: itemInput.ownershipType,
          supplierId: itemInput.supplierId ? BigInt(itemInput.supplierId) : null,
          enteredQuantity: toQuantity(itemInput.enteredQuantity),
          enteredUnitName: unitName,
          conversionFactorSnap: new Decimal(conversion.multiplierToBase),
          baseQuantity: baseQtyDec,
          baseUnitName: conversion.baseUnit,
          unitCost: unitCostDec,
          referenceValuation: itemInput.referenceValuation ? toMoney(itemInput.referenceValuation) : null,
          batchNumber: itemInput.batchNumber,
          notes: [
            itemInput.paymentType ? `Payment: ${itemInput.paymentType}` : '',
            itemInput.extraCharges && parseFloat(itemInput.extraCharges) > 0
              ? `Extra Charges: Rs.${itemInput.extraCharges}${itemInput.extraChargesNote ? ` (${itemInput.extraChargesNote})` : ''}`
              : '',
            itemInput.notes ?? '',
          ].filter(Boolean).join(' | ') || null,
        },
      });

      // Create Central Stock Batch
      const batch = await tx.stockBatch.create({
        data: {
          batchNumber: itemInput.batchNumber,
          itemId: item.id,
          ownershipType: itemInput.ownershipType,
          sourceType: 'OPENING',
          sourceDocumentId: openingEntry.id,
          supplierId: itemInput.supplierId ? BigInt(itemInput.supplierId) : null,
          receivedDate: new Date(validated.entryDate),
          initialBaseQty: baseQtyDec,
          remainingBaseQty: baseQtyDec,
          baseUnitName: conversion.baseUnit,
          unitCost: landedUnitCost,  // landed cost (includes extra charges)
          referenceValuation: itemInput.referenceValuation ? toMoney(itemInput.referenceValuation) : null,
          status: 'ACTIVE',
        },
      });

      // Create Stock Movement Audit
      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          itemId: item.id,
          ownershipType: itemInput.ownershipType,
          supplierId: itemInput.supplierId ? BigInt(itemInput.supplierId) : null,
          movementType: 'OPENING',
          enteredQuantity: toQuantity(itemInput.enteredQuantity),
          enteredUnitName: unitName,
          conversionFactorSnap: new Decimal(conversion.multiplierToBase),
          baseQuantity: baseQtyDec,
          baseUnitName: conversion.baseUnit,
          referenceType: 'OPENING_STOCK',
          referenceId: openingEntry.id,
          referenceNumber: entryNumber,
          movementDate: new Date(validated.entryDate),
        },
      });

      // If entered on CREDIT with a supplier, increase supplier payable
      if (itemInput.paymentType === 'CREDIT' && itemInput.supplierId) {
        const linePayable = baseQtyDec.times(unitCostDec).plus(extraChargesDec);
        if (linePayable.greaterThan(0)) {
          await tx.supplier.update({
            where: { id: BigInt(itemInput.supplierId) },
            data: {
              currentBalanceOwn: { increment: linePayable },
            },
          });
        }
      }

      if (itemInput.ownershipType === 'OWN') {
        const lineTotal = baseQtyDec.times(landedUnitCost);
        totalOwnOpeningValuation = totalOwnOpeningValuation.plus(lineTotal);
      }
    }

    // If own-stock valuation > 0, post Opening Journal Entry
    if (totalOwnOpeningValuation.greaterThan(0)) {
      await createBalancedJournalEntry({
        tx,
        entryDate: validated.entryDate,
        referenceType: 'OPENING_STOCK',
        referenceId: openingEntry.id,
        referenceNumber: entryNumber,
        narration: `Opening inventory asset valuation for entry ${entryNumber}`,
        lines: [
          {
            accountCode: '1040', // Own Inventory Asset
            debit: totalOwnOpeningValuation,
            credit: 0,
            description: 'Opening own stock inventory asset',
          },
          {
            accountCode: '3020', // Opening Balance Clearing Equity
            debit: 0,
            credit: totalOwnOpeningValuation,
            description: 'Opening inventory equity clearing',
          },
        ],
      });
    }

    return openingEntry;
  });

  return res.status(201).json({ success: true, data: result });
});

// Update Opening Stock Entry item costs/notes (for corrections)
router.patch('/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const entryId = BigInt(req.params.id);
  const { items, notes } = req.body as {
    notes?: string;
    items: Array<{
      id: number;
      unitCost: string;
      supplierId?: number | null;
      extraCharges?: string;
      extraChargesNote?: string;
      paymentType?: string;
      userNote?: string;
    }>;
  };

  const entry = await prisma.openingStockEntry.findUnique({
    where: { id: entryId },
    include: { items: true },
  });
  if (!entry) throw new Error('Opening stock entry not found');

  await dbTx(async (tx) => {
    // Update entry-level notes
    if (notes !== undefined) {
      await tx.openingStockEntry.update({
        where: { id: entryId },
        data: { notes },
      });
    }

    // Update each item line
    for (const upd of items) {
      const itemId = BigInt(upd.id);
      const unitCostDec = toMoney(upd.unitCost || '0');
      const extraChargesDec = toMoney(upd.extraCharges || '0');

      // Rebuild notes string
      const noteParts: string[] = [];
      if (upd.paymentType) noteParts.push(`Payment: ${upd.paymentType}`);
      if (extraChargesDec.greaterThan(0)) {
        noteParts.push(
          `Extra Charges: Rs.${extraChargesDec.toFixed(4)}${upd.extraChargesNote ? ` (${upd.extraChargesNote})` : ''}`
        );
      }
      if (upd.userNote?.trim()) noteParts.push(upd.userNote.trim());

      await tx.openingStockItem.update({
        where: { id: itemId },
        data: {
          unitCost: unitCostDec,
          supplierId: upd.supplierId ? BigInt(upd.supplierId) : null,
          notes: noteParts.length > 0 ? noteParts.join(' | ') : null,
        },
      });

      // Find matching batch and update its unitCost (landed cost)
      const stockItem = await tx.openingStockItem.findUnique({ where: { id: itemId } });
      if (stockItem) {
        const baseQty = stockItem.baseQuantity;
        const landedCost = new Decimal(baseQty).greaterThan(0)
          ? unitCostDec.plus(extraChargesDec.div(new Decimal(baseQty)))
          : unitCostDec;

        await tx.stockBatch.updateMany({
          where: {
            sourceType: 'OPENING',
            sourceDocumentId: entryId,
            itemId: stockItem.itemId,
          },
          data: { unitCost: landedCost },
        });
      }
    }

    // Recalculate own opening stock valuation and sync Journal Entries
    const allItems = await tx.openingStockItem.findMany({
      where: { openingStockEntryId: entryId },
    });
    let updatedTotalOwnValuation = new Decimal(0);
    for (const item of allItems) {
      if (item.ownershipType === 'OWN') {
        const batch = await tx.stockBatch.findFirst({
          where: { sourceType: 'OPENING', sourceDocumentId: entryId, itemId: item.itemId },
        });
        const landedCost = batch ? new Decimal(batch.unitCost) : new Decimal(item.unitCost);
        updatedTotalOwnValuation = updatedTotalOwnValuation.plus(new Decimal(item.baseQuantity).times(landedCost));
      }
    }

    // Delete existing journal entries for this opening entry
    const existingJournals = await tx.journalEntry.findMany({
      where: { referenceType: 'OPENING_STOCK', referenceId: entryId },
      select: { id: true },
    });
    for (const j of existingJournals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    // Recreate journal entry if valuation > 0
    if (updatedTotalOwnValuation.greaterThan(0)) {
      await createBalancedJournalEntry({
        tx,
        entryDate: entry.entryDate.toISOString().split('T')[0],
        referenceType: 'OPENING_STOCK',
        referenceId: entryId,
        referenceNumber: entry.entryNumber,
        narration: `Opening inventory asset valuation for entry ${entry.entryNumber} (Updated)`,
        lines: [
          {
            accountCode: '1040',
            debit: updatedTotalOwnValuation,
            credit: 0,
            description: 'Opening own stock inventory asset',
          },
          {
            accountCode: '3020',
            debit: 0,
            credit: updatedTotalOwnValuation,
            description: 'Opening inventory equity clearing',
          },
        ],
      });
    }
  });

  const updated = await prisma.openingStockEntry.findUnique({
    where: { id: entryId },
    include: {
      items: {
        include: {
          item: true,
          supplier: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  return res.json({ success: true, data: updated });
});

// Delete Opening Stock Entry (reverses batches, movements, and journal)
router.delete('/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const entryId = BigInt(req.params.id);

  const result = await dbTx(async (tx) => {
    const entry = await tx.openingStockEntry.findUnique({
      where: { id: entryId },
      include: { items: true },
    });
    if (!entry) throw new Error('Opening stock entry not found');
    if (!entry.isFinalized) throw new Error('Entry is not finalized');

    // Check if any opening batch has been partially sold
    const batches = await tx.stockBatch.findMany({
      where: { sourceType: 'OPENING', sourceDocumentId: entryId },
    });

    for (const batch of batches) {
      if (batch.initialBaseQty.toString() !== batch.remainingBaseQty.toString()) {
        throw new Error(
          `Cannot delete: Opening batch ${batch.batchNumber} has been partially sold. Reverse sales first.`
        );
      }
    }

    // Collect item IDs belonging to this entry for potential orphan cleanup
    const itemIds = entry.items.map((it) => it.itemId);

    // Delete stock movements
    await tx.stockMovement.deleteMany({
      where: { referenceType: 'OPENING_STOCK', referenceId: entryId },
    });

    // Delete stock batches
    await tx.stockBatch.deleteMany({
      where: { sourceType: 'OPENING', sourceDocumentId: entryId },
    });

    // Revert supplier balances for any items on CREDIT
    for (const it of entry.items) {
      if (it.supplierId && it.notes && it.notes.includes('Payment: CREDIT')) {
        const baseQty = new Decimal(it.baseQuantity.toString());
        const unitCost = new Decimal(it.unitCost.toString());
        let extraCharges = new Decimal(0);
        const m = it.notes.match(/Extra Charges: Rs\.([\d.]+)/);
        if (m) extraCharges = new Decimal(m[1]);
        const linePayable = baseQty.times(unitCost).plus(extraCharges);
        if (linePayable.greaterThan(0)) {
          await tx.supplier.update({
            where: { id: it.supplierId },
            data: { currentBalanceOwn: { decrement: linePayable } },
          });
        }
      }
    }

    // Delete journal entries
    const journals = await tx.journalEntry.findMany({
      where: { referenceType: 'OPENING_STOCK', referenceId: entryId },
      select: { id: true },
    });
    for (const j of journals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    // Delete opening items and entry
    const supplierIds = entry.items.map((it) => it.supplierId).filter(Boolean) as bigint[];

    await tx.openingStockItem.deleteMany({ where: { openingStockEntryId: entryId } });
    await tx.openingStockEntry.delete({ where: { id: entryId } });

    // If any referenced supplier now has 0 purchases and 0 openings left, reset balance to 0
    for (const suppId of supplierIds) {
      const remainingPurchases = await tx.purchaseInvoice.count({
        where: { supplierId: suppId },
      });
      const remainingOpenings = await tx.openingStockItem.count({
        where: { supplierId: suppId },
      });
      if (remainingPurchases === 0 && remainingOpenings === 0) {
        await tx.supplier.update({
          where: { id: suppId },
          data: {
            currentBalanceOwn: new Decimal(0),
            openingBalanceOwn: new Decimal(0),
          },
        });
      }
    }

    // Clean up any items that now have 0 history and were only created for this entry
    for (const itemId of itemIds) {
      const [batches, movements, openings, purchases, sales, consignments, agreements] = await Promise.all([
        tx.stockBatch.count({ where: { itemId } }),
        tx.stockMovement.count({ where: { itemId } }),
        tx.openingStockItem.count({ where: { itemId } }),
        tx.purchaseInvoiceItem.count({ where: { itemId } }),
        tx.salesInvoiceItem.count({ where: { itemId } }),
        tx.consignmentReceiptItem.count({ where: { itemId } }),
        tx.commissionAgreement.count({ where: { itemId } }),
      ]);

      if (
        batches === 0 &&
        movements === 0 &&
        openings === 0 &&
        purchases === 0 &&
        sales === 0 &&
        consignments === 0 &&
        agreements === 0
      ) {
        await tx.itemUnitConversion.deleteMany({ where: { itemId } });
        await tx.item.delete({ where: { id: itemId } });
      }
    }

    return { message: `Opening stock entry ${entry.entryNumber} deleted, reversed, and unused items cleaned.` };
  });

  return res.json({ success: true, data: result });
});

export const openingStockRoutes = router;
