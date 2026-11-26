import { Router, type Request, type Response } from 'express';
import { prisma, dbTx } from '../../database/prisma.js';
import {
  CommissionAgreementSchema,
  ConsignmentReceiptCreateSchema,
  SupplierSettlementSchema,
  ConsignmentReturnCreateSchema,
  SupplierAdvanceCreateSchema,
  CommissionExpenseSchema,
} from '@erp/validation';
import { requireOwnerAuth } from '../../middleware/auth.js';
import { calculateBaseQuantity, Decimal, toMoney, toQuantity } from '@erp/business-rules';
import { createBalancedJournalEntry } from '../../accounting/posting-engine.js';

const router = Router();

// ----------------- COMMISSION AGREEMENTS -----------------
router.get('/agreements', async (req: Request, res: Response) => {
  const { supplierId } = req.query;
  const where: Record<string, unknown> = {};
  if (supplierId) where.supplierId = BigInt(supplierId as string);

  const agreements = await prisma.commissionAgreement.findMany({
    where,
    include: { supplier: true, item: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ success: true, data: agreements });
});

router.post('/agreements', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = CommissionAgreementSchema.parse(req.body);

  const agreement = await prisma.commissionAgreement.create({
    data: {
      supplierId: BigInt(validated.supplierId),
      itemId: validated.itemId ? BigInt(validated.itemId) : null,
      commissionPercentage: new Decimal(validated.commissionPercentage),
      effectiveStartDate: new Date(validated.effectiveStartDate),
      effectiveEndDate: validated.effectiveEndDate ? new Date(validated.effectiveEndDate) : null,
      notes: validated.notes,
      isActive: true,
    },
  });

  return res.status(201).json({ success: true, data: agreement });
});

// ----------------- CONSIGNMENT RECEIPTS -----------------
router.get('/receipts', async (_req: Request, res: Response) => {
  const receipts = await prisma.consignmentReceipt.findMany({
    include: {
      supplier: true,
      items: { include: { item: true } },
    },
    orderBy: { receiptDate: 'desc' },
  });
  return res.json({ success: true, data: receipts });
});

router.post('/receipts', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = ConsignmentReceiptCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: BigInt(validated.supplierId) },
    });
    if (!supplier) throw new Error(`Supplier ID ${validated.supplierId} not found`);

    const receipt = await tx.consignmentReceipt.create({
      data: {
        receiptNumber: validated.receiptNumber,
        supplierId: supplier.id,
        receiptDate: new Date(validated.receiptDate),
        vehicleNumber: validated.vehicleNumber,
        driverPhone: validated.driverPhone,
        notes: validated.notes,
      },
    });

    for (const line of validated.items) {
      const item = await tx.item.findUnique({
        where: { id: BigInt(line.itemId) },
        include: { baseUnit: true, conversions: { include: { unit: true } } },
      });
      if (!item) throw new Error(`Item ID ${line.itemId} not found`);

      let multiplier = new Decimal(1);
      let unitName = item.baseUnit.name;

      if (BigInt(line.unitId) !== item.baseUnitId) {
        const conv = item.conversions.find((c) => c.unitId === BigInt(line.unitId));
        if (conv) {
          multiplier = new Decimal(conv.multiplierToBase);
          unitName = conv.unit.name;
        } else {
          const targetUnit = await tx.unit.findUnique({ where: { id: BigInt(line.unitId) } });
          if (!targetUnit) throw new Error(`Unit ID ${line.unitId} not found`);
          unitName = targetUnit.name;
          const uCode = targetUnit.code.toUpperCase();
          if (uCode === 'MANN') {
            const row = await tx.appSettings.findUnique({ where: { settingKey: 'mann_default_kg' } });
            multiplier = new Decimal(row?.settingValue || '40');
          } else if (uCode === 'BAG') {
            const row = await tx.appSettings.findUnique({ where: { settingKey: 'bag_default_kg' } });
            multiplier = new Decimal(row?.settingValue || '50');
          } else {
            throw new Error(`Unit conversion not defined for item ${item.name} and unit ID ${line.unitId}`);
          }
        }
      }

      const conversion = calculateBaseQuantity(line.enteredQuantity, multiplier, item.baseUnit.name);
      const baseQtyDec = toQuantity(conversion.baseQuantity);
      const batchNumber = line.batchNumber || `CONS-${supplier.code}-${Date.now()}`;

      await tx.consignmentReceiptItem.create({
        data: {
          consignmentReceiptId: receipt.id,
          itemId: item.id,
          enteredQuantity: toQuantity(line.enteredQuantity),
          enteredUnitName: unitName,
          conversionFactorSnap: new Decimal(conversion.multiplierToBase),
          baseQuantity: baseQtyDec,
          baseUnitName: conversion.baseUnit,
          referenceRate: line.referenceRate ? toMoney(line.referenceRate) : null,
          batchNumber,
          notes: line.notes,
        },
      });

      // Create Supplier-Isolated Consignment Stock Batch
      // Unit cost is 0.0000 - NEVER recognized as shop inventory asset!
      const batch = await tx.stockBatch.create({
        data: {
          batchNumber,
          itemId: item.id,
          ownershipType: 'CONSIGNMENT',
          sourceType: 'CONSIGNMENT_RECEIPT',
          sourceDocumentId: receipt.id,
          supplierId: supplier.id,
          receivedDate: new Date(validated.receiptDate),
          initialBaseQty: baseQtyDec,
          remainingBaseQty: baseQtyDec,
          baseUnitName: conversion.baseUnit,
          unitCost: new Decimal(0),
          referenceValuation: line.referenceRate ? toMoney(line.referenceRate) : null,
          status: 'ACTIVE',
        },
      });

      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          itemId: item.id,
          ownershipType: 'CONSIGNMENT',
          supplierId: supplier.id,
          movementType: 'CONSIGNMENT_IN',
          enteredQuantity: toQuantity(line.enteredQuantity),
          enteredUnitName: unitName,
          conversionFactorSnap: new Decimal(conversion.multiplierToBase),
          baseQuantity: baseQtyDec,
          baseUnitName: conversion.baseUnit,
          referenceType: 'CONSIGNMENT_RECEIPT',
          referenceId: receipt.id,
          referenceNumber: receipt.receiptNumber,
          movementDate: new Date(validated.receiptDate),
        },
      });
    }

    return receipt;
  });

  return res.status(201).json({ success: true, data: result });
});

router.put('/receipts/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const receiptId = BigInt(req.params.id);
  const { receiptDate, notes, referenceRate } = req.body;

  const result = await dbTx(async (tx) => {
    const receipt = await tx.consignmentReceipt.findUnique({
      where: { id: receiptId },
      include: { items: true },
    });
    if (!receipt) throw new Error('Consignment Receipt nahi mili');

    const updateData: Record<string, unknown> = {};
    const parsedDate = receiptDate ? new Date(receiptDate) : undefined;
    if (parsedDate) updateData.receiptDate = parsedDate;
    if (notes !== undefined) updateData.notes = notes;

    const updatedReceipt = await tx.consignmentReceipt.update({
      where: { id: receiptId },
      data: updateData,
    });

    const parsedRate = referenceRate !== undefined && referenceRate !== null && referenceRate !== ''
      ? toMoney(referenceRate)
      : undefined;

    // Update receipt items & batches
    for (const item of receipt.items) {
      if (parsedRate !== undefined) {
        await tx.consignmentReceiptItem.update({
          where: { id: item.id },
          data: { referenceRate: parsedRate },
        });
      }

      // Find matching batch
      const batches = await tx.stockBatch.findMany({
        where: {
          sourceType: 'CONSIGNMENT_RECEIPT',
          sourceDocumentId: receipt.id,
          itemId: item.itemId,
        },
      });

      for (const batch of batches) {
        const batchUpdate: Record<string, unknown> = {};
        if (parsedDate) batchUpdate.receivedDate = parsedDate;
        if (parsedRate !== undefined) {
          batchUpdate.referenceValuation = parsedRate.times(batch.initialBaseQty);
        }
        if (Object.keys(batchUpdate).length > 0) {
          await tx.stockBatch.update({
            where: { id: batch.id },
            data: batchUpdate,
          });
        }
      }
    }

    // Update movements date if changed
    if (parsedDate) {
      await tx.stockMovement.updateMany({
        where: {
          referenceType: 'CONSIGNMENT_RECEIPT',
          referenceId: receipt.id,
        },
        data: {
          movementDate: parsedDate,
        },
      });
    }

    return updatedReceipt;
  });

  return res.json({ success: true, data: result });
});

router.delete('/receipts/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const receiptId = BigInt(req.params.id);

  const result = await dbTx(async (tx) => {
    const receipt = await tx.consignmentReceipt.findUnique({
      where: { id: receiptId },
      include: { items: true },
    });
    if (!receipt) throw new Error('Consignment Receipt nahi mili');

    const supplierId = receipt.supplierId;
    const itemIds = receipt.items.map((it) => it.itemId);

    // Find batches
    const batches = await tx.stockBatch.findMany({
      where: {
        sourceType: 'CONSIGNMENT_RECEIPT',
        sourceDocumentId: receipt.id,
      },
      include: {
        stockAllocations: true,
      },
    });

    for (const batch of batches) {
      if (batch.stockAllocations.length > 0 || !new Decimal(batch.remainingBaseQty).equals(new Decimal(batch.initialBaseQty))) {
        throw new Error(
          `Receipt ${receipt.receiptNumber} ka maal bika ya allocate ho chuka hai (Remaining: ${batch.remainingBaseQty}/${batch.initialBaseQty}). Isay delete nahi kiya ja sakta.`
        );
      }
    }

    const batchIds = batches.map((b) => b.id);

    if (batchIds.length > 0) {
      await tx.stockMovement.deleteMany({
        where: {
          batchId: { in: batchIds },
        },
      });

      await tx.stockBatch.deleteMany({
        where: {
          id: { in: batchIds },
        },
      });
    }

    // 1. Delete auto-created bilti/commissionExpense tied to this receipt & restore supplier balance
    const receiptExpenses = await tx.commissionExpense.findMany({
      where: {
        OR: [
          { description: { contains: receipt.receiptNumber } },
          { notes: { contains: receipt.receiptNumber } },
        ],
      },
    });
    if (receiptExpenses.length > 0) {
      const expSum = receiptExpenses.reduce((acc, e) => acc.plus(e.amount), new Decimal(0));
      if (expSum.greaterThan(0)) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { currentBalanceConsignment: { increment: expSum } },
        });
      }
      await tx.commissionExpense.deleteMany({
        where: { id: { in: receiptExpenses.map((e) => e.id) } },
      });
    }

    await tx.consignmentReceiptItem.deleteMany({
      where: { consignmentReceiptId: receipt.id },
    });

    await tx.consignmentReceipt.delete({
      where: { id: receipt.id },
    });

    // 2. Check if supplier has any other consignment receipts left
    const remainingReceipts = await tx.consignmentReceipt.count({
      where: { supplierId, id: { not: receipt.id } },
    });

    if (remainingReceipts === 0) {
      // Delete ALL commission expenses tagged to this supplier
      await tx.commissionExpense.deleteMany({
        where: {
          notes: { contains: `SUPPLIER_ID:${supplierId}` },
        },
      });

      // Delete commission agreements for this supplier
      await tx.commissionAgreement.deleteMany({
        where: { supplierId },
      });

      // Check if supplier is used in trade purchases, sales, settlements, advances, or returns
      const [purchCount, saleCount, batchCount, settlementCount, advanceCount, returnCount, openingCount] = await Promise.all([
        tx.purchaseInvoice.count({ where: { supplierId } }),
        tx.salesInvoiceItem.count({ where: { supplierId } }),
        tx.stockBatch.count({ where: { supplierId } }),
        tx.supplierSettlement.count({ where: { supplierId } }),
        tx.supplierAdvance.count({ where: { supplierId } }),
        tx.consignmentReturn.count({ where: { supplierId } }),
        tx.openingStockItem.count({ where: { supplierId } }),
      ]);

      if (
        purchCount === 0 &&
        saleCount === 0 &&
        batchCount === 0 &&
        settlementCount === 0 &&
        advanceCount === 0 &&
        returnCount === 0 &&
        openingCount === 0
      ) {
        await tx.supplier.delete({ where: { id: supplierId } });
      } else {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { currentBalanceConsignment: new Decimal(0) },
        });
      }
    }

    // 3. Clean up orphaned items created for this receipt that have no other history
    for (const itemId of itemIds) {
      const [bCount, mCount, opCount, pCount, sCount, cCount] = await Promise.all([
        tx.stockBatch.count({ where: { itemId } }),
        tx.stockMovement.count({ where: { itemId } }),
        tx.openingStockItem.count({ where: { itemId } }),
        tx.purchaseInvoiceItem.count({ where: { itemId } }),
        tx.salesInvoiceItem.count({ where: { itemId } }),
        tx.consignmentReceiptItem.count({ where: { itemId } }),
      ]);

      if (bCount === 0 && mCount === 0 && opCount === 0 && pCount === 0 && sCount === 0 && cCount === 0) {
        await tx.commissionAgreement.deleteMany({ where: { itemId } });
        await tx.itemUnitConversion.deleteMany({ where: { itemId } });
        await tx.stockMovement.deleteMany({ where: { itemId } });
        await tx.item.delete({ where: { id: itemId } });
      }
    }

    return {
      deletedReceiptNumber: receipt.receiptNumber,
      supplierCleaned: remainingReceipts === 0,
    };
  });

  return res.json({ success: true, data: result });
});

// Delete Commission Supplier & All Linked Records (Expenses, Agreements, Receipts, Batches, Orphan Items)
router.delete('/suppliers/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const supplierId = BigInt(req.params.id);

  const result = await dbTx(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: supplierId },
      include: {
        consignmentReceipts: { include: { items: true } },
        purchaseInvoices: true,
      },
    });

    if (!supplier) {
      throw new Error('Commission Supplier nahi mila');
    }

    // Check if supplier has any active/unreversed sales
    const activeSalesCount = await tx.salesInvoiceItem.count({
      where: { supplierId, ownershipType: 'CONSIGNMENT' },
    });
    if (activeSalesCount > 0) {
      throw new Error(`Supplier '${supplier.name}' ka maal sale ho chuka hai (${activeSalesCount} bills). Pehle sales cancel karein.`);
    }

    const receiptIds = supplier.consignmentReceipts.map((r) => r.id);
    const itemIds = supplier.consignmentReceipts.flatMap((r) => r.items.map((it) => it.itemId));

    // Delete batches and movements
    const batches = await tx.stockBatch.findMany({
      where: { supplierId: supplier.id, ownershipType: 'CONSIGNMENT' },
    });
    const batchIds = batches.map((b) => b.id);

    if (batchIds.length > 0) {
      await tx.stockMovement.deleteMany({
        where: { batchId: { in: batchIds } },
      });
      await tx.stockBatch.deleteMany({
        where: { id: { in: batchIds } },
      });
    }

    // Delete consignment receipts and any linked journal entries
    if (receiptIds.length > 0) {
      const receiptJournals = await tx.journalEntry.findMany({
        where: { referenceType: 'CONSIGNMENT_RECEIPT', referenceId: { in: receiptIds } },
        select: { id: true },
      });
      if (receiptJournals.length > 0) {
        const rjIds = receiptJournals.map((j) => j.id);
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: { in: rjIds } } });
        await tx.journalEntry.deleteMany({ where: { id: { in: rjIds } } });
      }

      await tx.consignmentReceiptItem.deleteMany({
        where: { consignmentReceiptId: { in: receiptIds } },
      });
      await tx.consignmentReceipt.deleteMany({
        where: { id: { in: receiptIds } },
      });
    }

    // Delete consignment returns for this supplier
    const returns = await tx.consignmentReturn.findMany({
      where: { supplierId: supplier.id },
      select: { id: true },
    });
    if (returns.length > 0) {
      const returnIds = returns.map((r) => r.id);
      const returnJournals = await tx.journalEntry.findMany({
        where: { referenceType: 'CONSIGNMENT_RETURN', referenceId: { in: returnIds } },
        select: { id: true },
      });
      if (returnJournals.length > 0) {
        const retJIds = returnJournals.map((j) => j.id);
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: { in: retJIds } } });
        await tx.journalEntry.deleteMany({ where: { id: { in: retJIds } } });
      }
      await tx.consignmentReturnItem.deleteMany({ where: { consignmentReturnId: { in: returnIds } } });
      await tx.consignmentReturn.deleteMany({ where: { id: { in: returnIds } } });
    }

    // Delete all commission expenses tagged to this supplier or containing supplier name
    await tx.commissionExpense.deleteMany({
      where: {
        OR: [
          { notes: { contains: `SUPPLIER_ID:${supplier.id}` } },
          { notes: { contains: supplier.name } },
          { description: { contains: supplier.name } },
        ],
      },
    });

    // Delete commission agreements
    await tx.commissionAgreement.deleteMany({
      where: { supplierId: supplier.id },
    });

    const allCashAccts = await tx.cashBankAccount.findMany();
    const cashGlMap = new Map(allCashAccts.map((a) => [a.glAccountId.toString(), a]));

    // Reverse and delete settlements
    const settlements = await tx.supplierSettlement.findMany({
      where: { supplierId: supplier.id },
    });
    for (const s of settlements) {
      const journals = await tx.journalEntry.findMany({
        where: { referenceType: 'SUPPLIER_SETTLEMENT', referenceId: s.id },
        include: { lines: { select: { accountId: true, credit: true } } },
      });

      if (new Decimal(s.netPaidAmount).greaterThan(0)) {
        let targetCashAcct = null;
        for (const j of journals) {
          for (const l of j.lines) {
            if (new Decimal(l.credit).greaterThan(0) && cashGlMap.has(l.accountId.toString())) {
              targetCashAcct = cashGlMap.get(l.accountId.toString())!;
              break;
            }
          }
          if (targetCashAcct) break;
        }
        if (!targetCashAcct) targetCashAcct = allCashAccts[0] ?? null;
        if (targetCashAcct) {
          await tx.cashBankAccount.update({
            where: { id: targetCashAcct.id },
            data: { currentBalance: { increment: s.netPaidAmount } },
          });
        }
      }

      for (const j of journals) {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
        await tx.journalEntry.delete({ where: { id: j.id } });
      }
      await tx.supplierAdvanceAllocation.deleteMany({ where: { supplierSettlementId: s.id } });
    }
    if (settlements.length > 0) {
      await tx.supplierSettlement.deleteMany({
        where: { supplierId: supplier.id },
      });
    }

    // Reverse and delete supplier advances
    const advances = await tx.supplierAdvance.findMany({
      where: { supplierId: supplier.id },
    });
    for (const adv of advances) {
      const journals = await tx.journalEntry.findMany({
        where: { referenceType: 'SUPPLIER_ADVANCE', referenceId: adv.id },
        include: { lines: { select: { accountId: true, credit: true } } },
      });

      if (new Decimal(adv.amount).greaterThan(0)) {
        let targetCashAcct = null;
        for (const j of journals) {
          for (const l of j.lines) {
            if (new Decimal(l.credit).greaterThan(0) && cashGlMap.has(l.accountId.toString())) {
              targetCashAcct = cashGlMap.get(l.accountId.toString())!;
              break;
            }
          }
          if (targetCashAcct) break;
        }
        if (!targetCashAcct) targetCashAcct = allCashAccts[0] ?? null;
        if (targetCashAcct) {
          await tx.cashBankAccount.update({
            where: { id: targetCashAcct.id },
            data: { currentBalance: { increment: adv.amount } },
          });
        }
      }

      for (const j of journals) {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
        await tx.journalEntry.delete({ where: { id: j.id } });
      }
      await tx.supplierAdvanceAllocation.deleteMany({ where: { supplierAdvanceId: adv.id } });
    }
    if (advances.length > 0) {
      await tx.supplierAdvance.deleteMany({
        where: { supplierId: supplier.id },
      });
    }

    // Delete and reverse payment vouchers tied to this supplier
    const linkedPaymentVouchers = await tx.paymentVoucher.findMany({
      where: {
        OR: [
          { partyType: 'SUPPLIER', partyId: supplier.id },
          { narration: { contains: `to ${supplier.name}` } },
        ],
      },
    });

    for (const pv of linkedPaymentVouchers) {
      await tx.cashBankAccount.update({
        where: { id: pv.cashBankAccountId },
        data: { currentBalance: { increment: pv.amount } },
      });

      const journals = await tx.journalEntry.findMany({
        where: { referenceType: 'PAYMENT_VOUCHER', referenceId: pv.id },
        select: { id: true },
      });
      for (const j of journals) {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
        await tx.journalEntry.delete({ where: { id: j.id } });
      }

      await tx.paymentVoucher.delete({ where: { id: pv.id } });
    }

    // If trade purchases or opening stock exist, retain supplier but wipe commission balance
    const [openingCount, purchaseReturnCount, remainingBatches] = await Promise.all([
      tx.openingStockItem.count({ where: { supplierId: supplier.id } }),
      tx.purchaseReturn.count({ where: { supplierId: supplier.id } }),
      tx.stockBatch.count({ where: { supplierId: supplier.id } }),
    ]);

    if (supplier.purchaseInvoices.length > 0 || openingCount > 0 || purchaseReturnCount > 0 || remainingBatches > 0) {
      await tx.supplier.update({
        where: { id: supplier.id },
        data: { currentBalanceConsignment: new Decimal(0) },
      });
    } else {
      // Otherwise, completely remove supplier
      await tx.supplier.delete({
        where: { id: supplier.id },
      });
    }

    // Clean up orphan items
    for (const itemId of itemIds) {
      const [bCount, mCount, opCount, pCount, sCount, cCount] = await Promise.all([
        tx.stockBatch.count({ where: { itemId } }),
        tx.stockMovement.count({ where: { itemId } }),
        tx.openingStockItem.count({ where: { itemId } }),
        tx.purchaseInvoiceItem.count({ where: { itemId } }),
        tx.salesInvoiceItem.count({ where: { itemId } }),
        tx.consignmentReceiptItem.count({ where: { itemId } }),
      ]);

      if (bCount === 0 && mCount === 0 && opCount === 0 && pCount === 0 && sCount === 0 && cCount === 0) {
        await tx.commissionAgreement.deleteMany({ where: { itemId } });
        await tx.itemUnitConversion.deleteMany({ where: { itemId } });
        await tx.stockMovement.deleteMany({ where: { itemId } });
        await tx.item.delete({ where: { id: itemId } });
      }
    }

    return {
      message: `Supplier '${supplier.name}', iske kharche aur tamam commission records mukammal delete ho gaye.`,
    };
  });

  return res.json({ success: true, data: result });
});

// ----------------- SUPPLIER SETTLEMENT -----------------
router.post('/settlements', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = SupplierSettlementSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: BigInt(validated.supplierId) },
    });
    if (!supplier) throw new Error(`Supplier ID ${validated.supplierId} not found`);

    const settlementAmount = toMoney(validated.amount);
    const advanceDeduction = toMoney(validated.deductFromAdvanceAmount);
    const netCashPaid = settlementAmount.minus(advanceDeduction);

    if (netCashPaid.isNegative()) {
      throw new Error('Advance deduction cannot exceed settlement amount');
    }

    // Sequence
    const seq = await tx.documentSequence.upsert({
      where: { sequenceType: 'SETTLEMENT' },
      update: { currentNumber: { increment: 1 } },
      create: { sequenceType: 'SETTLEMENT', prefix: 'SET-', currentNumber: BigInt(1), paddingLength: 5 },
    });
    const settlementNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;

    const settlement = await tx.supplierSettlement.create({
      data: {
        settlementNumber,
        supplierId: supplier.id,
        settlementDate: new Date(validated.settlementDate),
        grossPayableAmount: settlementAmount,
        advanceDeductionAmount: advanceDeduction,
        netPaidAmount: netCashPaid,
        paymentMethod: 'CASH',
        referenceNumber: validated.referenceNumber,
        notes: validated.notes,
      },
    });

    // Reduce Supplier Consignment Payable Balance
    await tx.supplier.update({
      where: { id: supplier.id },
      data: {
        currentBalanceConsignment: { decrement: settlementAmount },
      },
    });

    // Reduce Cash/Bank
    let settlementCashType = 'CASH';
    if (netCashPaid.greaterThan(0)) {
      const cashAcc = await tx.cashBankAccount.update({
        where: { id: BigInt(validated.cashBankAccountId) },
        data: { currentBalance: { decrement: netCashPaid } },
      });
      settlementCashType = cashAcc.accountType;
    }

    // Balanced Journal Entry:
    // Debit: 2020 (Commission Supplier Payable) = settlementAmount
    // Credit: 1050 (Supplier Advances) = advanceDeduction (if any)
    // Credit: 1010/1011 (Cash/Bank) = netCashPaid (if any)
    type SettlementJournalLine = {
      accountCode: string;
      debit: Decimal.Value;
      credit: Decimal.Value;
      partyType?: 'CUSTOMER' | 'SUPPLIER';
      partyId?: bigint;
      description?: string;
    };

    const journalLines: SettlementJournalLine[] = [
      {
        accountCode: '2020',
        debit: settlementAmount,
        credit: new Decimal(0),
        partyType: 'SUPPLIER',
        partyId: supplier.id,
        description: `Consignment settlement payout ${settlementNumber}`,
      },
    ];

    if (advanceDeduction.greaterThan(0)) {
      journalLines.push({
        accountCode: '1050',
        debit: new Decimal(0),
        credit: advanceDeduction,
        partyType: 'SUPPLIER',
        partyId: supplier.id,
        description: `Advance adjustment for settlement ${settlementNumber}`,
      });
    }

    if (netCashPaid.greaterThan(0)) {
      journalLines.push({
        accountCode: settlementCashType === 'BANK' ? '1011' : '1010',
        debit: new Decimal(0),
        credit: netCashPaid,
        description: `Cash payout for settlement ${settlementNumber}`,
      });
    }

    await createBalancedJournalEntry({
      tx,
      entryDate: validated.settlementDate,
      referenceType: 'SUPPLIER_SETTLEMENT',
      referenceId: settlement.id,
      referenceNumber: settlementNumber,
      narration: `Consignment proceeds settlement to ${supplier.name}`,
      lines: journalLines,
    });

    return settlement;
  });

  return res.status(201).json({ success: true, data: result });
});

// ----------------- CONSIGNMENT RETURNS -----------------
// List Consignment Returns
router.get('/returns', async (_req: Request, res: Response) => {
  const returns = await prisma.consignmentReturn.findMany({
    include: {
      supplier: true,
      items: true,
    },
    orderBy: { returnDate: 'desc' },
  });
  return res.json({ success: true, data: returns });
});

// Process Consignment Return (Returning unsold consignment stock to supplier)
// Rule: Zero financial/asset valuation impact.
router.post('/returns', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = ConsignmentReturnCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: BigInt(validated.supplierId) },
    });
    if (!supplier) throw new Error(`Supplier ID ${validated.supplierId} not found`);

    let returnNumber = validated.returnNumber;
    if (!returnNumber) {
      const seq = await tx.documentSequence.upsert({
        where: { sequenceType: 'CONSIGNMENT_RETURN' },
        update: { currentNumber: { increment: 1 } },
        create: { sequenceType: 'CONSIGNMENT_RETURN', prefix: 'CRTN-', currentNumber: BigInt(1), paddingLength: 5 },
      });
      returnNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;
    }

    const consignmentReturn = await tx.consignmentReturn.create({
      data: {
        returnNumber,
        supplierId: supplier.id,
        returnDate: new Date(validated.returnDate),
        reason: validated.reason,
      },
    });

    for (const item of validated.items) {
      const batch = await tx.stockBatch.findUnique({
        where: { id: BigInt(item.batchId) },
      });
      if (!batch) throw new Error(`Batch ID ${item.batchId} not found`);
      if (batch.ownershipType !== 'CONSIGNMENT' || batch.supplierId !== supplier.id) {
        throw new Error(`Batch ${batch.batchNumber} does not belong to supplier ${supplier.name} under CONSIGNMENT ownership.`);
      }

      const returnQty = toQuantity(item.baseQuantity);
      if (new Decimal(batch.remainingBaseQty).lessThan(returnQty)) {
        throw new Error(`Insufficient quantity in batch ${batch.batchNumber} to return. Available: ${batch.remainingBaseQty}, Requested: ${returnQty}`);
      }

      await tx.consignmentReturnItem.create({
        data: {
          consignmentReturnId: consignmentReturn.id,
          batchId: batch.id,
          baseQuantity: returnQty,
        },
      });

      const newRemaining = new Decimal(batch.remainingBaseQty).minus(returnQty);
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: {
          remainingBaseQty: newRemaining,
          status: newRemaining.equals(0) ? 'EXHAUSTED' : 'ACTIVE',
        },
      });

      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          itemId: batch.itemId,
          ownershipType: 'CONSIGNMENT',
          supplierId: supplier.id,
          movementType: 'CONSIGNMENT_RETURN_OUT',
          enteredQuantity: returnQty,
          enteredUnitName: 'KG',
          conversionFactorSnap: new Decimal(1),
          baseQuantity: returnQty,
          baseUnitName: 'KG',
          referenceType: 'CONSIGNMENT_RETURN',
          referenceId: consignmentReturn.id,
          referenceNumber: returnNumber,
          movementDate: new Date(validated.returnDate),
        },
      });
    }

    return consignmentReturn;
  });

  return res.status(201).json({ success: true, data: result });
});

// ----------------- SUPPLIER ADVANCES -----------------
// List all advances
router.get('/advances', async (_req: Request, res: Response) => {
  const advances = await prisma.supplierAdvance.findMany({
    include: { supplier: true, allocations: true },
    orderBy: { advanceDate: 'desc' },
  });
  return res.json({ success: true, data: advances });
});

// List advances for a supplier
router.get('/advances/:supplierId', async (req: Request, res: Response) => {
  const advances = await prisma.supplierAdvance.findMany({
    where: {
      supplierId: BigInt(req.params.supplierId),
      remainingAmount: { gt: 0 },
    },
    orderBy: { advanceDate: 'asc' },
  });
  return res.json({ success: true, data: advances });
});

// Record Supplier Advance Payment
router.post('/advances', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = SupplierAdvanceCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: BigInt(validated.supplierId) },
    });
    if (!supplier) throw new Error(`Supplier ID ${validated.supplierId} not found`);

    const cashAccount = await tx.cashBankAccount.findUnique({
      where: { id: BigInt(validated.cashBankAccountId) },
    });
    if (!cashAccount) throw new Error(`Cash/Bank Account ID ${validated.cashBankAccountId} not found`);

    let advanceNumber = validated.advanceNumber;
    if (!advanceNumber) {
      const seq = await tx.documentSequence.upsert({
        where: { sequenceType: 'SUPPLIER_ADVANCE' },
        update: { currentNumber: { increment: 1 } },
        create: { sequenceType: 'SUPPLIER_ADVANCE', prefix: 'ADV-', currentNumber: BigInt(1), paddingLength: 5 },
      });
      advanceNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;
    }

    const advanceAmount = toMoney(validated.amount);

    const advance = await tx.supplierAdvance.create({
      data: {
        advanceNumber,
        supplierId: supplier.id,
        advanceDate: new Date(validated.advanceDate),
        amount: advanceAmount,
        allocatedAmount: new Decimal(0),
        remainingAmount: advanceAmount,
        notes: validated.notes,
      },
    });

    // Update cash balance
    await tx.cashBankAccount.update({
      where: { id: cashAccount.id },
      data: { currentBalance: { decrement: advanceAmount } },
    });

    // Balanced Journal Entry:
    // Debit: 1050 (Supplier Advances Asset) = advanceAmount
    // Credit: 1010/1011 (Cash/Bank) = advanceAmount
    await createBalancedJournalEntry({
      tx,
      entryDate: validated.advanceDate,
      referenceType: 'SUPPLIER_ADVANCE',
      referenceId: advance.id,
      referenceNumber: advanceNumber,
      narration: `Advance payment to supplier ${supplier.name}`,
      lines: [
        {
          accountCode: '1050',
          debit: advanceAmount,
          credit: new Decimal(0),
          partyType: 'SUPPLIER',
          partyId: supplier.id,
          description: `Advance paid ${advanceNumber}`,
        },
        {
          accountCode: cashAccount.accountType === 'BANK' ? '1011' : '1010',
          debit: new Decimal(0),
          credit: advanceAmount,
          description: `Cash disbursement for advance ${advanceNumber}`,
        },
      ],
    });

    return advance;
  });

  return res.status(201).json({ success: true, data: result });
});

// ----------------- SUPPLIER DASHBOARD (per-supplier colony view) -----------------
// Returns: each supplier's stock received, sold, remaining, sold amount, commission earned, supplier payable
router.get('/supplier-dashboard', async (_req: Request, res: Response) => {
  // Clean up ghost agreements for suppliers with no receipts, purchases, or batches
  const ghostSuppliers = await prisma.supplier.findMany({
    where: {
      consignmentReceipts: { none: {} },
      purchaseInvoices: { none: {} },
      stockBatches: { none: {} },
      openingStockItems: { none: {} },
    },
    select: { id: true },
  });
  if (ghostSuppliers.length > 0) {
    const ghostIds = ghostSuppliers.map((s) => s.id);
    await prisma.commissionAgreement.deleteMany({ where: { supplierId: { in: ghostIds } } });
  }

  // Get all consignment suppliers with actual receipts or consignment batches (include deactivated ones if they still hold consignment data)
  const suppliers = await prisma.supplier.findMany({
    where: {
      OR: [
        { consignmentReceipts: { some: {} } },
        { stockBatches: { some: { ownershipType: 'CONSIGNMENT' } } },
      ],
    },
    include: {
      commissionAgreements: {
        where: { isActive: true },
        orderBy: { effectiveStartDate: 'desc' },
      },
      consignmentReceipts: {
        include: {
          items: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const result = [];

  for (const supplier of suppliers) {
    // --- Per-item breakdown ---
    // All consignment stock batches for this supplier
    const batches = await prisma.stockBatch.findMany({
      where: {
        supplierId: supplier.id,
        ownershipType: 'CONSIGNMENT',
      },
      include: { item: true },
    });

    // Group by item
    const itemMap: Record<string, {
      itemId: bigint;
      itemName: string;
      itemCode: string;
      totalReceived: Decimal;
      totalRemaining: Decimal;
      totalSold: Decimal;
      totalReferenceValue: Decimal;
      batchUnit: string;
    }> = {};

    for (const batch of batches) {
      const key = batch.itemId.toString();
      if (!itemMap[key]) {
        itemMap[key] = {
          itemId: batch.itemId,
          itemName: batch.item.name,
          itemCode: batch.item.code,
          totalReceived: new Decimal(0),
          totalRemaining: new Decimal(0),
          totalSold: new Decimal(0),
          totalReferenceValue: new Decimal(0),
          batchUnit: batch.baseUnitName,
        };
      }
      itemMap[key].totalReceived = itemMap[key].totalReceived.plus(batch.initialBaseQty);
      itemMap[key].totalRemaining = itemMap[key].totalRemaining.plus(batch.remainingBaseQty);
      itemMap[key].totalSold = itemMap[key].totalSold.plus(
        new Decimal(batch.initialBaseQty).minus(batch.remainingBaseQty)
      );
      if (batch.referenceValuation) {
        itemMap[key].totalReferenceValue = itemMap[key].totalReferenceValue.plus(batch.referenceValuation);
      }
    }

    // --- Sales financial totals for this supplier (from SalesInvoiceItem) ---
    const saleItems = await prisma.salesInvoiceItem.findMany({
      where: {
        supplierId: supplier.id,
        ownershipType: 'CONSIGNMENT',
      },
    });

    let totalSoldAmount = new Decimal(0);
    let totalCommissionEarned = new Decimal(0);
    let totalSupplierPayable = new Decimal(0);

    for (const si of saleItems) {
      totalSoldAmount = totalSoldAmount.plus(si.netAmount);
      totalCommissionEarned = totalCommissionEarned.plus(si.commissionAmount);
      totalSupplierPayable = totalSupplierPayable.plus(si.supplierPayable);
    }

    // Settlements & Payment Vouchers (2020) paid to this supplier
    const [settlements, consCoa] = await Promise.all([
      prisma.supplierSettlement.findMany({ where: { supplierId: supplier.id } }),
      prisma.chartOfAccounts.findUnique({ where: { accountCode: '2020' }, select: { id: true } }),
    ]);
    let totalSettled = new Decimal(0);
    for (const s of settlements) {
      totalSettled = totalSettled.plus(s.netPaidAmount);
    }
    if (consCoa) {
      const suppPayments = await prisma.paymentVoucher.findMany({
        where: { partyType: 'SUPPLIER', partyId: supplier.id, debitAccountId: consCoa.id },
        select: { amount: true },
      });
      for (const p of suppPayments) {
        totalSettled = totalSettled.plus(p.amount);
      }
    }

    // Expenses tagged to this supplier
    const supExpenses = await prisma.commissionExpense.findMany({
      where: {
        notes: { contains: `SUPPLIER_ID:${supplier.id}` },
      },
    });
    let totalSupplierExpenses = new Decimal(0);
    for (const exp of supExpenses) {
      totalSupplierExpenses = totalSupplierExpenses.plus(exp.amount);
    }

    // Active agreement commission %
    const activeAgreement = supplier.commissionAgreements[0];
    const commissionPct = activeAgreement ? activeAgreement.commissionPercentage.toString() : '0';

    // Per-item list with reference rate & reference total value (only items with actual received or remaining stock)
    const items = Object.values(itemMap)
      .filter((it) => it.totalReceived.greaterThan(0) || it.totalRemaining.greaterThan(0))
      .map((it) => {
        const avgRefRate = it.totalReceived.isZero()
          ? new Decimal(0)
          : it.totalReferenceValue.dividedBy(it.totalReceived);

        return {
          itemId: Number(it.itemId),
          itemName: it.itemName,
          itemCode: it.itemCode,
          totalReceived: it.totalReceived.toFixed(2),
          totalSold: it.totalSold.toFixed(2),
          totalRemaining: it.totalRemaining.toFixed(2),
          referenceRate: avgRefRate.toFixed(2),
          totalReferenceValue: it.totalReferenceValue.toFixed(2),
          unit: it.batchUnit,
          isExhausted: it.totalRemaining.equals(0) && it.totalReceived.greaterThan(0),
        };
      });

    const totalRecQty = items.reduce((acc, i) => acc + parseFloat(i.totalReceived), 0);
    const totalSoldQty = items.reduce((acc, i) => acc + parseFloat(i.totalSold), 0);
    const totalRemQty = items.reduce((acc, i) => acc + parseFloat(i.totalRemaining), 0);
    const totalReferenceVal = items.reduce((acc, i) => acc + parseFloat(i.totalReferenceValue), 0);

    // Fetch this supplier's individual consignment receipts (for edit / delete / viewing)
    const receiptsRaw = await prisma.consignmentReceipt.findMany({
      where: { supplierId: supplier.id },
      include: {
        items: { include: { item: true } },
      },
      orderBy: { receiptDate: 'desc' },
    });

    const receipts = receiptsRaw.map((r) => {
      const receiptTotalVal = r.items.reduce((acc, it) => {
        const rate = it.referenceRate ? new Decimal(it.referenceRate.toString()) : new Decimal(0);
        return acc.plus(new Decimal(it.enteredQuantity.toString()).times(rate));
      }, new Decimal(0));

      return {
        id: Number(r.id),
        receiptNumber: r.receiptNumber,
        receiptDate: r.receiptDate.toISOString().split('T')[0],
        notes: r.notes,
        totalValue: receiptTotalVal.toFixed(2),
        items: r.items.map((it) => ({
          id: Number(it.id),
          itemId: Number(it.itemId),
          itemName: it.item.name,
          enteredQuantity: it.enteredQuantity.toString(),
          enteredUnitName: it.enteredUnitName,
          referenceRate: it.referenceRate ? it.referenceRate.toString() : '0',
          totalItemValue: it.referenceRate
            ? new Decimal(it.enteredQuantity.toString()).times(it.referenceRate.toString()).toFixed(2)
            : '0',
        })),
      };
    });

    // Only push if supplier has actual consignment history (receipts, batches, sales, or balance)
    const hasConsignmentActivity =
      receipts.length > 0 ||
      batches.length > 0 ||
      saleItems.length > 0 ||
      !new Decimal(supplier.currentBalanceConsignment.toString()).isZero();

    if (hasConsignmentActivity) {
      result.push({
        supplierId: Number(supplier.id),
        supplierName: supplier.name,
        supplierCode: supplier.code,
        supplierPhone: supplier.phone,
        supplierAddress: supplier.address,
        commissionPercentage: commissionPct,
        currentBalanceConsignment: supplier.currentBalanceConsignment.toString(),
        items,
        receipts,
        totalReferenceValue: totalReferenceVal.toFixed(2),
        totalReceivedQty: totalRecQty.toFixed(2),
        totalSoldQty: totalSoldQty.toFixed(2),
        totalRemainingQty: totalRemQty.toFixed(2),
        totalSoldAmount: totalSoldAmount.toFixed(4),
        totalCommissionEarned: totalCommissionEarned.toFixed(4),
        totalSupplierPayable: totalSupplierPayable.toFixed(4),
        totalSettled: totalSettled.toFixed(4),
        totalSupplierExpenses: totalSupplierExpenses.toFixed(4),
        netCommissionFromSupplier: totalCommissionEarned.toFixed(4),
        hasExhaustedItems: items.some((i) => i.isExhausted),
        allItemsExhausted: items.length > 0 && items.every((i) => i.isExhausted),
      });
    }
  }

  return res.json({ success: true, data: result });
});

// ----------------- COMMISSION EXPENSES -----------------
router.get('/expenses', async (_req: Request, res: Response) => {
  const expenses = await prisma.commissionExpense.findMany({
    orderBy: { expenseDate: 'desc' },
  });

  const data = expenses.map((e) => {
    let supplierId: number | null = null;
    let supplierName: string | null = null;
    if (e.notes && e.notes.includes('SUPPLIER_ID:')) {
      const matchId = e.notes.match(/SUPPLIER_ID:(\d+)/);
      const matchName = e.notes.match(/SUPPLIER_NAME:([^|]+)/);
      if (matchId) supplierId = Number(matchId[1]);
      if (matchName) supplierName = matchName[1];
    }
    return {
      id: Number(e.id),
      expenseDate: e.expenseDate,
      description: e.description,
      amount: e.amount.toString(),
      category: e.category,
      notes: e.notes,
      supplierId,
      supplierName,
    };
  });

  return res.json({ success: true, data });
});

router.post('/expenses', requireOwnerAuth, async (req: Request, res: Response) => {
  const rawItems = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.expenses)
      ? req.body.expenses
      : [req.body];

  const created = await dbTx(async (tx) => {
    const list = [];
    for (const item of rawItems) {
      const validated = CommissionExpenseSchema.parse(item);
      const amtDec = toMoney(validated.amount);
      const expense = await tx.commissionExpense.create({
        data: {
          expenseDate: new Date(validated.expenseDate),
          description: validated.description,
          amount: amtDec,
          category: validated.category,
          notes: validated.notes,
        },
      });
      if (validated.notes) {
        const m = validated.notes.match(/SUPPLIER_ID:(\d+)/);
        if (m) {
          await tx.supplier.update({
            where: { id: BigInt(m[1]) },
            data: { currentBalanceConsignment: { decrement: amtDec } },
          });
        }
      }
      list.push(expense);
    }
    return list;
  });

  const isBatch = Array.isArray(req.body) || Array.isArray(req.body?.expenses);
  return res.status(201).json({ success: true, data: isBatch ? created : created[0] });
});

router.delete('/expenses/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  await dbTx(async (tx) => {
    const expense = await tx.commissionExpense.findUnique({
      where: { id: BigInt(req.params.id) },
    });
    if (!expense) return;
    if (expense.notes) {
      const m = expense.notes.match(/SUPPLIER_ID:(\d+)/);
      if (m) {
        await tx.supplier.update({
          where: { id: BigInt(m[1]) },
          data: { currentBalanceConsignment: { increment: expense.amount } },
        });
      }
    }
    await tx.commissionExpense.delete({
      where: { id: expense.id },
    });
  });
  return res.json({ success: true });
});

// =========================================================
// COMMISSION INTAKE — single smart form endpoint
// Supplier (new/existing) + Item (new/existing) + receipt + agreement — sab ek saath
// =========================================================
router.post('/intake', requireOwnerAuth, async (req: Request, res: Response) => {
  const {
    supplierMode,        // 'existing' | 'new'
    supplierId: supId,   // when mode = existing
    supplierName,        // when mode = new
    supplierPhone,       // when mode = new (optional)
    supplierAddress,     // when mode = new (optional)

    itemMode,            // 'existing' | 'new'
    itemId: itmId,       // when mode = existing
    itemName,            // when mode = new
    unitId: uId,         // when unit is selected from list
    unitName,            // when unit name is sent

    quantity,
    pricePerUnit,        // optional reference rate
    extraCharges,        // optional, informational
    description,

    commissionPercentage,
    intakeDate,
  } = req.body as Record<string, string>;

  if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0)
    throw new Error('Quantity sahi nahi hai');
  if (!commissionPercentage || isNaN(parseFloat(commissionPercentage)))
    throw new Error('Commission % sahi nahi hai');

  const result = await dbTx(async (tx) => {

    // ── 1. Resolve Supplier ──────────────────────────────
    let supplier;
    if (supplierMode === 'existing' && supId) {
      supplier = await tx.supplier.findUnique({ where: { id: BigInt(supId) } });
      if (!supplier) throw new Error('Supplier nahi mila');
    } else {
      if (!supplierName?.trim()) throw new Error('Supplier ka naam likhein');
      supplier = await tx.supplier.findFirst({
        where: { name: { equals: supplierName.trim() } },
      });
      if (!supplier) {
        const code = 'SUP-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 1000);
        supplier = await tx.supplier.create({
          data: {
            code,
            name: supplierName.trim(),
            phone: supplierPhone?.trim() || '03000000000',
            address: supplierAddress?.trim() || '',
            openingBalanceOwn: new Decimal(0),
            openingBalanceConsignment: new Decimal(0),
            currentBalanceOwn: new Decimal(0),
            currentBalanceConsignment: new Decimal(0),
          },
        });
      }
    }

    // ── 2. Resolve Unit (Safe from 409 unique code conflicts) ──────
    let resolvedUnit = null;
    if (uId && !isNaN(Number(uId)) && Number(uId) > 0) {
      resolvedUnit = await tx.unit.findUnique({ where: { id: BigInt(uId) } });
    }
    if (!resolvedUnit) {
      const uSearch = ((unitName ?? 'KG').trim()) || 'KG';
      resolvedUnit = await tx.unit.findFirst({
        where: {
          OR: [
            { code: { equals: uSearch } },
            { name: { equals: uSearch } },
            { symbol: { equals: uSearch } },
          ],
        },
      });
    }
    if (!resolvedUnit) {
      const safeCode = ('U-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 100)).toUpperCase();
      resolvedUnit = await tx.unit.create({
        data: {
          code: safeCode,
          name: unitName?.trim() || 'KG',
          symbol: (unitName?.trim() || 'KG').substring(0, 5),
          isBaseUnit: false,
        },
      });
    }

    // ── 3. Resolve Item ──────────────────────────────────
    let item;
    if (itemMode === 'existing' && itmId) {
      item = await tx.item.findUnique({
        where: { id: BigInt(itmId) },
        include: { baseUnit: true, conversions: { include: { unit: true } } },
      });
      if (!item) throw new Error('Item nahi mila');
    } else {
      if (!itemName?.trim()) throw new Error('Item ka naam likhein');
      item = await tx.item.findFirst({
        where: { name: { equals: itemName.trim() } },
        include: { baseUnit: true, conversions: { include: { unit: true } } },
      });
      if (!item) {
        // ensure default category exists
        let cat = await tx.itemCategory.findFirst({ where: { code: 'CONSIGN' } });
        if (!cat) {
          cat = await tx.itemCategory.create({
            data: { code: 'CONSIGN', name: 'Consignment Items' },
          });
        }
        const itemCode = 'ITM-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 1000);
        item = await tx.item.create({
          data: {
            code: itemCode,
            name: itemName.trim(),
            categoryId: cat.id,
            baseUnitId: resolvedUnit.id,
            isActive: true,
          },
          include: { baseUnit: true, conversions: { include: { unit: true } } },
        });
      }
    }

    // ── 4. Upsert Commission Agreement ───────────────────
    const existingAgreement = await tx.commissionAgreement.findFirst({
      where: { supplierId: supplier.id, itemId: item.id, isActive: true },
    });
    if (existingAgreement) {
      await tx.commissionAgreement.update({
        where: { id: existingAgreement.id },
        data: { commissionPercentage: new Decimal(commissionPercentage) },
      });
    } else {
      await tx.commissionAgreement.create({
        data: {
          supplierId: supplier.id,
          itemId: item.id,
          commissionPercentage: new Decimal(commissionPercentage),
          effectiveStartDate: intakeDate ? new Date(intakeDate) : new Date(),
          isActive: true,
        },
      });
    }

    // ── 5. Auto-number receipt (Safe from collisions) ────────────
    const seq = await tx.documentSequence.upsert({
      where: { sequenceType: 'CONSIGNMENT_RECEIPT' },
      update: { currentNumber: { increment: 1 } },
      create: { sequenceType: 'CONSIGNMENT_RECEIPT', prefix: 'CON-', currentNumber: BigInt(1), paddingLength: 6 },
    });
    let receiptNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(Number(seq.paddingLength), '0')}`;
    let exists = await tx.consignmentReceipt.findUnique({ where: { receiptNumber } });
    while (exists) {
      const updatedSeq = await tx.documentSequence.update({
        where: { sequenceType: 'CONSIGNMENT_RECEIPT' },
        data: { currentNumber: { increment: 1 } },
      });
      receiptNumber = `${updatedSeq.prefix}${updatedSeq.currentNumber.toString().padStart(Number(updatedSeq.paddingLength), '0')}`;
      exists = await tx.consignmentReceipt.findUnique({ where: { receiptNumber } });
    }
    const receiptDate = intakeDate ? new Date(intakeDate) : new Date();

    const receipt = await tx.consignmentReceipt.create({
      data: {
        receiptNumber,
        supplierId: supplier.id,
        receiptDate,
        notes: description || null,
      },
    });

    // ── 6. Receipt item + stock batch + movement ──────────
    const baseQty = new Decimal(quantity);
    const batchNumber = `CONS-${supplier.code}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // extra charges stored in notes (informational only, not in financials)
    const notesText = [
      description || '',
      extraCharges && parseFloat(extraCharges) > 0 ? `Extra charges: Rs.${extraCharges}` : '',
    ].filter(Boolean).join(' | ') || null;

    const unitDisplayName = resolvedUnit ? resolvedUnit.name : item.baseUnit.name;

    await tx.consignmentReceiptItem.create({
      data: {
        consignmentReceiptId: receipt.id,
        itemId: item.id,
        enteredQuantity: baseQty,
        enteredUnitName: unitDisplayName,
        conversionFactorSnap: new Decimal(1),
        baseQuantity: baseQty,
        baseUnitName: item.baseUnit.name,
        referenceRate: pricePerUnit && parseFloat(pricePerUnit) > 0 ? toMoney(pricePerUnit) : null,
        batchNumber,
        notes: notesText,
      },
    });

    const batch = await tx.stockBatch.create({
      data: {
        batchNumber,
        itemId: item.id,
        ownershipType: 'CONSIGNMENT',
        sourceType: 'CONSIGNMENT_RECEIPT',
        sourceDocumentId: receipt.id,
        supplierId: supplier.id,
        receivedDate: receiptDate,
        initialBaseQty: baseQty,
        remainingBaseQty: baseQty,
        baseUnitName: item.baseUnit.name,
        unitCost: new Decimal(0),
        referenceValuation: pricePerUnit && parseFloat(pricePerUnit) > 0
          ? toMoney(new Decimal(pricePerUnit).times(quantity))
          : null,
        status: 'ACTIVE',
      },
    });

    await tx.stockMovement.create({
      data: {
        batchId: batch.id,
        itemId: item.id,
        ownershipType: 'CONSIGNMENT',
        supplierId: supplier.id,
        movementType: 'CONSIGNMENT_IN',
        enteredQuantity: baseQty,
        enteredUnitName: item.baseUnit.name,
        conversionFactorSnap: new Decimal(1),
        baseQuantity: baseQty,
        baseUnitName: item.baseUnit.name,
        referenceType: 'CONSIGNMENT_RECEIPT',
        referenceId: receipt.id,
        referenceNumber: receiptNumber,
        movementDate: receiptDate,
      },
    });

    // Auto-record extra charges (like Bilti/Freight) as a Commission Expense tied to this supplier & deduct from supplier balance
    if (extraCharges && parseFloat(extraCharges) > 0) {
      const extraAmt = toMoney(extraCharges);
      await tx.commissionExpense.create({
        data: {
          expenseDate: receiptDate,
          description: `${description || 'Bilti'} (${receiptNumber} - ${supplier.name})`,
          amount: extraAmt,
          category: 'TRANSPORT',
          notes: `SUPPLIER_ID:${supplier.id}|SUPPLIER_NAME:${supplier.name}`,
        },
      });
      await tx.supplier.update({
        where: { id: supplier.id },
        data: { currentBalanceConsignment: { decrement: extraAmt } },
      });
    }

    return {
      supplierId: Number(supplier.id),
      supplierName: supplier.name,
      itemName: item.name,
      receiptNumber,
      quantity: baseQty.toFixed(3),
      unit: item.baseUnit.name,
      commissionPercentage,
    };
  });

  return res.status(201).json({ success: true, data: result });
});

// ----------------- COMMISSION FINAL SUMMARY -----------------
// Commission earned is 100% ours; expenses are deducted from supplier payable
router.get('/final-summary', async (_req: Request, res: Response) => {
  // All consignment sale items
  const saleItems = await prisma.salesInvoiceItem.findMany({
    where: { ownershipType: 'CONSIGNMENT' },
  });

  let totalSoldAmount = new Decimal(0);
  let totalCommissionEarned = new Decimal(0);
  let totalSupplierPayable = new Decimal(0);

  for (const si of saleItems) {
    totalSoldAmount = totalSoldAmount.plus(si.netAmount);
    totalCommissionEarned = totalCommissionEarned.plus(si.commissionAmount);
    totalSupplierPayable = totalSupplierPayable.plus(si.supplierPayable);
  }

  // All expenses (deducted from suppliers, NOT from our commission)
  const expenses = await prisma.commissionExpense.findMany();
  let totalExpenses = new Decimal(0);
  for (const exp of expenses) {
    totalExpenses = totalExpenses.plus(exp.amount);
  }

  // Already settled amount (settlements + payment vouchers on 2020)
  const [settlements, consCoa] = await Promise.all([
    prisma.supplierSettlement.findMany(),
    prisma.chartOfAccounts.findUnique({ where: { accountCode: '2020' }, select: { id: true } }),
  ]);
  let totalSettled = new Decimal(0);
  for (const s of settlements) {
    totalSettled = totalSettled.plus(s.netPaidAmount);
  }
  if (consCoa) {
    const suppPayments = await prisma.paymentVoucher.findMany({
      where: { partyType: 'SUPPLIER', debitAccountId: consCoa.id },
      select: { amount: true },
    });
    for (const p of suppPayments) {
      totalSettled = totalSettled.plus(p.amount);
    }
  }

  const netCommission = totalCommissionEarned;
  const pendingSupplierPayable = totalSupplierPayable.minus(totalExpenses).minus(totalSettled);

  return res.json({
    success: true,
    data: {
      totalSoldAmount: totalSoldAmount.toFixed(4),
      totalCommissionEarned: totalCommissionEarned.toFixed(4),
      totalSupplierPayable: totalSupplierPayable.toFixed(4),
      totalExpenses: totalExpenses.toFixed(4),
      totalSettledToSuppliers: totalSettled.toFixed(4),
      netCommission: netCommission.toFixed(4),
      pendingSupplierPayable: pendingSupplierPayable.toFixed(4),
    },
  });
});

export const commissionRoutes = router;
