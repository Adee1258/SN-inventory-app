import { Router, type Request, type Response } from 'express';
import { prisma, checkDatabaseConnection } from '../../database/prisma.js';
import { Decimal, formatMoney, formatQuantity, toMoney, toQuantity } from '@erp/business-rules';
import { ENV } from '../../config/env.js';

const router = Router();

router.get('/metrics', async (_req: Request, res: Response) => {
  const isDbConnected = await checkDatabaseConnection();

  // Pakistan is UTC+5 — compute local midnight in UTC to match DB timestamps
  const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  const nowPkt = new Date(nowUtc + PKT_OFFSET_MS);
  // Midnight PKT expressed as UTC
  const startOfTodayPkt = new Date(Date.UTC(nowPkt.getUTCFullYear(), nowPkt.getUTCMonth(), nowPkt.getUTCDate()) - PKT_OFFSET_MS);
  // 7 days ago (weekly)
  const startOfWeekPkt = new Date(startOfTodayPkt.getTime() - 6 * 24 * 60 * 60 * 1000);
  const startOfMonthPkt = new Date(Date.UTC(nowPkt.getUTCFullYear(), nowPkt.getUTCMonth(), 1) - PKT_OFFSET_MS);

  const startOfToday = startOfTodayPkt;
  const startOfMonth = startOfMonthPkt;

  // 1. Sales & Purchases (Today, This Week & This Month)
  const salesToday = await prisma.salesInvoice.findMany({
    where: { OR: [{ invoiceDate: { gte: startOfToday } }, { createdAt: { gte: startOfToday } }] },
  });
  const salesWeek = await prisma.salesInvoice.findMany({
    where: { OR: [{ invoiceDate: { gte: startOfWeekPkt } }, { createdAt: { gte: startOfWeekPkt } }] },
  });
  const salesMonth = await prisma.salesInvoice.findMany({
    where: { OR: [{ invoiceDate: { gte: startOfMonth } }, { createdAt: { gte: startOfMonth } }] },
  });

  const purchasesToday = await prisma.purchaseInvoice.findMany({
    where: { OR: [{ invoiceDate: { gte: startOfToday } }, { createdAt: { gte: startOfToday } }] },
  });
  const purchasesMonth = await prisma.purchaseInvoice.findMany({
    where: { OR: [{ invoiceDate: { gte: startOfMonth } }, { createdAt: { gte: startOfMonth } }] },
  });

  const sumSalesToday = salesToday.reduce((acc, s) => acc.plus(new Decimal(s.netInvoiceAmount.toString())), new Decimal(0));
  const sumSalesWeek = salesWeek.reduce((acc, s) => acc.plus(new Decimal(s.netInvoiceAmount.toString())), new Decimal(0));
  const sumSalesMonth = salesMonth.reduce((acc, s) => acc.plus(new Decimal(s.netInvoiceAmount.toString())), new Decimal(0));
  const sumPurchasesToday = purchasesToday.reduce((acc, p) => acc.plus(new Decimal(p.netLandedAmount.toString())), new Decimal(0));
  const sumPurchasesMonth = purchasesMonth.reduce((acc, p) => acc.plus(new Decimal(p.netLandedAmount.toString())), new Decimal(0));

  // 2. Central Inventory (Own Stock Valuation & Consignment Qty)
  const activeBatches = await prisma.stockBatch.findMany({
    where: { remainingBaseQty: { gt: 0 } },
  });

  let ownStockBaseQty = new Decimal(0);
  let ownStockValuation = new Decimal(0);
  let consignmentStockBaseQty = new Decimal(0);

  for (const b of activeBatches) {
    const rem = toQuantity(b.remainingBaseQty.toString());
    if (b.ownershipType === 'OWN') {
      ownStockBaseQty = ownStockBaseQty.plus(rem);
      ownStockValuation = ownStockValuation.plus(rem.times(toMoney(b.unitCost.toString())));
    } else {
      consignmentStockBaseQty = consignmentStockBaseQty.plus(rem);
    }
  }

  // 3. Receivables & Payables
  const customers = await prisma.customer.findMany({ where: { currentBalance: { gt: 0 } } });
  const totalReceivables = customers.reduce((acc, c) => acc.plus(new Decimal(c.currentBalance.toString())), new Decimal(0));

  const suppliers = await prisma.supplier.findMany();
  let totalSupplierPayableOwn = new Decimal(0);
  let totalSupplierPayableConsignment = new Decimal(0);
  suppliers.forEach((s) => {
    totalSupplierPayableOwn = totalSupplierPayableOwn.plus(new Decimal(s.currentBalanceOwn.toString()));
    totalSupplierPayableConsignment = totalSupplierPayableConsignment.plus(new Decimal(s.currentBalanceConsignment.toString()));
  });

  // 4. Cash & Bank Liquid Balances
  const cashBankAccounts = await prisma.cashBankAccount.findMany();
  let totalCash = new Decimal(0);
  let totalBank = new Decimal(0);
  cashBankAccounts.forEach((a) => {
    const bal = new Decimal(a.currentBalance.toString());
    if (a.accountType === 'CASH') totalCash = totalCash.plus(bal);
    else totalBank = totalBank.plus(bal);
  });

  // 5. Commission & Profit
  const commissionLines = await prisma.salesInvoiceItem.findMany({
    where: { ownershipType: 'CONSIGNMENT' },
  });
  const totalCommissionEarned = commissionLines.reduce(
    (acc, l) => acc.plus(new Decimal(l.commissionAmount.toString())),
    new Decimal(0)
  );

  // 6. Recent Invoices
  const recentSales = await prisma.salesInvoice.findMany({
    take: 5,
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });

  // 7. Pending Sync Events
  const pendingSyncCount = await prisma.syncOutbox.count({
    where: { status: 'PENDING' },
  });

  return res.json({
    success: true,
    data: {
      sales: {
        today: formatMoney(sumSalesToday),
        thisWeek: formatMoney(sumSalesWeek),
        thisMonth: formatMoney(sumSalesMonth),
        countToday: salesToday.length,
        countWeek: salesWeek.length,
        countMonth: salesMonth.length,
      },
      purchases: {
        today: formatMoney(sumPurchasesToday),
        thisMonth: formatMoney(sumPurchasesMonth),
        countToday: purchasesToday.length,
      },
      inventory: {
        ownStockBaseQty: formatQuantity(ownStockBaseQty),
        ownStockValuation: formatMoney(ownStockValuation),
        consignmentStockBaseQty: formatQuantity(consignmentStockBaseQty),
        totalPhysicalBaseQty: formatQuantity(ownStockBaseQty.plus(consignmentStockBaseQty)),
      },
      receivables: {
        totalCustomerReceivables: formatMoney(totalReceivables),
      },
      payables: {
        ownPurchasesPayable: formatMoney(totalSupplierPayableOwn),
        consignmentProceedsPayable: formatMoney(totalSupplierPayableConsignment),
        totalPayables: formatMoney(totalSupplierPayableOwn.plus(totalSupplierPayableConsignment)),
      },
      liquidity: {
        cashInTill: formatMoney(totalCash),
        bankBalance: formatMoney(totalBank),
        totalLiquidFunds: formatMoney(totalCash.plus(totalBank)),
      },
      commissionEarned: formatMoney(totalCommissionEarned),
      recentSales,
      systemStatus: {
        isServerHealthy: true,
        isDbConnected,
        cloudSyncEnabled: ENV.CLOUD_SYNC_ENABLED,
        cloudConnected: false,
        pendingSyncEventsCount: pendingSyncCount,
        serverTime: new Date().toISOString(),
      },
    },
  });
});

export const dashboardRoutes = router;
