import { Router, type Request, type Response } from 'express';
import { prisma, dbTx } from '../../database/prisma.js';
import { PurchaseCreateSchema, PurchaseReturnCreateSchema } from '@erp/validation';
import { requireOwnerAuth } from '../../middleware/auth.js';
import { calculateBaseQuantity, Decimal, toMoney, toQuantity } from '@erp/business-rules';
import { createBalancedJournalEntry } from '../../accounting/posting-engine.js';

const router = Router();

// List Purchases
router.get('/', async (_req: Request, res: Response) => {
  const purchases = await prisma.purchaseInvoice.findMany({
    include: {
      supplier: true,
      items: { include: { item: true } },
    },
    orderBy: { invoiceDate: 'desc' },
  });
  return res.json({ success: true, data: purchases });
});

// Create Own-Stock Purchase Invoice
router.post('/', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = PurchaseCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: BigInt(validated.supplierId) },
    });
    if (!supplier) throw new Error(`Supplier ID ${validated.supplierId} not found`);

    let totalGross = new Decimal(0);
    let totalDiscount = new Decimal(0);
    let totalFreight = new Decimal(0);
    let totalLoading = new Decimal(0);
    let totalNetLanded = new Decimal(0);

    // Compute line items & conversions
    const preparedLines = [];
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
      const rateDec = toMoney(line.ratePerEnteredUnit);
      const lineGross = toMoney(toQuantity(line.enteredQuantity).times(rateDec));
      const lineDisc = toMoney(line.discountAmount);
      const lineFreight = toMoney(line.freightAllocation);
      const lineLoading = toMoney(line.loadingAllocation);
      const lineNet = lineGross.minus(lineDisc).plus(lineFreight).plus(lineLoading);

      // Landed unit cost per base unit (KG)
      const unitLandedCost = toMoney(lineNet.dividedBy(baseQtyDec));

      totalGross = totalGross.plus(lineGross);
      totalDiscount = totalDiscount.plus(lineDisc);
      totalFreight = totalFreight.plus(lineFreight);
      totalLoading = totalLoading.plus(lineLoading);
      totalNetLanded = totalNetLanded.plus(lineNet);

      preparedLines.push({
        itemId: item.id,
        enteredQuantity: toQuantity(line.enteredQuantity),
        enteredUnitName: unitName,
        conversionFactorSnap: new Decimal(conversion.multiplierToBase),
        baseQuantity: baseQtyDec,
        baseUnitName: conversion.baseUnit,
        ratePerEnteredUnit: rateDec,
        grossAmount: lineGross,
        discountAmount: lineDisc,
        freightAllocated: lineFreight,
        loadingAllocated: lineLoading,
        netLandedAmount: lineNet,
        unitLandedCost,
        batchNumber: line.batchNumber || `PUR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      });
    }

    const paidAmountDec = toMoney(validated.paidAmount);
    const remainingBalanceDec = totalNetLanded.minus(paidAmountDec);

    // Create Purchase Invoice Header
    const invoice = await tx.purchaseInvoice.create({
      data: {
        invoiceNumber: validated.invoiceNumber,
        supplierId: supplier.id,
        invoiceDate: new Date(validated.invoiceDate),
        paymentMethod: validated.paymentMethod,
        grossAmount: totalGross,
        discountAmount: totalDiscount,
        freightAmount: totalFreight,
        loadingAmount: totalLoading,
        netLandedAmount: totalNetLanded,
        paidAmount: paidAmountDec,
        remainingBalance: remainingBalanceDec,
        notes: validated.notes,
        items: {
          create: preparedLines.map((pl) => ({
            itemId: pl.itemId,
            enteredQuantity: pl.enteredQuantity,
            enteredUnitName: pl.enteredUnitName,
            conversionFactorSnap: pl.conversionFactorSnap,
            baseQuantity: pl.baseQuantity,
            baseUnitName: pl.baseUnitName,
            ratePerEnteredUnit: pl.ratePerEnteredUnit,
            grossAmount: pl.grossAmount,
            discountAmount: pl.discountAmount,
            freightAllocated: pl.freightAllocated,
            loadingAllocated: pl.loadingAllocated,
            netLandedAmount: pl.netLandedAmount,
            batchNumber: pl.batchNumber,
          })),
        },
      },
    });

    // Create Stock Batches & Movements for each purchased line
    for (const pl of preparedLines) {
      const batch = await tx.stockBatch.create({
        data: {
          batchNumber: pl.batchNumber,
          itemId: pl.itemId,
          ownershipType: 'OWN',
          sourceType: 'PURCHASE',
          sourceDocumentId: invoice.id,
          supplierId: supplier.id,
          receivedDate: new Date(validated.invoiceDate),
          initialBaseQty: pl.baseQuantity,
          remainingBaseQty: pl.baseQuantity,
          baseUnitName: pl.baseUnitName,
          unitCost: pl.unitLandedCost,
          status: 'ACTIVE',
        },
      });

      await tx.stockMovement.create({
        data: {
          batchId: batch.id,
          itemId: pl.itemId,
          ownershipType: 'OWN',
          supplierId: supplier.id,
          movementType: 'PURCHASE_IN',
          enteredQuantity: pl.enteredQuantity,
          enteredUnitName: pl.enteredUnitName,
          conversionFactorSnap: pl.conversionFactorSnap,
          baseQuantity: pl.baseQuantity,
          baseUnitName: pl.baseUnitName,
          referenceType: 'PURCHASE_INVOICE',
          referenceId: invoice.id,
          referenceNumber: invoice.invoiceNumber,
          movementDate: new Date(validated.invoiceDate),
        },
      });
    }

    // Update Supplier Balance (AP for own purchases)
    if (remainingBalanceDec.greaterThan(0)) {
      await tx.supplier.update({
        where: { id: supplier.id },
        data: {
          currentBalanceOwn: { increment: remainingBalanceDec },
        },
      });
    }

    // Update Cash/Bank Account if paid
    let usedCashAccount: { id: bigint; accountType: string } | null = null;
    if (paidAmountDec.greaterThan(0)) {
      if (validated.cashBankAccountId) {
        usedCashAccount = await tx.cashBankAccount.findUnique({
          where: { id: BigInt(validated.cashBankAccountId) },
          select: { id: true, accountType: true },
        });
      }
      if (!usedCashAccount) {
        usedCashAccount = await tx.cashBankAccount.findFirst({
          select: { id: true, accountType: true },
        });
      }
      if (usedCashAccount) {
        await tx.cashBankAccount.update({
          where: { id: usedCashAccount.id },
          data: { currentBalance: { decrement: paidAmountDec } },
        });
      }
    }

    // Double-Entry Journal Entry
    // Debit: 1040 (Own Inventory Asset) = Total Net Landed
    // Credit: 1010/1011 (Cash/Bank) = Paid Amount (if any)
    // Credit: 2010 (Accounts Payable - Own Suppliers) = Remaining Balance (if any)
    type PurchaseJournalLine = {
      accountCode: string;
      debit: Decimal.Value;
      credit: Decimal.Value;
      partyType?: 'CUSTOMER' | 'SUPPLIER';
      partyId?: bigint;
      description?: string;
    };

    const journalLines: PurchaseJournalLine[] = [
      {
        accountCode: '1040',
        debit: totalNetLanded,
        credit: new Decimal(0),
        description: `Own stock purchase inventory asset ${invoice.invoiceNumber}`,
      },
    ];

    if (paidAmountDec.greaterThan(0)) {
      journalLines.push({
        accountCode: usedCashAccount?.accountType === 'BANK' ? '1011' : '1010',
        debit: new Decimal(0),
        credit: paidAmountDec,
        description: `Payment for purchase ${invoice.invoiceNumber}`,
      });
    }

    if (remainingBalanceDec.greaterThan(0)) {
      journalLines.push({
        accountCode: '2010',
        debit: new Decimal(0),
        credit: remainingBalanceDec,
        partyType: 'SUPPLIER',
        partyId: supplier.id,
        description: `Supplier payable for purchase ${invoice.invoiceNumber}`,
      });
    }

    await createBalancedJournalEntry({
      tx,
      entryDate: validated.invoiceDate,
      referenceType: 'PURCHASE_INVOICE',
      referenceId: invoice.id,
      referenceNumber: invoice.invoiceNumber,
      narration: `Purchase invoice from ${supplier.name}`,
      lines: journalLines,
    });

    // Outbox Sync Event
    await tx.syncOutbox.create({
      data: {
        aggregateType: 'PURCHASE_INVOICE',
        aggregateId: invoice.id,
        eventType: 'PURCHASE_POSTED',
        payloadJson: JSON.stringify({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }),
      },
    });

    return invoice;
  });

  return res.status(201).json({ success: true, data: result });
});

// List Purchase Returns
router.get('/returns', async (_req: Request, res: Response) => {
  const returns = await prisma.purchaseReturn.findMany({
    include: {
      supplier: true,
      purchaseInvoice: true,
      items: true,
    },
    orderBy: { returnDate: 'desc' },
  });
  return res.json({ success: true, data: returns });
});

// Create Purchase Return
router.post('/returns', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = PurchaseReturnCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const invoice = await tx.purchaseInvoice.findUnique({
      where: { id: BigInt(validated.purchaseInvoiceId) },
    });
    if (!invoice) throw new Error(`Purchase invoice ID ${validated.purchaseInvoiceId} not found`);

    const supplier = await tx.supplier.findUnique({
      where: { id: BigInt(validated.supplierId) },
    });
    if (!supplier) throw new Error(`Supplier ID ${validated.supplierId} not found`);

    let returnNumber = validated.returnNumber;
    if (!returnNumber) {
      const seq = await tx.documentSequence.upsert({
        where: { sequenceType: 'PURCHASE_RETURN' },
        update: { currentNumber: { increment: 1 } },
        create: { sequenceType: 'PURCHASE_RETURN', prefix: 'PRTN-', currentNumber: BigInt(1), paddingLength: 5 },
      });
      returnNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;
    }

    let totalReturnAmount = new Decimal(0);
    const preparedItems = [];

    for (const item of validated.items) {
      const batch = await tx.stockBatch.findUnique({
        where: { id: BigInt(item.batchId) },
      });
      if (!batch) throw new Error(`Batch ID ${item.batchId} not found`);
      if (batch.ownershipType !== 'OWN') {
        throw new Error(`Batch ${batch.batchNumber} is not own-stock. Consignment goods must be returned via consignment module.`);
      }

      const qtyToReturn = toQuantity(item.baseQuantity);
      if (new Decimal(batch.remainingBaseQty).lessThan(qtyToReturn)) {
        throw new Error(`Insufficient stock in batch ${batch.batchNumber} to return. Available: ${batch.remainingBaseQty}, Requested: ${qtyToReturn}`);
      }

      const unitCost = toMoney(item.unitCost);
      const lineCost = unitCost.times(qtyToReturn);
      totalReturnAmount = totalReturnAmount.plus(lineCost);

      preparedItems.push({
        batch,
        qtyToReturn,
        unitCost,
        lineCost,
      });
    }

    // Create Purchase Return Header
    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        returnNumber,
        purchaseInvoiceId: invoice.id,
        supplierId: supplier.id,
        returnDate: new Date(validated.returnDate),
        totalAmount: totalReturnAmount,
        reason: validated.reason,
      },
    });

    // Create Return Items, update batches, log stock movement
    for (const pi of preparedItems) {
      await tx.purchaseReturnItem.create({
        data: {
          purchaseReturnId: purchaseReturn.id,
          batchId: pi.batch.id,
          baseQuantity: pi.qtyToReturn,
          unitCost: pi.unitCost,
          totalCost: pi.lineCost,
        },
      });

      const newRemaining = new Decimal(pi.batch.remainingBaseQty).minus(pi.qtyToReturn);
      await tx.stockBatch.update({
        where: { id: pi.batch.id },
        data: {
          remainingBaseQty: newRemaining,
          status: newRemaining.equals(0) ? 'EXHAUSTED' : 'ACTIVE',
        },
      });

      await tx.stockMovement.create({
        data: {
          batchId: pi.batch.id,
          itemId: pi.batch.itemId,
          ownershipType: 'OWN',
          supplierId: supplier.id,
          movementType: 'PURCHASE_RETURN_OUT',
          enteredQuantity: pi.qtyToReturn,
          enteredUnitName: 'KG',
          conversionFactorSnap: new Decimal(1),
          baseQuantity: pi.qtyToReturn,
          baseUnitName: 'KG',
          referenceType: 'PURCHASE_RETURN',
          referenceId: purchaseReturn.id,
          referenceNumber: returnNumber,
          movementDate: new Date(validated.returnDate),
        },
      });
    }

    // Decrement supplier payable balance (Own stock AP)
    await tx.supplier.update({
      where: { id: supplier.id },
      data: {
        currentBalanceOwn: { decrement: totalReturnAmount },
      },
    });

    // Balanced Journal Entry:
    // Debit: 2010 (Accounts Payable - Own Suppliers) = totalReturnAmount
    // Credit: 1040 (Own Inventory Asset) = totalReturnAmount
    await createBalancedJournalEntry({
      tx,
      entryDate: validated.returnDate,
      referenceType: 'PURCHASE_RETURN',
      referenceId: purchaseReturn.id,
      referenceNumber: returnNumber,
      narration: `Purchase return to ${supplier.name} for invoice ${invoice.invoiceNumber}`,
      lines: [
        {
          accountCode: '2010',
          debit: totalReturnAmount,
          credit: new Decimal(0),
          partyType: 'SUPPLIER',
          partyId: supplier.id,
          description: `AP reduction for purchase return ${returnNumber}`,
        },
        {
          accountCode: '1040',
          debit: new Decimal(0),
          credit: totalReturnAmount,
          description: `Inventory reduction for purchase return ${returnNumber}`,
        },
      ],
    });

    return purchaseReturn;
  });

  return res.status(201).json({ success: true, data: result });
});

// Void / Delete Purchase Invoice (With Full Inventory & Accounting Reversal)
router.delete('/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const purchaseId = BigInt(req.params.id);

  const result = await dbTx(async (tx) => {
    const invoice = await tx.purchaseInvoice.findUnique({
      where: { id: purchaseId },
      include: {
        items: true,
        supplier: true,
      },
    });

    if (!invoice) {
      throw new Error(`Purchase invoice ID ${purchaseId} not found`);
    }

    // Find all batches created from this purchase
    const batches = await tx.stockBatch.findMany({
      where: {
        sourceType: 'PURCHASE',
        sourceDocumentId: invoice.id,
      },
    });

    // Verify whether any batch has been sold/allocated
    for (const batch of batches) {
      if (new Decimal(batch.remainingBaseQty).lessThan(new Decimal(batch.initialBaseQty))) {
        throw new Error(
          `CANNOT_DELETE_PURCHASE: Batch '${batch.batchNumber}' has already been partially or fully sold. Remaining: ${batch.remainingBaseQty} / Initial: ${batch.initialBaseQty}. Please return or reverse the sales first.`
        );
      }
    }

    // 1. Revert Supplier Payable Balance
    if (new Decimal(invoice.remainingBalance).greaterThan(0)) {
      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: {
          currentBalanceOwn: { decrement: invoice.remainingBalance },
        },
      });
    }

    // If supplier has no other purchases or raw stock remaining, reset balance to 0
    const remainingPurchases = await tx.purchaseInvoice.count({
      where: { supplierId: invoice.supplierId, id: { not: invoice.id } },
    });
    const remainingOpenings = await tx.openingStockItem.count({
      where: { supplierId: invoice.supplierId },
    });
    if (remainingPurchases === 0 && remainingOpenings === 0) {
      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: {
          currentBalanceOwn: new Decimal(0),
          openingBalanceOwn: new Decimal(0),
        },
      });
    }

    // 2. Find Journal Entries linked to this purchase (before deleting, so we know which Cash/Bank account was used)
    const journals = await tx.journalEntry.findMany({
      where: { referenceType: 'PURCHASE_INVOICE', referenceId: invoice.id },
      include: { lines: { select: { accountId: true, credit: true } } },
    });

    // 3. Revert exact Cash/Bank Account if cash was paid
    if (new Decimal(invoice.paidAmount).greaterThan(0)) {
      const allCashAccts = await tx.cashBankAccount.findMany();
      const cashGlMap = new Map(allCashAccts.map((a) => [a.glAccountId.toString(), a]));
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
          data: { currentBalance: { increment: invoice.paidAmount } },
        });
      }
    }

    // 4. Delete Journal Entries linked to this purchase
    for (const j of journals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    // 4. Delete Stock Movements
    await tx.stockMovement.deleteMany({
      where: { referenceType: 'PURCHASE_INVOICE', referenceId: invoice.id },
    });

    // 5. Delete Stock Batches
    const batchIds = batches.map((b) => b.id);
    if (batchIds.length > 0) {
      await tx.stockBatch.deleteMany({
        where: { id: { in: batchIds } },
      });
    }

    // 6. Delete Purchase Line Items and Header
    const itemIds = invoice.items.map((it) => it.itemId);

    await tx.purchaseInvoiceItem.deleteMany({
      where: { purchaseInvoiceId: invoice.id },
    });

    await tx.purchaseInvoice.delete({
      where: { id: invoice.id },
    });

    // 7. Clean up any items that now have 0 history and were only created for this purchase
    for (const itemId of itemIds) {
      const [batchCount, movementCount, openingCount, purchaseCount, saleCount, consignmentCount, agreementCount] =
        await Promise.all([
          tx.stockBatch.count({ where: { itemId } }),
          tx.stockMovement.count({ where: { itemId } }),
          tx.openingStockItem.count({ where: { itemId } }),
          tx.purchaseInvoiceItem.count({ where: { itemId } }),
          tx.salesInvoiceItem.count({ where: { itemId } }),
          tx.consignmentReceiptItem.count({ where: { itemId } }),
          tx.commissionAgreement.count({ where: { itemId } }),
        ]);

      if (
        batchCount === 0 &&
        movementCount === 0 &&
        openingCount === 0 &&
        purchaseCount === 0 &&
        saleCount === 0 &&
        consignmentCount === 0 &&
        agreementCount === 0
      ) {
        await tx.itemUnitConversion.deleteMany({ where: { itemId } });
        await tx.item.delete({ where: { id: itemId } });
      }
    }

    return {
      invoiceNumber: invoice.invoiceNumber,
      message: `Purchase invoice ${invoice.invoiceNumber} deleted and reversed successfully.`,
    };
  });

  return res.json({ success: true, data: result });
});

// Get Single Purchase Invoice (placed after static routes like /returns)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id: BigInt(req.params.id) },
      include: {
        supplier: true,
        items: { include: { item: true } },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    return res.json({ success: true, data: invoice });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase invoice' });
  }
});

export const purchaseRoutes = router;
