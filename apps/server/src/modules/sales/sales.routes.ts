import { Router, type Request, type Response } from 'express';
import { prisma, dbTx } from '../../database/prisma.js';
import { SaleCreateSchema, SalesReturnCreateSchema } from '@erp/validation';
import { requireDeviceOrOwnerAuth, type AuthenticatedRequest } from '../../middleware/auth.js';
import {
  calculateBaseQuantity,
  allocateFifo,
  calculateCommissionFinancials,
  Decimal,
  toMoney,
  toQuantity,
  formatMoney,
  type EligibleBatchInput,
} from '@erp/business-rules';
import { createBalancedJournalEntry } from '../../accounting/posting-engine.js';
import type { CommissionAgreementDto } from '@erp/shared-types';

const router = Router();

// List Sales Invoices
router.get('/', async (_req: Request, res: Response) => {
  const sales = await prisma.salesInvoice.findMany({
    include: {
      customer: true,
      items: {
        include: {
          item: true,
          stockAllocations: { include: { batch: true } },
        },
      },
    },
    orderBy: { invoiceDate: 'desc' },
  });
  return res.json({ success: true, data: sales });
});

// Post Common Sale Invoice (Own Stock + Consignment Stock)
router.post('/', requireDeviceOrOwnerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const validated = SaleCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: BigInt(validated.customerId) },
    });
    if (!customer) throw new Error(`Customer ID ${validated.customerId} not found`);

    // Fetch active commission agreements for resolution
    const agreementsRaw = await tx.commissionAgreement.findMany({
      where: { isActive: true },
    });
    const agreements: CommissionAgreementDto[] = agreementsRaw.map((a) => ({
      id: Number(a.id),
      supplierId: Number(a.supplierId),
      itemId: a.itemId ? Number(a.itemId) : undefined,
      commissionPercentage: a.commissionPercentage.toString(),
      effectiveStartDate: a.effectiveStartDate.toISOString(),
      effectiveEndDate: a.effectiveEndDate ? a.effectiveEndDate.toISOString() : undefined,
      isActive: a.isActive,
    }));

    // Auto-generate invoice number if missing
    let invoiceNumber = validated.invoiceNumber;
    if (!invoiceNumber) {
      const seq = await tx.documentSequence.upsert({
        where: { sequenceType: 'SALE_INVOICE' },
        update: { currentNumber: { increment: 1 } },
        create: { sequenceType: 'SALE_INVOICE', prefix: 'INV-', currentNumber: BigInt(1), paddingLength: 5 },
      });
      invoiceNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;
    }

    let invoiceGross = new Decimal(0);
    let invoiceDiscount = new Decimal(0);
    let invoiceNet = new Decimal(0);

    let totalOwnRevenue = new Decimal(0);
    let totalOwnCogs = new Decimal(0);
    let totalCommissionIncome = new Decimal(0);

    const preparedItems = [];

    // Process each line item
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
      const lineNet = lineGross.minus(lineDisc);

      invoiceGross = invoiceGross.plus(lineGross);
      invoiceDiscount = invoiceDiscount.plus(lineDisc);
      invoiceNet = invoiceNet.plus(lineNet);

      // Lock eligible stock batches for update
      const supplierIdBigInt = line.supplierId ? BigInt(line.supplierId) : null;
      const batchesRaw = await tx.stockBatch.findMany({
        where: {
          itemId: item.id,
          ownershipType: line.ownershipType,
          supplierId: line.ownershipType === 'CONSIGNMENT' ? supplierIdBigInt : undefined,
          remainingBaseQty: { gt: 0 },
          status: 'ACTIVE',
        },
        orderBy: [{ receivedDate: 'asc' }, { id: 'asc' }],
      });

      const eligibleInputs: EligibleBatchInput[] = batchesRaw.map((b) => ({
        id: Number(b.id),
        batchNumber: b.batchNumber,
        ownershipType: b.ownershipType,
        supplierId: b.supplierId ? Number(b.supplierId) : null,
        receivedDate: b.receivedDate,
        remainingBaseQty: b.remainingBaseQty.toString(),
        unitCost: b.unitCost.toString(),
      }));

      // FIFO Allocation Engine
      const allocationResult = allocateFifo(
        eligibleInputs,
        baseQtyDec,
        line.ownershipType,
        line.supplierId ? Number(line.supplierId) : null
      );

      // Financials breakdown based on ownership
      let commissionPct = new Decimal(0);
      let commissionAmt = new Decimal(0);
      let supplierPayable = new Decimal(0);
      let lineCogs = new Decimal(0);

      if (line.ownershipType === 'OWN') {
        totalOwnRevenue = totalOwnRevenue.plus(lineNet);
        lineCogs = new Decimal(allocationResult.totalCogs);
        totalOwnCogs = totalOwnCogs.plus(lineCogs);
      } else {
        // Consignment: strictly percentage commission snapshot
        if (!line.supplierId) {
          throw new Error('Consignment sale line requires an explicit supplier selection.');
        }

        const commCalc = calculateCommissionFinancials({
          baseQuantity: baseQtyDec,
          ratePerBaseUnit: lineNet.dividedBy(baseQtyDec),
          discountAmount: lineDisc,
          agreements,
          supplierId: Number(line.supplierId),
          itemId: Number(item.id),
          transactionDate: validated.invoiceDate,
        });

        commissionPct = new Decimal(commCalc.commissionPercentage);
        commissionAmt = new Decimal(commCalc.commissionAmount);
        supplierPayable = new Decimal(commCalc.supplierPayableAmount);

        totalCommissionIncome = totalCommissionIncome.plus(commissionAmt);

        // Update Supplier Consignment Payable Balance
        await tx.supplier.update({
          where: { id: supplierIdBigInt! },
          data: {
            currentBalanceConsignment: { increment: supplierPayable },
          },
        });
      }

      preparedItems.push({
        itemId: item.id,
        ownershipType: line.ownershipType,
        supplierId: supplierIdBigInt,
        enteredQuantity: toQuantity(line.enteredQuantity),
        enteredUnitName: unitName,
        conversionFactorSnap: new Decimal(conversion.multiplierToBase),
        baseQuantity: baseQtyDec,
        baseUnitName: conversion.baseUnit,
        ratePerEnteredUnit: rateDec,
        grossAmount: lineGross,
        discountAmount: lineDisc,
        netAmount: lineNet,
        commissionPercentage: commissionPct,
        commissionAmount: commissionAmt,
        supplierPayable,
        cogsAmount: lineCogs,
        allocations: allocationResult.allocations,
      });
    }

    const paidAmountDec = toMoney(validated.paidAmount);
    const remainingBalanceDec = invoiceNet.minus(paidAmountDec);

    // Create Invoice Header
    const invoice = await tx.salesInvoice.create({
      data: {
        invoiceNumber,
        customerId: customer.id,
        invoiceDate: new Date(validated.invoiceDate),
        paymentMethod: validated.paymentMethod,
        grossAmount: invoiceGross,
        discountAmount: invoiceDiscount,
        netInvoiceAmount: invoiceNet,
        paidAmount: paidAmountDec,
        remainingBalance: remainingBalanceDec,
        notes: validated.notes,
      },
    });

    // Save Line Items, Allocations, and deduct Batch balances
    for (const pi of preparedItems) {
      const saleItem = await tx.salesInvoiceItem.create({
        data: {
          salesInvoiceId: invoice.id,
          itemId: pi.itemId,
          ownershipType: pi.ownershipType,
          supplierId: pi.supplierId,
          enteredQuantity: pi.enteredQuantity,
          enteredUnitName: pi.enteredUnitName,
          conversionFactorSnap: pi.conversionFactorSnap,
          baseQuantity: pi.baseQuantity,
          baseUnitName: pi.baseUnitName,
          ratePerEnteredUnit: pi.ratePerEnteredUnit,
          grossAmount: pi.grossAmount,
          discountAmount: pi.discountAmount,
          netAmount: pi.netAmount,
          commissionPercentage: pi.commissionPercentage,
          commissionAmount: pi.commissionAmount,
          supplierPayable: pi.supplierPayable,
          cogsAmount: pi.cogsAmount,
        },
      });

      for (const alloc of pi.allocations) {
        // Create stock allocation record
        await tx.stockAllocation.create({
          data: {
            batchId: BigInt(alloc.batchId),
            salesInvoiceItemId: saleItem.id,
            allocatedBaseQty: new Decimal(alloc.allocatedBaseQty),
            unitCost: new Decimal(alloc.unitCost),
            totalCost: new Decimal(alloc.totalCost),
          },
        });

        // Decrement Batch remaining quantity transactionally
        await tx.stockBatch.update({
          where: { id: BigInt(alloc.batchId) },
          data: {
            remainingBaseQty: new Decimal(alloc.newRemainingBaseQty),
            status: alloc.isExhausted ? 'EXHAUSTED' : 'ACTIVE',
          },
        });

        // Immutable Stock Movement
        await tx.stockMovement.create({
          data: {
            batchId: BigInt(alloc.batchId),
            itemId: pi.itemId,
            ownershipType: pi.ownershipType,
            supplierId: pi.supplierId,
            movementType: 'SALE_OUT',
            enteredQuantity: new Decimal(alloc.allocatedBaseQty),
            enteredUnitName: 'KG',
            conversionFactorSnap: new Decimal(1),
            baseQuantity: new Decimal(alloc.allocatedBaseQty),
            baseUnitName: 'KG',
            referenceType: 'SALE_INVOICE',
            referenceId: invoice.id,
            referenceNumber: invoice.invoiceNumber,
            movementDate: new Date(validated.invoiceDate),
          },
        });
      }
    }

    // Update Customer Balance
    if (remainingBalanceDec.greaterThan(0)) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          currentBalance: { increment: remainingBalanceDec },
        },
      });
    }

    // Update Cash/Bank Account if cash paid at counter
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
          data: { currentBalance: { increment: paidAmountDec } },
        });
      }
    }

    // -----------------------------------------------------------------
    // DOUBLE-ENTRY ACCOUNTING POSTING
    // -----------------------------------------------------------------
    // 1. PRIMARY SALE JOURNAL
    // Debit: 1020 (Customer Accounts Receivable) = invoiceNet
    // Credit: 4010 (Own Sales Revenue) = totalOwnRevenue (if any)
    // Credit: 4020 (Commission Income) = totalCommissionIncome (if any)
    // Credit: 2020 (Commission Supplier Payable) = sum(supplierPayable) (if any)
    type JournalLine = {
      accountCode: string;
      debit: Decimal.Value;
      credit: Decimal.Value;
      partyType?: 'CUSTOMER' | 'SUPPLIER';
      partyId?: bigint;
      description?: string;
    };

    const saleJournalLines: JournalLine[] = [
      {
        accountCode: '1020',
        debit: invoiceNet,
        credit: new Decimal(0),
        partyType: 'CUSTOMER',
        partyId: customer.id,
        description: `Sale invoice receivable ${invoice.invoiceNumber}`,
      },
    ];

    if (totalOwnRevenue.greaterThan(0)) {
      saleJournalLines.push({
        accountCode: '4010',
        debit: new Decimal(0),
        credit: totalOwnRevenue,
        description: `Own stock sales revenue ${invoice.invoiceNumber}`,
      });
    }

    if (totalCommissionIncome.greaterThan(0)) {
      saleJournalLines.push({
        accountCode: '4020',
        debit: new Decimal(0),
        credit: totalCommissionIncome,
        description: `Consignment commission income ${invoice.invoiceNumber}`,
      });
    }

    // Consignment Supplier Payables (per supplier)
    const supplierPayableMap = new Map<bigint, Decimal>();
    preparedItems.forEach((item) => {
      if (item.supplierId && item.supplierPayable.greaterThan(0)) {
        const cur = supplierPayableMap.get(item.supplierId) || new Decimal(0);
        supplierPayableMap.set(item.supplierId, cur.plus(item.supplierPayable));
      }
    });

    for (const [suppId, amt] of supplierPayableMap.entries()) {
      saleJournalLines.push({
        accountCode: '2020',
        debit: new Decimal(0),
        credit: amt,
        partyType: 'SUPPLIER',
        partyId: suppId,
        description: `Consignment net proceeds payable for invoice ${invoice.invoiceNumber}`,
      });
    }

    const hasConsignmentItems = preparedItems.some((i) => i.ownershipType === 'CONSIGNMENT');

    await createBalancedJournalEntry({
      tx,
      entryDate: validated.invoiceDate,
      referenceType: 'SALE_INVOICE',
      referenceId: invoice.id,
      referenceNumber: invoice.invoiceNumber,
      narration: hasConsignmentItems
        ? `Consignment sale to customer ${customer.name} (${invoice.invoiceNumber})`
        : `Sale to customer ${customer.name}`,
      lines: saleJournalLines,
    });

    // 2. OWN-STOCK COGS JOURNAL (if any own stock was sold)
    // Debit: 5010 (Cost of Goods Sold - FIFO)
    // Credit: 1040 (Own Inventory Asset)
    if (totalOwnCogs.greaterThan(0)) {
      await createBalancedJournalEntry({
        tx,
        entryDate: validated.invoiceDate,
        referenceType: 'SALE_INVOICE',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        narration: `FIFO COGS for own-stock sale ${invoice.invoiceNumber}`,
        lines: [
          {
            accountCode: '5010',
            debit: totalOwnCogs,
            credit: 0,
            description: `COGS recognition for ${invoice.invoiceNumber}`,
          },
          {
            accountCode: '1040',
            debit: 0,
            credit: totalOwnCogs,
            description: `Inventory asset reduction for ${invoice.invoiceNumber}`,
          },
        ],
      });
    }

    // 3. IMMEDIATE PAYMENT JOURNAL (if customer paid at counter)
    if (paidAmountDec.greaterThan(0)) {
      await createBalancedJournalEntry({
        tx,
        entryDate: validated.invoiceDate,
        referenceType: 'SALE_INVOICE',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        narration: hasConsignmentItems
          ? `Counter collection for consignment sale invoice ${invoice.invoiceNumber}`
          : `Counter collection for sale invoice ${invoice.invoiceNumber}`,
        lines: [
          {
            accountCode: usedCashAccount?.accountType === 'BANK' ? '1011' : '1010',
            debit: paidAmountDec,
            credit: 0,
            description: `Cash collection for ${invoice.invoiceNumber}`,
          },
          {
            accountCode: '1020',
            debit: 0,
            credit: paidAmountDec,
            partyType: 'CUSTOMER' as const,
            partyId: customer.id,
            description: `Receivable reduction on counter collection ${invoice.invoiceNumber}`,
          },
        ],
      });
    }

    // Transactional Outbox Sync Event
    await tx.syncOutbox.create({
      data: {
        aggregateType: 'SALE_INVOICE',
        aggregateId: invoice.id,
        eventType: 'SALE_POSTED',
        payloadJson: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          netAmount: formatMoney(invoiceNet),
        }),
      },
    });

    return invoice;
  });

  return res.status(201).json({ success: true, data: result });
});

// List Sales Returns
router.get('/returns', async (_req: Request, res: Response) => {
  const returns = await prisma.salesReturn.findMany({
    include: {
      customer: true,
      salesInvoice: true,
      items: true,
    },
    orderBy: { returnDate: 'desc' },
  });
  return res.json({ success: true, data: returns });
});

// Create Sales Return
router.post('/returns', requireDeviceOrOwnerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const validated = SalesReturnCreateSchema.parse(req.body);

  const result = await dbTx(async (tx) => {
    const invoice = await tx.salesInvoice.findUnique({
      where: { id: BigInt(validated.salesInvoiceId) },
    });
    if (!invoice) throw new Error(`Sale invoice ID ${validated.salesInvoiceId} not found`);

    const customer = await tx.customer.findUnique({
      where: { id: BigInt(validated.customerId) },
    });
    if (!customer) throw new Error(`Customer ID ${validated.customerId} not found`);

    let returnNumber = validated.returnNumber;
    if (!returnNumber) {
      const seq = await tx.documentSequence.upsert({
        where: { sequenceType: 'SALE_RETURN' },
        update: { currentNumber: { increment: 1 } },
        create: { sequenceType: 'SALE_RETURN', prefix: 'SRTN-', currentNumber: BigInt(1), paddingLength: 5 },
      });
      returnNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;
    }

    let totalReturnGross = new Decimal(0);
    let totalOwnRevenueReversed = new Decimal(0);
    let totalOwnCogsReversed = new Decimal(0);
    let totalCommissionReversed = new Decimal(0);
    let totalSupplierPayableReversed = new Decimal(0);

    const preparedReturnItems = [];

    for (const item of validated.items) {
      const saleItem = await tx.salesInvoiceItem.findUnique({
        where: { id: BigInt(item.salesInvoiceItemId) },
        include: { stockAllocations: { include: { batch: true } } },
      });
      if (!saleItem) throw new Error(`Sale line item ID ${item.salesInvoiceItemId} not found`);

      const returnQty = toQuantity(item.baseQuantity);
      const lineRate = toMoney(item.rate);
      const lineGross = returnQty.times(lineRate);
      totalReturnGross = totalReturnGross.plus(lineGross);

      let commReversed = new Decimal(0);
      let suppPayableReversed = new Decimal(0);
      let cogsRestored = new Decimal(0);

      if (saleItem.ownershipType === 'OWN') {
        totalOwnRevenueReversed = totalOwnRevenueReversed.plus(lineGross);
        // Calculate proportional COGS to restore based on original sale line
        if (new Decimal(saleItem.baseQuantity).greaterThan(0)) {
          const unitCogs = new Decimal(saleItem.cogsAmount).dividedBy(new Decimal(saleItem.baseQuantity));
          cogsRestored = toMoney(unitCogs.times(returnQty));
          totalOwnCogsReversed = totalOwnCogsReversed.plus(cogsRestored);
        }
      } else {
        // Consignment: reverse commission and supplier payable proportionally
        const ratio = returnQty.dividedBy(new Decimal(saleItem.baseQuantity));
        commReversed = toMoney(new Decimal(saleItem.commissionAmount).times(ratio));
        suppPayableReversed = toMoney(new Decimal(saleItem.supplierPayable).times(ratio));
        totalCommissionReversed = totalCommissionReversed.plus(commReversed);
        totalSupplierPayableReversed = totalSupplierPayableReversed.plus(suppPayableReversed);

        if (saleItem.supplierId) {
          await tx.supplier.update({
            where: { id: saleItem.supplierId },
            data: {
              currentBalanceConsignment: { decrement: suppPayableReversed },
            },
          });
        }
      }

      preparedReturnItems.push({
        saleItem,
        returnQty,
        lineRate,
        lineGross,
        commReversed,
        suppPayableReversed,
        cogsRestored,
        isSaleable: item.isSaleable,
      });
    }

    // Create Sales Return Header
    const salesReturn = await tx.salesReturn.create({
      data: {
        returnNumber,
        salesInvoiceId: invoice.id,
        customerId: customer.id,
        returnDate: new Date(validated.returnDate),
        totalAmount: totalReturnGross,
        reason: validated.reason,
      },
    });

    // Save line items, restore inventory if saleable
    for (const pri of preparedReturnItems) {
      await tx.salesReturnItem.create({
        data: {
          salesReturnId: salesReturn.id,
          salesInvoiceItemId: pri.saleItem.id,
          baseQuantity: pri.returnQty,
          rate: pri.lineRate,
          grossAmount: pri.lineGross,
          commissionReversed: pri.commReversed,
          supplierPayableAdj: pri.suppPayableReversed,
          isSaleable: pri.isSaleable,
        },
      });

      if (pri.isSaleable && pri.saleItem.stockAllocations.length > 0) {
        // Restore stock to the primary allocation batch
        const primaryAlloc = pri.saleItem.stockAllocations[0];
        await tx.stockBatch.update({
          where: { id: primaryAlloc.batchId },
          data: {
            remainingBaseQty: { increment: pri.returnQty },
            status: 'ACTIVE',
          },
        });

        await tx.stockMovement.create({
          data: {
            batchId: primaryAlloc.batchId,
            itemId: pri.saleItem.itemId,
            ownershipType: pri.saleItem.ownershipType,
            supplierId: pri.saleItem.supplierId,
            movementType: 'SALE_RETURN_IN',
            enteredQuantity: pri.returnQty,
            enteredUnitName: 'KG',
            conversionFactorSnap: new Decimal(1),
            baseQuantity: pri.returnQty,
            baseUnitName: 'KG',
            referenceType: 'SALE_RETURN',
            referenceId: salesReturn.id,
            referenceNumber: returnNumber,
            movementDate: new Date(validated.returnDate),
          },
        });
      }
    }

    // Decrement customer receivable
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        currentBalance: { decrement: totalReturnGross },
      },
    });

    // 1. REVENUE / RECEIVABLE REVERSAL JOURNAL
    type ReturnJournalLine = {
      accountCode: string;
      debit: Decimal.Value;
      credit: Decimal.Value;
      partyType?: 'CUSTOMER' | 'SUPPLIER';
      partyId?: bigint;
      description?: string;
    };

    const returnLines: ReturnJournalLine[] = [];

    if (totalOwnRevenueReversed.greaterThan(0)) {
      returnLines.push({
        accountCode: '4010', // Debit Own Sales Revenue
        debit: totalOwnRevenueReversed,
        credit: new Decimal(0),
        description: `Revenue reversal for return ${returnNumber}`,
      });
    }

    if (totalCommissionReversed.greaterThan(0)) {
      returnLines.push({
        accountCode: '4020', // Debit Commission Income
        debit: totalCommissionReversed,
        credit: new Decimal(0),
        description: `Commission reversal for return ${returnNumber}`,
      });
    }

    if (totalSupplierPayableReversed.greaterThan(0)) {
      returnLines.push({
        accountCode: '2020', // Debit Consignment Supplier Payable
        debit: totalSupplierPayableReversed,
        credit: new Decimal(0),
        description: `Consignment payable reversal for return ${returnNumber}`,
      });
    }

    returnLines.push({
      accountCode: '1020', // Credit Accounts Receivable
      debit: new Decimal(0),
      credit: totalReturnGross,
      partyType: 'CUSTOMER',
      partyId: customer.id,
      description: `Customer AR credit for return ${returnNumber}`,
    });

    await createBalancedJournalEntry({
      tx,
      entryDate: validated.returnDate,
      referenceType: 'SALE_RETURN',
      referenceId: salesReturn.id,
      referenceNumber: returnNumber,
      narration: `Sales return from ${customer.name} for invoice ${invoice.invoiceNumber}`,
      lines: returnLines,
    });

    // 2. OWN-STOCK COGS REVERSAL JOURNAL (if own stock was returned and is saleable)
    if (totalOwnCogsReversed.greaterThan(0)) {
      await createBalancedJournalEntry({
        tx,
        entryDate: validated.returnDate,
        referenceType: 'SALE_RETURN',
        referenceId: salesReturn.id,
        referenceNumber: returnNumber,
        narration: `COGS reversal for sale return ${returnNumber}`,
        lines: [
          {
            accountCode: '1040', // Debit Inventory Asset
            debit: totalOwnCogsReversed,
            credit: new Decimal(0),
            description: `Inventory asset restoration for ${returnNumber}`,
          },
          {
            accountCode: '5010', // Credit COGS
            debit: new Decimal(0),
            credit: totalOwnCogsReversed,
            description: `COGS reduction for return ${returnNumber}`,
          },
        ],
      });
    }

    return salesReturn;
  });

  return res.status(201).json({ success: true, data: result });
});

// Void / Delete Sale Invoice (With Full Inventory Allocation Reversal & Accounting Reversal)
router.delete('/:id', requireDeviceOrOwnerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const saleId = BigInt(req.params.id);

  const result = await dbTx(async (tx) => {
    const invoice = await tx.salesInvoice.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            stockAllocations: true,
          },
        },
        customer: true,
      },
    });

    if (!invoice) {
      throw new Error(`Sale invoice ID ${saleId} not found`);
    }

    const existingReturns = await tx.salesReturn.count({
      where: { salesInvoiceId: invoice.id },
    });
    if (existingReturns > 0) {
      throw new Error(`Sale invoice ${invoice.invoiceNumber} has ${existingReturns} sales return(s). Delete returns first.`);
    }

    // 1. Restore Stock Batches from Allocations
    for (const item of invoice.items) {
      for (const alloc of item.stockAllocations) {
        await tx.stockBatch.update({
          where: { id: alloc.batchId },
          data: {
            remainingBaseQty: { increment: alloc.allocatedBaseQty },
            status: 'ACTIVE',
          },
        });
      }

      // 2. Revert Consignment Supplier Payable if consignment item
      if (item.ownershipType === 'CONSIGNMENT' && item.supplierId && new Decimal(item.supplierPayable).greaterThan(0)) {
        await tx.supplier.update({
          where: { id: item.supplierId },
          data: {
            currentBalanceConsignment: { decrement: item.supplierPayable },
          },
        });
      }
    }

    // 3. Revert Customer Balance — recalculate from openingBalance, surviving invoices, and vouchers
    const [survivingInvoices, custReceipts, custPayments] = await Promise.all([
      tx.salesInvoice.findMany({
        where: { customerId: invoice.customerId, id: { not: invoice.id } },
        select: { remainingBalance: true },
      }),
      tx.receiptVoucher.findMany({
        where: { partyType: 'CUSTOMER', partyId: invoice.customerId },
        select: { amount: true },
      }),
      tx.paymentVoucher.findMany({
        where: { partyType: 'CUSTOMER', partyId: invoice.customerId },
        select: { amount: true },
      }),
    ]);
    const survivingRemaining = survivingInvoices.reduce(
      (acc, inv) => acc.plus(new Decimal(inv.remainingBalance.toString())),
      new Decimal(0)
    );
    const totalReceipts = custReceipts.reduce(
      (acc, r) => acc.plus(new Decimal(r.amount.toString())),
      new Decimal(0)
    );
    const totalPayments = custPayments.reduce(
      (acc, p) => acc.plus(new Decimal(p.amount.toString())),
      new Decimal(0)
    );
    const openingBal = new Decimal(invoice.customer.openingBalance.toString());
    const newCustomerBalance = openingBal.plus(survivingRemaining).minus(totalReceipts).plus(totalPayments);
    await tx.customer.update({
      where: { id: invoice.customerId },
      data: {
        currentBalance: newCustomerBalance,
      },
    });

    // 4. Find Journal Entries linked to this sale (before deleting, so we know which Cash/Bank account was used)
    const journals = await tx.journalEntry.findMany({
      where: { referenceType: 'SALE_INVOICE', referenceId: invoice.id },
      include: { lines: { select: { accountId: true, debit: true } } },
    });

    // 5. Revert exact Cash/Bank Account if paid at counter
    if (new Decimal(invoice.paidAmount).greaterThan(0)) {
      const allCashAccts = await tx.cashBankAccount.findMany();
      const cashGlMap = new Map(allCashAccts.map((a) => [a.glAccountId.toString(), a]));
      let targetCashAcct = null;
      for (const j of journals) {
        for (const l of j.lines) {
          if (new Decimal(l.debit).greaterThan(0) && cashGlMap.has(l.accountId.toString())) {
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
          data: { currentBalance: { decrement: invoice.paidAmount } },
        });
      }
    }

    // 6. Delete Journal Entries linked to this sale
    for (const j of journals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    // 6. Delete Stock Movements
    await tx.stockMovement.deleteMany({
      where: { referenceType: 'SALE_INVOICE', referenceId: invoice.id },
    });

    // 7. Delete Allocations & Line Items
    const itemIds = invoice.items.map((it) => it.itemId);

    for (const item of invoice.items) {
      await tx.stockAllocation.deleteMany({
        where: { salesInvoiceItemId: item.id },
      });
    }

    await tx.salesInvoiceItem.deleteMany({
      where: { salesInvoiceId: invoice.id },
    });

    await tx.salesInvoice.delete({
      where: { id: invoice.id },
    });

    // 8. Clean up any items that now have 0 history and were only created for this sale
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
      message: `Sale invoice ${invoice.invoiceNumber} deleted and stock allocations restored successfully.`,
    };
  });

  return res.json({ success: true, data: result });
});

export const saleRoutes = router;
