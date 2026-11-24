import { Router, type Request, type Response } from 'express';
import { prisma, dbTx } from '../../database/prisma.js';
import { DocumentReferenceType } from '@prisma/client';
import { Decimal, toMoney, formatMoney } from '@erp/business-rules';
import { createBalancedJournalEntry } from '../../accounting/posting-engine.js';

const router = Router();

// Stream-specific Document Reference Types for segmented financial reporting
export const OWN_STREAM_REF_TYPES: DocumentReferenceType[] = [
  DocumentReferenceType.SALE_INVOICE,
  DocumentReferenceType.SALE_RETURN,
  DocumentReferenceType.PURCHASE_INVOICE,
  DocumentReferenceType.PURCHASE_RETURN,
  DocumentReferenceType.OPENING_STOCK,
  DocumentReferenceType.STOCK_ADJUSTMENT,
];

export const COMMISSION_STREAM_REF_TYPES: DocumentReferenceType[] = [
  DocumentReferenceType.CONSIGNMENT_RECEIPT,
  DocumentReferenceType.CONSIGNMENT_RETURN,
  DocumentReferenceType.SUPPLIER_SETTLEMENT,
  DocumentReferenceType.SUPPLIER_ADVANCE,
  DocumentReferenceType.COMMISSION_EXPENSE,
];

// Helper to build Prisma where filter for JournalEntry according to stream segment
export async function getJournalEntrySegmentWhere(segment?: string): Promise<Record<string, unknown> | undefined> {
  if (!segment || segment === 'ALL') return undefined;

  const commissionAccounts = ['1025', '1050', '2020', '4020', '4030', '4035'];

  // Dynamically find all sales invoice numbers that contain consignment / amanat items
  let commInvoiceNumbers: string[] = [];
  try {
    const commInvoices = await prisma.salesInvoiceItem.findMany({
      where: { ownershipType: 'CONSIGNMENT' },
      select: { salesInvoice: { select: { invoiceNumber: true } } },
      distinct: ['salesInvoiceId'],
    });
    commInvoiceNumbers = commInvoices
      .map((c) => c.salesInvoice?.invoiceNumber)
      .filter((n): n is string => Boolean(n));
  } catch (err) {
    console.error('Error fetching consignment sales invoice numbers:', err);
  }

  if (segment === 'CONSIGNMENT') {
    return {
      OR: [
        { referenceType: { in: COMMISSION_STREAM_REF_TYPES } },
        ...(commInvoiceNumbers.length > 0 ? [{ referenceNumber: { in: commInvoiceNumbers } }] : []),
        {
          lines: {
            some: {
              account: {
                accountCode: { in: commissionAccounts },
              },
            },
          },
        },
        { narration: { contains: 'commission' } },
        { narration: { contains: 'consignment' } },
        { narration: { contains: 'amanat' } },
        { narration: { contains: 'settlement' } },
      ],
    };
  }

  if (segment === 'OWN') {
    return {
      AND: [
        { referenceType: { notIn: COMMISSION_STREAM_REF_TYPES } },
        ...(commInvoiceNumbers.length > 0 ? [{ referenceNumber: { notIn: commInvoiceNumbers } }] : []),
        {
          lines: {
            none: {
              account: {
                accountCode: { in: commissionAccounts },
              },
            },
          },
        },
        {
          NOT: [
            { narration: { contains: 'commission' } },
            { narration: { contains: 'consignment' } },
            { narration: { contains: 'amanat' } },
            { narration: { contains: 'settlement' } },
          ],
        },
      ],
    };
  }

  return undefined;
}

// Standard comprehensive Chart of Accounts specifically designed for Wholesale Mandi & Commission Trading
export const STANDARD_MANDI_COA = [
  // --- 1. ASSETS (اثاثے) ---
  { code: '1010', name: 'Cash in Shop Till (Galla)', category: 'ASSET', isSystem: true, description: 'Daily shop physical cash in till drawer' },
  { code: '1011', name: 'Main Bank Current Account', category: 'ASSET', isSystem: true, description: 'Primary business operating bank account' },
  { code: '1012', name: 'Secondary Bank Account', category: 'ASSET', isSystem: false, description: 'Secondary bank account for transfers' },
  { code: '1015', name: 'Petty Cash (Munshi Till)', category: 'ASSET', isSystem: false, description: 'Petty cash with Munshi for daily mandi expenses' },
  { code: '1020', name: 'Customer Accounts Receivable', category: 'ASSET', isSystem: true, description: 'Amounts owed by buyers and credit customers' },
  { code: '1025', name: 'Mandi Commission & Brokerage Receivable', category: 'ASSET', isSystem: false, description: 'Receivables from brokerage and external commission' },
  { code: '1040', name: 'Own Inventory Asset (Trading Stock)', category: 'ASSET', isSystem: true, description: 'Value of owned stock stored in godown' },
  { code: '1045', name: 'Bardana & Packaging Stock (Bora / Bags)', category: 'ASSET', isSystem: false, description: 'Jute and plastic bags inventory' },
  { code: '1050', name: 'Supplier Crop Advances (Zamindar Peshi)', category: 'ASSET', isSystem: true, description: 'Advances given to farmers before crop harvest' },
  { code: '1055', name: 'Staff & Employee Advances', category: 'ASSET', isSystem: false, description: 'Salary advances given to mandi staff and workers' },
  { code: '1510', name: 'Mandi Shop & Godown Property', category: 'ASSET', isSystem: false, description: 'Value of physical shop and storage godown' },
  { code: '1520', name: 'Vehicles & Loading Pickups', category: 'ASSET', isSystem: false, description: 'Delivery pickups, Suzuki, Shahzore, etc.' },
  { code: '1530', name: 'Weighbridge & Digital Kanda', category: 'ASSET', isSystem: false, description: 'Digital weighing scales and weighbridge equipment' },
  { code: '1540', name: 'Shop Furniture, Computers & Safe', category: 'ASSET', isSystem: false, description: 'CCTV, computers, printers, safes, office setup' },

  // --- 2. LIABILITIES (واجبات) ---
  { code: '2010', name: 'Accounts Payable: Own Stock Suppliers', category: 'LIABILITY', isSystem: true, description: 'Trade payables to suppliers for bought stock' },
  { code: '2020', name: 'Commission Supplier Payable (Consignment)', category: 'LIABILITY', isSystem: true, description: 'Net sale proceeds due to zamindars/growers' },
  { code: '2030', name: 'Customer Advances Received', category: 'LIABILITY', isSystem: false, description: 'Advance payments received from buyers' },
  { code: '2040', name: 'Bardana / Bag Security Deposits', category: 'LIABILITY', isSystem: false, description: 'Security deposit held for empty bags' },
  { code: '2050', name: 'Accrued Labour & Palladari Payable', category: 'LIABILITY', isSystem: false, description: 'Unsettled wages for mandi labourers and loaders' },
  { code: '2060', name: 'Mandi Market Committee Cess Payable', category: 'LIABILITY', isSystem: false, description: 'Government mandi cess collected and payable' },
  { code: '2510', name: 'Bank Loans & Running Finance', category: 'LIABILITY', isSystem: false, description: 'Formal bank loans and credit facilities' },
  { code: '2520', name: 'Informal Loans (Qarz-e-Hasna)', category: 'LIABILITY', isSystem: false, description: 'Interest-free friendly/partner loans' },

  // --- 3. CAPITAL & EQUITY (سرمایہ) ---
  { code: '3010', name: 'Owner Capital', category: 'EQUITY', isSystem: true, description: 'Initial and invested capital by the proprietor/partner' },
  { code: '3020', name: 'Opening Balance Clearing Equity', category: 'EQUITY', isSystem: true, description: 'Clearing account for starting balances' },
  { code: '3030', name: 'Owner Drawings (Zaati Kharch)', category: 'EQUITY', isSystem: false, description: 'Money withdrawn by owner for personal expenses' },
  { code: '3040', name: 'Retained Earnings / Prior Years Profit', category: 'EQUITY', isSystem: false, description: 'Accumulated profits retained in the business' },

  // --- 4. REVENUE & INCOME (آمدنی) ---
  { code: '4010', name: 'Own Stock Sales Revenue', category: 'INCOME', isSystem: true, description: 'Revenue from direct sale of owned trading inventory' },
  { code: '4020', name: 'Consignment Commission Income', category: 'INCOME', isSystem: true, description: 'Aarath / commission earned on farmers produce sales' },
  { code: '4030', name: 'Tulai & Weighing Charges Income', category: 'INCOME', isSystem: false, description: 'Fees earned from weighing scale / kanda' },
  { code: '4035', name: 'Dami & Brokerage Income', category: 'INCOME', isSystem: false, description: 'Brokerage fees from connecting outside buyers/sellers' },
  { code: '4040', name: 'Bardana Profit / Rental Income', category: 'INCOME', isSystem: false, description: 'Profit from selling or renting packaging bags' },
  { code: '4510', name: 'Discounts Received from Suppliers', category: 'INCOME', isSystem: false, description: 'Discounts and rebates obtained on purchases' },
  { code: '4520', name: 'Miscellaneous Scrap & Mandi Income', category: 'INCOME', isSystem: false, description: 'Income from sweepings, damaged grain scrap, etc.' },

  // --- 5. EXPENSES (اخراجات) ---
  { code: '5010', name: 'Cost of Goods Sold (FIFO)', category: 'EXPENSE', isSystem: true, description: 'Landed inventory cost of goods sold' },
  { code: '5020', name: 'Shop Labour & Loading/Unloading (Palladari)', category: 'EXPENSE', isSystem: true, description: 'Labour charges paid for loading and unloading' },
  { code: '5025', name: 'Mandi Transport & Freight Expense', category: 'EXPENSE', isSystem: true, description: 'Truck carriage and transportation costs' },
  { code: '5030', name: 'Cleaning, Sieving & Packing Charges', category: 'EXPENSE', isSystem: false, description: 'Grading, chhanaai and bagging expenses' },
  { code: '5035', name: 'Market Committee Cess / Mandi Tax', category: 'EXPENSE', isSystem: false, description: 'Market committee fees per bag or transaction' },
  { code: '5040', name: 'Shop & Godown Rent', category: 'EXPENSE', isSystem: true, description: 'Monthly rent for shop and storage facilities' },
  { code: '5045', name: 'Electricity, Gas & Water Utilities', category: 'EXPENSE', isSystem: false, description: 'Utility bills for shop and godown' },
  { code: '5050', name: 'Staff Salaries & Munshi Allowance', category: 'EXPENSE', isSystem: false, description: 'Salaries of Munshis, accountants and assistants' },
  { code: '5055', name: 'Tea, Meals & Guest Hospitality (Chai Pani)', category: 'EXPENSE', isSystem: false, description: 'Daily tea and food for zamindars and mandi visitors' },
  { code: '5060', name: 'Mobile, Telephone & Internet Bills', category: 'EXPENSE', isSystem: false, description: 'Communication expenses for market rates calling' },
  { code: '5065', name: 'Printing, Stationery & Ledger Books', category: 'EXPENSE', isSystem: false, description: 'Invoice slips, receipt books, printer ribbons' },
  { code: '5070', name: 'Shop Repairs, Maintenance & Cleaning', category: 'EXPENSE', isSystem: false, description: 'Scale calibration, shutter repair, cleaning' },
  { code: '5080', name: 'Bank Charges & Online Transfer Fees', category: 'EXPENSE', isSystem: false, description: 'Bank deductions and interbank transfer charges' },
  { code: '5090', name: 'Bad Debts & Uncollectible Khata', category: 'EXPENSE', isSystem: false, description: 'Written-off unrecoverable credit balances' },
  { code: '5095', name: 'Depreciation Expense', category: 'EXPENSE', isSystem: false, description: 'Annual wear and tear write-off of equipment' },
];

// Helper to determine natural parent category name if none assigned
function getDefaultParentCategory(code: string, category: string): string {
  const c = parseInt(code, 10);
  if (!isNaN(c)) {
    if (c >= 1000 && c < 1500) return 'Current Assets';
    if (c >= 1500 && c < 2000) return 'Fixed Assets';
    if (c >= 2000 && c < 2500) return 'Current Liabilities';
    if (c >= 2500 && c < 3000) return 'Long-Term Liabilities';
    if (c >= 3000 && c < 4000) return "Owner's Equity";
    if (c >= 4000 && c < 4500) return 'Operating Revenue';
    if (c >= 4500 && c < 5000) return 'Other Income';
    if (c >= 5000 && c < 5040) return 'Direct Costs & COGS';
    if (c >= 5040 && c < 6000) return 'Operating Expenses';
  }
  switch (category) {
    case 'ASSET': return 'Current Assets';
    case 'LIABILITY': return 'Current Liabilities';
    case 'EQUITY': return 'Owner Equity';
    case 'INCOME': return 'Revenue / Income';
    case 'EXPENSE': return 'Operating Expenses';
    default: return 'General';
  }
}

// Chart of Accounts Tree with Live Balances & Parent Details
router.get('/chart-of-accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.chartOfAccounts.findMany({
      include: {
        parent: {
          select: { id: true, accountCode: true, accountName: true },
        },
        journalLines: {
          select: { debit: true, credit: true },
        },
        children: {
          select: { id: true },
        },
      },
      orderBy: { accountCode: 'asc' },
    });

    const formatted = accounts.map((acc) => {
      let debitSum = new Decimal(0);
      let creditSum = new Decimal(0);

      acc.journalLines.forEach((l) => {
        debitSum = debitSum.plus(new Decimal(l.debit.toString()));
        creditSum = creditSum.plus(new Decimal(l.credit.toString()));
      });

      let netBalance = new Decimal(0);
      if (acc.category === 'ASSET' || acc.category === 'EXPENSE') {
        netBalance = debitSum.minus(creditSum);
      } else {
        netBalance = creditSum.minus(debitSum);
      }

      const categoryName = acc.parent
        ? acc.parent.accountName
        : getDefaultParentCategory(acc.accountCode, acc.category);

      return {
        id: acc.id.toString(),
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        category: acc.category,
        parentCategory: categoryName,
        parentId: acc.parentId ? acc.parentId.toString() : null,
        parent: acc.parent
          ? {
              id: acc.parent.id.toString(),
              accountCode: acc.parent.accountCode,
              accountName: acc.parent.accountName,
            }
          : null,
        isSystem: acc.isSystem,
        isActive: acc.isActive,
        totalDebit: formatMoney(debitSum),
        totalCredit: formatMoney(creditSum),
        balance: formatMoney(netBalance),
        rawBalance: netBalance.toNumber(),
        transactionCount: acc.journalLines.length,
        hasChildren: acc.children.length > 0,
      };
    });

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    console.error('Error in GET /chart-of-accounts:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Auto-generated Next Account Code
router.get('/chart-of-accounts/next-code', async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || 'ASSET';
    const rangeMap: Record<string, { start: number; end: number; prefix: string }> = {
      ASSET: { start: 1000, end: 1999, prefix: 'A-' },
      LIABILITY: { start: 2000, end: 2999, prefix: 'L-' },
      EQUITY: { start: 3000, end: 3999, prefix: 'C-' },
      INCOME: { start: 4000, end: 4999, prefix: 'R-' },
      EXPENSE: { start: 5000, end: 5999, prefix: 'E-' },
    };

    const config = rangeMap[category] || rangeMap.ASSET;

    const accounts = await prisma.chartOfAccounts.findMany({
      where: { category: category as any },
      select: { accountCode: true },
    });

    let maxNum = config.start;
    accounts.forEach((a) => {
      const n = parseInt(a.accountCode, 10);
      if (!isNaN(n) && n >= config.start && n <= config.end && n > maxNum) {
        maxNum = n;
      }
    });
    const nextNumericCode = (maxNum + 10).toString();

    let maxPrefixNum = 0;
    accounts.forEach((a) => {
      if (a.accountCode.startsWith(config.prefix)) {
        const numPart = parseInt(a.accountCode.replace(config.prefix, ''), 10);
        if (!isNaN(numPart) && numPart > maxPrefixNum) {
          maxPrefixNum = numPart;
        }
      }
    });
    const nextPrefixCode = `${config.prefix}${(maxPrefixNum + 1).toString().padStart(3, '0')}`;

    return res.json({
      success: true,
      data: {
        nextNumericCode,
        nextPrefixCode,
        recommended: nextNumericCode,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Add New Custom Account (with automatic Opening Balance posting!)
router.post('/chart-of-accounts', async (req: Request, res: Response) => {
  try {
    const { accountCode, accountName, category, parentId, openingBalance, openingBalanceType } = req.body;

    if (!accountCode || !accountName || !category) {
      return res.status(400).json({ success: false, message: 'Account code, name, and category are required' });
    }

    const cleanCode = String(accountCode).trim();
    const cleanName = String(accountName).trim();
    const validCategories = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ success: false, message: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
    }

    const existing = await prisma.chartOfAccounts.findUnique({
      where: { accountCode: cleanCode },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Account code '${cleanCode}' is already in use by '${existing.accountName}'` });
    }

    const parsedParentId = parentId ? BigInt(parentId) : null;
    const opBal = openingBalance ? Math.abs(parseFloat(String(openingBalance))) : 0;
    const opType = openingBalanceType === 'CREDIT' ? 'CREDIT' : (category === 'ASSET' || category === 'EXPENSE' ? 'DEBIT' : 'CREDIT');

    const created = await dbTx(async (tx) => {
      const account = await tx.chartOfAccounts.create({
        data: {
          accountCode: cleanCode,
          accountName: cleanName,
          category,
          parentId: parsedParentId,
          isSystem: false,
          isActive: true,
        },
      });

      // If opening balance > 0, create double entry against 3020 Opening Balance Clearing Equity
      if (opBal > 0) {
        let equityClearing = await tx.chartOfAccounts.findUnique({
          where: { accountCode: '3020' },
        });
        if (!equityClearing) {
          equityClearing = await tx.chartOfAccounts.create({
            data: {
              accountCode: '3020',
              accountName: 'Opening Balance Clearing Equity',
              category: 'EQUITY',
              isSystem: true,
            },
          });
        }

        const amt = toMoney(opBal);
        const isDebit = opType === 'DEBIT';

        await createBalancedJournalEntry({
          tx,
          entryDate: new Date(),
          referenceType: 'JOURNAL_ENTRY',
          referenceId: account.id,
          referenceNumber: `OPB-${account.accountCode}`,
          narration: `Opening balance for ${account.accountCode} - ${account.accountName}`,
          lines: [
            {
              accountCode: account.accountCode,
              debit: isDebit ? amt : 0,
              credit: isDebit ? 0 : amt,
              description: 'Initial opening balance',
            },
            {
              accountCode: '3020',
              debit: isDebit ? 0 : amt,
              credit: isDebit ? amt : 0,
              description: `Opening balance offset for ${account.accountCode}`,
            },
          ],
        });
      }

      return account;
    });

    return res.status(201).json({
      success: true,
      message: `Account '${created.accountName}' (${created.accountCode}) created successfully`,
      data: {
        id: created.id.toString(),
        accountCode: created.accountCode,
        accountName: created.accountName,
        category: created.category,
      },
    });
  } catch (error: any) {
    console.error('Error creating account:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create account' });
  }
});

// Update Account (Name, Parent, Active Status, or Code for non-system)
router.put('/chart-of-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accountName, parentId, isActive, accountCode } = req.body;

    const account = await prisma.chartOfAccounts.findUnique({
      where: { id: BigInt(id) },
    });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const data: Record<string, any> = {};
    if (accountName) data.accountName = String(accountName).trim();
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (parentId !== undefined) {
      data.parentId = parentId ? BigInt(parentId) : null;
    }
    if (accountCode && !account.isSystem && accountCode !== account.accountCode) {
      const existing = await prisma.chartOfAccounts.findUnique({
        where: { accountCode: String(accountCode).trim() },
      });
      if (existing && existing.id !== account.id) {
        return res.status(400).json({ success: false, message: `Account code '${accountCode}' is already taken` });
      }
      data.accountCode = String(accountCode).trim();
    }

    const updated = await prisma.chartOfAccounts.update({
      where: { id: BigInt(id) },
      data,
    });

    return res.json({
      success: true,
      message: `Account '${updated.accountName}' updated successfully`,
      data: {
        id: updated.id.toString(),
        accountCode: updated.accountCode,
        accountName: updated.accountName,
        category: updated.category,
      },
    });
  } catch (error: any) {
    console.error('Error updating account:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update account' });
  }
});

// Delete Account (Safely guarded against system & active transactions)
router.delete('/chart-of-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = await prisma.chartOfAccounts.findUnique({
      where: { id: BigInt(id) },
      include: {
        journalLines: { take: 1 },
        children: { take: 1 },
      },
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (account.isSystem) {
      return res.status(400).json({
        success: false,
        message: 'System account cannot be deleted as it is vital for automatic posting engine.',
      });
    }

    if (account.journalLines.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with existing journal transactions. You may deactivate it instead.',
      });
    }

    if (account.children.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete parent account that has linked sub-accounts. Please reassign child accounts first.',
      });
    }

    await prisma.chartOfAccounts.delete({
      where: { id: BigInt(id) },
    });

    return res.json({
      success: true,
      message: `Account '${account.accountName}' (${account.accountCode}) deleted successfully`,
    });
  } catch (error: any) {
    console.error('Error deleting account:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to delete account' });
  }
});

// Regenerate / Seed Complete Standard Mandi Chart of Accounts
router.post('/chart-of-accounts/regenerate', async (_req: Request, res: Response) => {
  try {
    let createdCount = 0;
    let updatedCount = 0;

    for (const acc of STANDARD_MANDI_COA) {
      const existing = await prisma.chartOfAccounts.findUnique({
        where: { accountCode: acc.code },
      });

      if (!existing) {
        await prisma.chartOfAccounts.create({
          data: {
            accountCode: acc.code,
            accountName: acc.name,
            category: acc.category as any,
            isSystem: acc.isSystem,
            isActive: true,
          },
        });
        createdCount++;
      } else {
        if (existing.isSystem !== acc.isSystem) {
          await prisma.chartOfAccounts.update({
            where: { id: existing.id },
            data: { isSystem: acc.isSystem },
          });
          updatedCount++;
        }
      }
    }

    return res.json({
      success: true,
      message: `Chart of Accounts synchronized. ${createdCount} accounts added, ${updatedCount} verified.`,
    });
  } catch (error: any) {
    console.error('Error regenerating COA:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to regenerate Chart of Accounts' });
  }
});

// GL Accounts List (for Voucher dropdowns)
router.get('/gl-accounts', async (_req: Request, res: Response) => {
  const accounts = await prisma.chartOfAccounts.findMany({
    select: { id: true, accountCode: true, accountName: true, category: true },
    orderBy: { accountCode: 'asc' },
  });
  return res.json({ success: true, data: accounts });
});

// Journal Entries Ledger
router.get('/journal-entries', async (req: Request, res: Response) => {
  const { limit, startDate, endDate, segment } = req.query as {
    limit?: string;
    startDate?: string;
    endDate?: string;
    segment?: string;
  };
  const where: Record<string, unknown> = {};

  if (startDate || endDate) {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      dateFilter.lte = eDate;
    }
    where.entryDate = dateFilter;
  }

  const segmentWhere = await getJournalEntrySegmentWhere(segment);
  if (segmentWhere) {
    Object.assign(where, segmentWhere);
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    include: {
      lines: {
        include: { account: true },
      },
    },
    take: limit ? parseInt(limit as string, 10) : 150,
    orderBy: { entryDate: 'desc' },
  });

  return res.json({ success: true, data: entries });
});

// Post Manual Journal Voucher (Roznamcha)
router.post('/journal-entries', async (req: Request, res: Response) => {
  try {
    const { voucherDate, narration, lines } = req.body;
    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Journal Voucher mein kam az kam 2 lines (Debit aur Credit) lazmi hain.',
      });
    }

    const journal = await dbTx(async (tx) => {
      return await createBalancedJournalEntry({
        tx,
        entryDate: voucherDate ? new Date(voucherDate) : new Date(),
        referenceType: 'JOURNAL_ENTRY',
        referenceId: BigInt(Date.now()),
        referenceNumber: `JV-${Date.now().toString().slice(-6)}`,
        narration: narration || 'Manual Journal Voucher',
        lines: lines.map((l: any) => ({
          accountCode: String(l.accountCode),
          debit: parseFloat(String(l.debit || 0)),
          credit: parseFloat(String(l.credit || 0)),
          description: l.description || narration || '',
        })),
      });
    });

    return res.json({
      success: true,
      message: `Journal Voucher ${journal.entryNumber} successfully posted!`,
      data: journal,
    });
  } catch (error: any) {
    console.error('Error posting manual journal entry:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to post journal entry',
    });
  }
});

// Trial Balance (Mandatory: Debits must equal Credits)
router.get('/trial-balance', async (req: Request, res: Response) => {
  try {
    const { asOfDate, startDate, endDate, segment } = req.query as {
      asOfDate?: string;
      startDate?: string;
      endDate?: string;
      segment?: string;
    };

    const journalEntryFilter: Record<string, unknown> = {};
    const effectiveStart = startDate;
    const effectiveEnd = endDate || asOfDate;

    if (effectiveStart || effectiveEnd) {
      const dateFilter: Record<string, unknown> = {};
      if (effectiveStart) dateFilter.gte = new Date(effectiveStart);
      if (effectiveEnd) {
        const eDate = new Date(effectiveEnd);
        eDate.setHours(23, 59, 59, 999);
        dateFilter.lte = eDate;
      }
      journalEntryFilter.entryDate = dateFilter;
    }

    const segmentWhere = await getJournalEntrySegmentWhere(segment);
    if (segmentWhere) {
      Object.assign(journalEntryFilter, segmentWhere);
    }

    const whereLines: Record<string, unknown> = {};
    if (Object.keys(journalEntryFilter).length > 0) {
      whereLines.journalEntry = journalEntryFilter;
    }

    const accounts = await prisma.chartOfAccounts.findMany({
      include: {
        journalLines: {
          where: whereLines,
        },
      },
      orderBy: { accountCode: 'asc' },
    });

    let totalDebitAll = new Decimal(0);
    let totalCreditAll = new Decimal(0);

    const report = accounts.map((acc) => {
      let debitSum = new Decimal(0);
      let creditSum = new Decimal(0);

      acc.journalLines.forEach((l) => {
        debitSum = debitSum.plus(new Decimal(l.debit.toString()));
        creditSum = creditSum.plus(new Decimal(l.credit.toString()));
      });

      totalDebitAll = totalDebitAll.plus(debitSum);
      totalCreditAll = totalCreditAll.plus(creditSum);

      // Normal balance:
      // For Assets & Expenses: normal balance = debitSum - creditSum
      // For Liabilities, Equity, Income: normal balance = creditSum - debitSum
      const isDebitNature = acc.category === 'ASSET' || acc.category === 'EXPENSE';
      const netNormal = isDebitNature ? debitSum.minus(creditSum) : creditSum.minus(debitSum);

      let netDebit = new Decimal(0);
      let netCredit = new Decimal(0);

      if (isDebitNature) {
        const net = debitSum.minus(creditSum);
        if (net.isPositive()) netDebit = net;
        else netCredit = net.abs();
      } else {
        const net = creditSum.minus(debitSum);
        if (net.isPositive()) netCredit = net;
        else netDebit = net.abs();
      }

      return {
        accountId: acc.id.toString(),
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        category: acc.category,
        totalDebit: formatMoney(debitSum),
        totalCredit: formatMoney(creditSum),
        netDebit: formatMoney(netDebit),
        netCredit: formatMoney(netCredit),
        netNormalBalance: formatMoney(netNormal),
        rawNormalBalance: netNormal.toNumber(),
      };
    });

    const diff = totalDebitAll.minus(totalCreditAll).abs();

    return res.json({
      success: true,
      data: {
        isBalanced: diff.isZero(),
        totalDebit: formatMoney(totalDebitAll),
        totalCredit: formatMoney(totalCreditAll),
        difference: formatMoney(diff),
        accounts: report,
      },
    });
  } catch (error: any) {
    console.error('Error fetching trial balance:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Profit & Loss Statement
router.get('/profit-and-loss', async (req: Request, res: Response) => {
  const { segment, startDate, endDate } = req.query as {
    segment?: string;
    startDate?: string;
    endDate?: string;
  };

  const journalEntryFilter: Record<string, unknown> = {};
  if (startDate || endDate) {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      dateFilter.lte = eDate;
    }
    journalEntryFilter.entryDate = dateFilter;
  }

  const segmentWhere = await getJournalEntrySegmentWhere(segment);
  if (segmentWhere) {
    Object.assign(journalEntryFilter, segmentWhere);
  }

  const linesWhere: Record<string, unknown> = {};
  if (Object.keys(journalEntryFilter).length > 0) {
    linesWhere.journalEntry = journalEntryFilter;
  }

  const lines = await prisma.journalEntryLine.findMany({
    where: linesWhere,
    include: { account: true },
  });

  let ownSalesRevenue = new Decimal(0);
  let commissionIncome = new Decimal(0);
  let costOfGoodsSold = new Decimal(0);
  let operatingExpenses = new Decimal(0);

  for (const l of lines) {
    const d = new Decimal(l.debit.toString());
    const c = new Decimal(l.credit.toString());

    if (l.account.accountCode === '4010') {
      ownSalesRevenue = ownSalesRevenue.plus(c.minus(d));
    } else if (l.account.accountCode === '4020') {
      commissionIncome = commissionIncome.plus(c.minus(d));
    } else if (l.account.accountCode === '5010') {
      costOfGoodsSold = costOfGoodsSold.plus(d.minus(c));
    } else if (l.account.category === 'EXPENSE') {
      operatingExpenses = operatingExpenses.plus(d.minus(c));
    }
  }

  const grossTradingProfit = ownSalesRevenue.minus(costOfGoodsSold);
  const totalRevenueAndIncome = grossTradingProfit.plus(commissionIncome);
  const netProfit = totalRevenueAndIncome.minus(operatingExpenses);

  return res.json({
    success: true,
    data: {
      ownSalesRevenue: formatMoney(ownSalesRevenue),
      costOfGoodsSold: formatMoney(costOfGoodsSold),
      grossTradingProfit: formatMoney(grossTradingProfit),
      commissionIncome: formatMoney(commissionIncome),
      operatingExpenses: formatMoney(operatingExpenses),
      netProfit: formatMoney(netProfit),
    },
  });
});

// Balance Sheet
router.get('/balance-sheet', async (req: Request, res: Response) => {
  const { segment, endDate, asOfDate } = req.query as {
    segment?: string;
    endDate?: string;
    asOfDate?: string;
  };

  const journalEntryFilter: Record<string, unknown> = {};
  const effectiveEnd = endDate || asOfDate;
  if (effectiveEnd) {
    const eDate = new Date(effectiveEnd);
    eDate.setHours(23, 59, 59, 999);
    journalEntryFilter.entryDate = { lte: eDate };
  }

  const segmentWhere = await getJournalEntrySegmentWhere(segment);
  if (segmentWhere) {
    Object.assign(journalEntryFilter, segmentWhere);
  }

  const linesWhere: Record<string, unknown> = {};
  if (Object.keys(journalEntryFilter).length > 0) {
    linesWhere.journalEntry = journalEntryFilter;
  }

  const accounts = await prisma.chartOfAccounts.findMany({
    include: {
      journalLines: {
        where: linesWhere,
      },
    },
  });

  let totalAssets = new Decimal(0);
  let totalLiabilities = new Decimal(0);
  let totalEquity = new Decimal(0);

  const assetList: { name: string; balance: string }[] = [];
  const liabilityList: { name: string; balance: string }[] = [];
  const equityList: { name: string; balance: string }[] = [];

  for (const acc of accounts) {
    let d = new Decimal(0);
    let c = new Decimal(0);
    acc.journalLines.forEach((l) => {
      d = d.plus(new Decimal(l.debit.toString()));
      c = c.plus(new Decimal(l.credit.toString()));
    });

    if (acc.category === 'ASSET') {
      const bal = d.minus(c);
      if (!bal.isZero()) {
        totalAssets = totalAssets.plus(bal);
        assetList.push({ name: acc.accountName, balance: formatMoney(bal) });
      }
    } else if (acc.category === 'LIABILITY') {
      const bal = c.minus(d);
      if (!bal.isZero()) {
        totalLiabilities = totalLiabilities.plus(bal);
        liabilityList.push({ name: acc.accountName, balance: formatMoney(bal) });
      }
    } else if (acc.category === 'EQUITY') {
      const bal = c.minus(d);
      if (!bal.isZero()) {
        totalEquity = totalEquity.plus(bal);
        equityList.push({ name: acc.accountName, balance: formatMoney(bal) });
      }
    }
  }

  return res.json({
    success: true,
    data: {
      totalAssets: formatMoney(totalAssets),
      totalLiabilities: formatMoney(totalLiabilities),
      totalEquity: formatMoney(totalEquity),
      assets: assetList,
      liabilities: liabilityList,
      equity: equityList,
    },
  });
});

// ── General Ledger Drill-Down (Account Transaction History & Running Balance) ──
router.get('/accounts/ledger/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { startDate, endDate } = req.query;

    const account = await prisma.chartOfAccounts.findUnique({
      where: { accountCode: code },
    });

    if (!account) {
      return res.status(404).json({ success: false, message: `Account code '${code}' not found` });
    }

    const whereLines: Record<string, unknown> = {
      accountId: account.id,
    };

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate as string);
      if (endDate) {
        const eDate = new Date(endDate as string);
        eDate.setHours(23, 59, 59, 999);
        dateFilter.lte = eDate;
      }
      whereLines.journalEntry = { entryDate: dateFilter };
    }

    const lines = await prisma.journalEntryLine.findMany({
      where: whereLines,
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            referenceType: true,
            referenceNumber: true,
            narration: true,
          },
        },
      },
      orderBy: { journalEntry: { entryDate: 'asc' } },
    });

    const isDebitNature = account.category === 'ASSET' || account.category === 'EXPENSE';
    let running = new Decimal(0);

    const formattedLines = lines.map((l) => {
      const dr = new Decimal(l.debit.toString());
      const cr = new Decimal(l.credit.toString());

      if (isDebitNature) {
        running = running.plus(dr).minus(cr);
      } else {
        running = running.plus(cr).minus(dr);
      }

      return {
        id: l.id.toString(),
        journalId: l.journalEntry.id.toString(),
        entryNumber: l.journalEntry.entryNumber,
        entryDate: l.journalEntry.entryDate,
        referenceType: l.journalEntry.referenceType,
        referenceNumber: l.journalEntry.referenceNumber,
        narration: l.description || l.journalEntry.narration,
        debit: formatMoney(dr),
        credit: formatMoney(cr),
        runningBalance: formatMoney(running),
        rawRunningBalance: running.toNumber(),
      };
    });

    return res.json({
      success: true,
      data: {
        account: {
          id: account.id.toString(),
          accountCode: account.accountCode,
          accountName: account.accountName,
          category: account.category,
          isDebitNature,
        },
        currentBalance: formatMoney(running),
        transactions: formattedLines,
      },
    });
  } catch (error: any) {
    console.error('Error fetching account ledger:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── Year-End Financial Closing (Transfer Period Net Profit/Loss to Capital/Retained Earnings) ──
router.post('/year-end-closing', async (req: Request, res: Response) => {
  try {
    const { closingDate, targetAccountCode, notes } = req.body;
    const destCode = targetAccountCode || '3010'; // default Owner Capital 3010 or Retained Earnings 3040

    // Verify destination equity account exists
    const equityAcc = await prisma.chartOfAccounts.findUnique({
      where: { accountCode: destCode },
    });
    if (!equityAcc) {
      return res.status(400).json({ success: false, message: `Destination account '${destCode}' not found.` });
    }

    // 1. Calculate Live Net Profit
    const accounts = await prisma.chartOfAccounts.findMany({
      include: { journalLines: true },
    });

    let ownSales = new Decimal(0);
    let cogs = new Decimal(0);
    let commissionIncome = new Decimal(0);
    let opex = new Decimal(0);

    for (const acc of accounts) {
      let d = new Decimal(0);
      let c = new Decimal(0);
      acc.journalLines.forEach((l) => {
        d = d.plus(new Decimal(l.debit.toString()));
        c = c.plus(new Decimal(l.credit.toString()));
      });

      if (acc.accountCode === '4010') ownSales = ownSales.plus(c.minus(d));
      else if (acc.accountCode === '5010') cogs = cogs.plus(d.minus(c));
      else if (
        ['4020', '4030', '4035', '4040', '4510', '4520'].includes(acc.accountCode) ||
        (acc.category === 'INCOME' && acc.accountCode !== '4010')
      ) {
        commissionIncome = commissionIncome.plus(c.minus(d));
      } else if (acc.category === 'EXPENSE' && acc.accountCode !== '5010') {
        opex = opex.plus(d.minus(c));
      }
    }

    const netProfit = ownSales.minus(cogs).plus(commissionIncome).minus(opex);

    if (netProfit.isZero()) {
      return res.status(400).json({ success: false, message: 'Net profit is Rs. 0.00. No closing entry required.' });
    }

    // Ensure 3020 Opening Balance Clearing Equity exists
    let clearingAcc = await prisma.chartOfAccounts.findUnique({
      where: { accountCode: '3020' },
    });
    if (!clearingAcc) {
      clearingAcc = await prisma.chartOfAccounts.create({
        data: {
          accountCode: '3020',
          accountName: 'Opening Balance Clearing Equity',
          category: 'EQUITY',
          isSystem: true,
        },
      });
    }

    const journal = await dbTx(async (tx) => {
      const isProfit = netProfit.isPositive();
      const absAmount = netProfit.abs();

      const lines = isProfit
        ? [
            {
              accountCode: '3020',
              debit: absAmount,
              credit: 0,
              description: `Closing P&L Net Profit transfer to ${equityAcc.accountName}`,
            },
            {
              accountCode: destCode,
              debit: 0,
              credit: absAmount,
              description: `Year-end Net Profit credited to ${equityAcc.accountName}`,
            },
          ]
        : [
            {
              accountCode: destCode,
              debit: absAmount,
              credit: 0,
              description: `Year-end Net Loss deducted from ${equityAcc.accountName}`,
            },
            {
              accountCode: '3020',
              debit: 0,
              credit: absAmount,
              description: `Closing P&L Net Loss transfer to clearing`,
            },
          ];

      return await createBalancedJournalEntry({
        tx,
        entryDate: closingDate ? new Date(closingDate) : new Date(),
        referenceType: 'JOURNAL_ENTRY',
        referenceId: BigInt(Date.now()),
        referenceNumber: `CLOSE-${new Date().getFullYear()}`,
        narration:
          notes ||
          `Year-end closing: Net Profit Rs. ${formatMoney(netProfit)} transferred to ${equityAcc.accountName}`,
        lines,
      });
    });

    return res.json({
      success: true,
      message: `Year-End Closing successful! Net Profit Rs. ${formatMoney(netProfit)} transferred to ${equityAcc.accountName} via voucher ${journal.entryNumber}.`,
      data: journal,
    });
  } catch (error: any) {
    console.error('Error during year-end closing:', error);
    return res.status(500).json({ success: false, message: error.message || 'Year-end closing failed' });
  }
});

export const accountingRoutes = router;
