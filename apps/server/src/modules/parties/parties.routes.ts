import { Router, type Request, type Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { CustomerCreateSchema, SupplierCreateSchema } from '@erp/validation';
import { requireOwnerAuth } from '../../middleware/auth.js';
import { Decimal } from '@erp/business-rules';
import { createBalancedJournalEntry } from '../../accounting/posting-engine.js';

const router = Router();

// ----------------- CUSTOMERS -----------------
router.get('/customers', async (_req: Request, res: Response) => {
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ success: true, data: customers });
});

router.post('/customers', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = CustomerCreateSchema.parse(req.body);

  const customer = await prisma.$transaction(async (tx) => {
    const openingBalDec = new Decimal(validated.openingBalance);
    const newCust = await tx.customer.create({
      data: {
        code: validated.code,
        name: validated.name,
        phone: validated.phone,
        address: validated.address,
        openingBalance: openingBalDec,
        currentBalance: openingBalDec,
        creditLimit: validated.creditLimit ? new Decimal(validated.creditLimit) : null,
        notes: validated.notes,
      },
    });

    // If opening balance != 0, create opening journal entry
    if (!openingBalDec.isZero()) {
      if (openingBalDec.isPositive()) {
        // Customer owes money to shop: Debit 1020, Credit 3020 (Opening Balance Equity)
        await createBalancedJournalEntry({
          tx,
          entryDate: new Date(),
          referenceType: 'OPENING_STOCK',
          referenceId: newCust.id,
          referenceNumber: `CUST-OP-${newCust.code}`,
          narration: `Opening balance for customer ${newCust.name}`,
          lines: [
            {
              accountCode: '1020',
              debit: openingBalDec,
              credit: 0,
              partyType: 'CUSTOMER',
              partyId: newCust.id,
              description: 'Customer opening debit balance',
            },
            {
              accountCode: '3020',
              debit: 0,
              credit: openingBalDec,
              description: 'Opening balance equity clearing',
            },
          ],
        });
      } else {
        // Customer has advance credit: Debit 3020, Credit 1020
        const absVal = openingBalDec.abs();
        await createBalancedJournalEntry({
          tx,
          entryDate: new Date(),
          referenceType: 'OPENING_STOCK',
          referenceId: newCust.id,
          referenceNumber: `CUST-OP-${newCust.code}`,
          narration: `Opening advance credit balance for customer ${newCust.name}`,
          lines: [
            {
              accountCode: '3020',
              debit: absVal,
              credit: 0,
              description: 'Opening balance equity clearing',
            },
            {
              accountCode: '1020',
              debit: 0,
              credit: absVal,
              partyType: 'CUSTOMER',
              partyId: newCust.id,
              description: 'Customer opening advance balance',
            },
          ],
        });
      }
    }

    return newCust;
  });

  return res.status(201).json({ success: true, data: customer });
});

// Update Customer Details
router.put('/customers/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const customerId = BigInt(req.params.id);
  const { name, phone, address, creditLimit, notes, openingBalance, currentBalance } = req.body;

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(address !== undefined && { address }),
      ...(creditLimit !== undefined && { creditLimit: creditLimit ? new Decimal(creditLimit) : null }),
      ...(notes !== undefined && { notes }),
      ...(openingBalance !== undefined && { openingBalance: new Decimal(openingBalance || 0) }),
      ...(currentBalance !== undefined && { currentBalance: new Decimal(currentBalance || 0) }),
    },
  });

  return res.json({ success: true, data: updated });
});

// Delete or Deactivate Customer
router.delete('/customers/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const customerId = BigInt(req.params.id);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      salesInvoices: { select: { id: true }, take: 1 },
      salesReturns: { select: { id: true }, take: 1 },
    },
  });

  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }

  // Check if historical financial transactions exist
  const hasTransactions = customer.salesInvoices.length > 0 || customer.salesReturns.length > 0;

  if (hasTransactions) {
    // If transactions exist, deactivate party so historical ledgers and audits remain intact
    await prisma.customer.update({
      where: { id: customerId },
      data: { isActive: false },
    });
    return res.json({
      success: true,
      message: `Customer '${customer.name}' has existing invoice history and has been deactivated.`,
      deactivated: true,
    });
  }

  // If no transactions exist, remove opening journal lines and delete record cleanly
  await prisma.$transaction(async (tx) => {
    // Clean up opening journal lines if any
    const openingJournals = await tx.journalEntry.findMany({
      where: { referenceType: 'OPENING_STOCK', referenceId: customerId },
      select: { id: true },
    });
    for (const j of openingJournals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    await tx.customer.delete({ where: { id: customerId } });
  });

  return res.json({ success: true, message: `Customer '${customer.name}' deleted successfully.` });
});

// Customer Ledger Statement
router.get('/customers/:id/ledger', async (req: Request, res: Response) => {
  const customerId = BigInt(req.params.id);
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: { customerId },
    orderBy: { invoiceDate: 'asc' },
  });

  const receipts = await prisma.receiptVoucher.findMany({
    where: { partyType: 'CUSTOMER', partyId: customerId },
    orderBy: { voucherDate: 'asc' },
  });

  const payments = await prisma.paymentVoucher.findMany({
    where: { partyType: 'CUSTOMER', partyId: customerId },
    orderBy: { voucherDate: 'asc' },
  });

  return res.json({
    success: true,
    data: {
      customer,
      invoices,
      receipts,
      payments,
    },
  });
});

// ----------------- SUPPLIERS -----------------
router.get('/suppliers', async (_req: Request, res: Response) => {
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    include: {
      _count: {
        select: {
          consignmentReceipts: true,
          commissionAgreements: true,
          purchaseInvoices: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return res.json({ success: true, data: suppliers });
});

router.post('/suppliers', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = SupplierCreateSchema.parse(req.body);

  const supplier = await prisma.$transaction(async (tx) => {
    const ownBalDec = new Decimal(validated.openingBalanceOwn);
    const consBalDec = new Decimal(validated.openingBalanceConsignment);

    const newSupp = await tx.supplier.create({
      data: {
        code: validated.code,
        name: validated.name,
        phone: validated.phone,
        address: validated.address,
        openingBalanceOwn: ownBalDec,
        openingBalanceConsignment: consBalDec,
        currentBalanceOwn: ownBalDec,
        currentBalanceConsignment: consBalDec,
        notes: validated.notes,
      },
    });

    // Opening journals if balances exist
    if (!ownBalDec.isZero()) {
      await createBalancedJournalEntry({
        tx,
        entryDate: new Date(),
        referenceType: 'OPENING_STOCK',
        referenceId: newSupp.id,
        referenceNumber: `SUPP-OWN-OP-${newSupp.code}`,
        narration: `Opening payable for own-stock supplier ${newSupp.name}`,
        lines: [
          {
            accountCode: '3020',
            debit: ownBalDec,
            credit: 0,
            description: 'Opening balance equity clearing',
          },
          {
            accountCode: '2010',
            debit: 0,
            credit: ownBalDec,
            partyType: 'SUPPLIER',
            partyId: newSupp.id,
            description: 'Own-stock supplier opening balance',
          },
        ],
      });
    }

    if (!consBalDec.isZero()) {
      await createBalancedJournalEntry({
        tx,
        entryDate: new Date(),
        referenceType: 'OPENING_STOCK',
        referenceId: newSupp.id,
        referenceNumber: `SUPP-CONS-OP-${newSupp.code}`,
        narration: `Opening consignment payable for supplier ${newSupp.name}`,
        lines: [
          {
            accountCode: '3020',
            debit: consBalDec,
            credit: 0,
            description: 'Opening balance equity clearing',
          },
          {
            accountCode: '2020',
            debit: 0,
            credit: consBalDec,
            partyType: 'SUPPLIER',
            partyId: newSupp.id,
            description: 'Consignment payable opening balance',
          },
        ],
      });
    }

    return newSupp;
  });

  return res.status(201).json({ success: true, data: supplier });
});

// Update Supplier Details
router.put('/suppliers/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const supplierId = BigInt(req.params.id);
  const {
    name,
    phone,
    address,
    notes,
    openingBalanceOwn,
    openingBalanceConsignment,
    currentBalanceOwn,
    currentBalanceConsignment,
  } = req.body;

  const updated = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(address !== undefined && { address }),
      ...(notes !== undefined && { notes }),
      ...(openingBalanceOwn !== undefined && { openingBalanceOwn: new Decimal(openingBalanceOwn || 0) }),
      ...(openingBalanceConsignment !== undefined && {
        openingBalanceConsignment: new Decimal(openingBalanceConsignment || 0),
      }),
      ...(currentBalanceOwn !== undefined && { currentBalanceOwn: new Decimal(currentBalanceOwn || 0) }),
      ...(currentBalanceConsignment !== undefined && {
        currentBalanceConsignment: new Decimal(currentBalanceConsignment || 0),
      }),
    },
  });

  return res.json({ success: true, data: updated });
});

// Delete or Deactivate Supplier
router.delete('/suppliers/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const supplierId = BigInt(req.params.id);

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      purchaseInvoices: { select: { id: true }, take: 1 },
      consignmentReceipts: { select: { id: true }, take: 1 },
      supplierSettlements: { select: { id: true }, take: 1 },
    },
  });

  if (!supplier) {
    return res.status(404).json({ success: false, message: 'Supplier not found' });
  }

  const hasTransactions =
    supplier.purchaseInvoices.length > 0 ||
    supplier.consignmentReceipts.length > 0 ||
    supplier.supplierSettlements.length > 0;

  if (hasTransactions) {
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { isActive: false },
    });
    return res.json({
      success: true,
      message: `Supplier '${supplier.name}' has transaction history and has been deactivated.`,
      deactivated: true,
    });
  }

  await prisma.$transaction(async (tx) => {
    // Clean up opening journal lines
    const openingJournals = await tx.journalEntry.findMany({
      where: { referenceType: 'OPENING_STOCK', referenceId: supplierId },
      select: { id: true },
    });
    for (const j of openingJournals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    await tx.supplier.delete({ where: { id: supplierId } });
  });

  return res.json({ success: true, message: `Supplier '${supplier.name}' deleted successfully.` });
});

// Supplier Ledger Statement (Distinguishes Own Stock vs Commission Payable)
router.get('/suppliers/:id/ledger', async (req: Request, res: Response) => {
  const supplierId = BigInt(req.params.id);
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) {
    return res.status(404).json({ success: false, message: 'Supplier not found' });
  }

  const purchases = await prisma.purchaseInvoice.findMany({
    where: { supplierId },
    orderBy: { invoiceDate: 'asc' },
  });

  const consignmentReceipts = await prisma.consignmentReceipt.findMany({
    where: { supplierId },
    include: { items: { include: { item: true } } },
    orderBy: { receiptDate: 'asc' },
  });

  const settlements = await prisma.supplierSettlement.findMany({
    where: { supplierId },
    orderBy: { settlementDate: 'asc' },
  });

  const advances = await prisma.supplierAdvance.findMany({
    where: { supplierId },
    orderBy: { advanceDate: 'asc' },
  });

  return res.json({
    success: true,
    data: {
      supplier,
      purchases,
      consignmentReceipts,
      settlements,
      advances,
    },
  });
});

// ----------------- EMPLOYEES & ADVANCES -----------------
interface EmployeeAdvanceItem {
  id: string;
  date: string;
  amount: string;
  type: 'GIVEN' | 'DEDUCTED';
  notes?: string;
}

function parseEmployeeNotes(rawNotes: string | null | undefined) {
  let openingBalance = '0.00';
  let advances: EmployeeAdvanceItem[] = [];
  let userNotes = '';

  if (rawNotes) {
    try {
      if (rawNotes.trim().startsWith('{') && rawNotes.trim().endsWith('}')) {
        const parsed = JSON.parse(rawNotes);
        openingBalance = parsed.openingBalance !== undefined ? String(parsed.openingBalance) : '0.00';
        advances = Array.isArray(parsed.advances) ? parsed.advances : [];
        userNotes = parsed.remarks || '';
      } else {
        userNotes = rawNotes;
      }
    } catch {
      userNotes = rawNotes;
    }
  }

  const opBal = parseFloat(openingBalance) || 0;
  const netAdv = advances.reduce((sum, a) => {
    const val = parseFloat(a.amount) || 0;
    return a.type === 'DEDUCTED' ? sum - val : sum + val;
  }, opBal);

  const currentAdvance = netAdv.toFixed(2);
  return { openingBalance, currentAdvance, advances, userNotes };
}

function stringifyEmployeeNotes(data: {
  openingBalance?: string | number;
  advances?: EmployeeAdvanceItem[];
  userNotes?: string;
}) {
  return JSON.stringify({
    openingBalance: data.openingBalance !== undefined ? String(data.openingBalance) : '0.00',
    advances: data.advances || [],
    remarks: data.userNotes || '',
  });
}

// List Employees
router.get('/employees', async (_req: Request, res: Response) => {
  const employees = await prisma.employee.findMany({
    orderBy: { name: 'asc' },
  });

  const empPayments = await prisma.paymentVoucher.findMany({
    where: { partyType: 'EMPLOYEE' },
    orderBy: { voucherDate: 'desc' },
  });

  const formatted = employees.map((emp) => {
    const extra = parseEmployeeNotes(emp.notes);
    const paymentsForEmp = empPayments.filter((p) => p.partyId && p.partyId.toString() === emp.id.toString());
    const totalSalaryPaid = paymentsForEmp.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const lastPayment = paymentsForEmp[0];

    return {
      id: Number(emp.id),
      name: emp.name,
      phone: emp.phone,
      address: emp.address,
      jobTitle: emp.jobTitle,
      salary: emp.salary.toString(),
      joiningDate: emp.joiningDate ? emp.joiningDate.toISOString().split('T')[0] : null,
      openingBalance: extra.openingBalance,
      currentAdvance: extra.currentAdvance,
      advances: extra.advances,
      notes: extra.userNotes,
      isActive: emp.isActive,
      totalSalaryPaid: totalSalaryPaid.toFixed(2),
      lastSalaryPaidDate: lastPayment ? lastPayment.voucherDate.toISOString().split('T')[0] : null,
      lastSalaryPaidAmount: lastPayment ? Number(lastPayment.amount).toFixed(2) : null,
      salaryPayments: paymentsForEmp.map((p) => ({
        id: Number(p.id),
        voucherNumber: p.voucherNumber,
        date: p.voucherDate.toISOString().split('T')[0],
        amount: Number(p.amount).toFixed(2),
        narration: p.narration,
      })),
    };
  });

  return res.json({ success: true, data: formatted });
});

// Create Employee
router.post('/employees', requireOwnerAuth, async (req: Request, res: Response) => {
  const { name, phone, address, jobTitle, salary, joiningDate, notes, openingBalance } = req.body;
  if (!name || !phone || !jobTitle) {
    return res.status(400).json({ success: false, message: 'Name, phone and job title are required' });
  }

  const notesJson = stringifyEmployeeNotes({
    openingBalance: openingBalance || '0.00',
    advances: [],
    userNotes: notes || '',
  });

  const employee = await prisma.employee.create({
    data: {
      name,
      phone,
      address,
      jobTitle,
      salary: salary ? new Decimal(salary) : new Decimal(0),
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      notes: notesJson,
    },
  });

  const extra = parseEmployeeNotes(employee.notes);
  return res.status(201).json({
    success: true,
    data: {
      ...employee,
      id: Number(employee.id),
      openingBalance: extra.openingBalance,
      currentAdvance: extra.currentAdvance,
      advances: extra.advances,
      notes: extra.userNotes,
    },
  });
});

// Update Employee Profile
router.put('/employees/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const employeeId = BigInt(req.params.id);
  const { name, phone, address, jobTitle, salary, joiningDate, notes, openingBalance } = req.body;

  const existing = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!existing) return res.status(404).json({ success: false, message: 'Employee not found' });

  const extra = parseEmployeeNotes(existing.notes);
  const newNotesJson = stringifyEmployeeNotes({
    openingBalance: openingBalance !== undefined ? openingBalance : extra.openingBalance,
    advances: extra.advances,
    userNotes: notes !== undefined ? notes : extra.userNotes,
  });

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(address !== undefined && { address }),
      ...(jobTitle && { jobTitle }),
      ...(salary !== undefined && { salary: new Decimal(salary) }),
      ...(joiningDate && { joiningDate: new Date(joiningDate) }),
      notes: newNotesJson,
    },
  });

  const parsed = parseEmployeeNotes(updated.notes);
  return res.json({
    success: true,
    data: {
      ...updated,
      id: Number(updated.id),
      openingBalance: parsed.openingBalance,
      currentAdvance: parsed.currentAdvance,
      advances: parsed.advances,
      notes: parsed.userNotes,
    },
  });
});

// Record Advance (Given or Deducted / Returned)
router.post('/employees/:id/advance', requireOwnerAuth, async (req: Request, res: Response) => {
  const employeeId = BigInt(req.params.id);
  const { amount, date, notes, type, cashBankAccountId } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Valid advance amount required' });
  }

  const existing = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!existing) return res.status(404).json({ success: false, message: 'Employee not found' });

  const extra = parseEmployeeNotes(existing.notes);
  const newAdvanceItem: EmployeeAdvanceItem = {
    id: 'adv_' + Date.now() + '_' + Math.floor(Math.random() * 100),
    date: date || new Date().toISOString().split('T')[0],
    amount: new Decimal(amount).toFixed(2),
    type: type === 'DEDUCTED' ? 'DEDUCTED' : 'GIVEN',
    notes: notes || '',
  };

  const updatedAdvances = [newAdvanceItem, ...extra.advances];
  const newNotesJson = stringifyEmployeeNotes({
    openingBalance: extra.openingBalance,
    advances: updatedAdvances,
    userNotes: extra.userNotes,
  });

  // If cashBankAccountId is provided, update cash balance
  if (cashBankAccountId && Number(cashBankAccountId) > 0) {
    const cashAcc = await prisma.cashBankAccount.findUnique({
      where: { id: BigInt(cashBankAccountId) },
    });
    if (cashAcc) {
      const advAmt = new Decimal(amount);
      if (type === 'DEDUCTED') {
        // Cash returned into register
        await prisma.cashBankAccount.update({
          where: { id: cashAcc.id },
          data: { currentBalance: { increment: advAmt } },
        });
      } else {
        // Cash disbursed from register
        await prisma.cashBankAccount.update({
          where: { id: cashAcc.id },
          data: { currentBalance: { decrement: advAmt } },
        });
      }
    }
  }

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: { notes: newNotesJson },
  });

  const parsed = parseEmployeeNotes(updated.notes);
  return res.json({
    success: true,
    data: {
      ...updated,
      id: Number(updated.id),
      openingBalance: parsed.openingBalance,
      currentAdvance: parsed.currentAdvance,
      advances: parsed.advances,
      notes: parsed.userNotes,
    },
  });
});

// Delete an advance record from employee history
router.delete('/employees/:id/advance/:advanceId', requireOwnerAuth, async (req: Request, res: Response) => {
  const employeeId = BigInt(req.params.id);
  const { advanceId } = req.params;

  const existing = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!existing) return res.status(404).json({ success: false, message: 'Employee not found' });

  const extra = parseEmployeeNotes(existing.notes);
  const updatedAdvances = extra.advances.filter((a) => a.id !== advanceId);
  const newNotesJson = stringifyEmployeeNotes({
    openingBalance: extra.openingBalance,
    advances: updatedAdvances,
    userNotes: extra.userNotes,
  });

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: { notes: newNotesJson },
  });

  const parsed = parseEmployeeNotes(updated.notes);
  return res.json({
    success: true,
    data: {
      ...updated,
      id: Number(updated.id),
      openingBalance: parsed.openingBalance,
      currentAdvance: parsed.currentAdvance,
      advances: parsed.advances,
      notes: parsed.userNotes,
    },
  });
});

// Delete Employee
router.delete('/employees/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const employeeId = BigInt(req.params.id);
  await prisma.employee.delete({ where: { id: employeeId } });
  return res.json({ success: true, message: 'Employee record deleted successfully.' });
});

// Recalculate & Sync All Customer and Supplier Balances
router.post('/recalculate', requireOwnerAuth, async (_req: Request, res: Response) => {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Customers
    const customers = await tx.customer.findMany({
      include: {
        salesInvoices: {
          select: { remainingBalance: true },
        },
      },
    });

    for (const cust of customers) {
      const invoiceRemaining = cust.salesInvoices.reduce(
        (acc: Decimal, inv: { remainingBalance: Decimal | string }) =>
          acc.plus(new Decimal(inv.remainingBalance.toString())),
        new Decimal(0)
      );

      const receipts = await tx.receiptVoucher.findMany({
        where: { partyType: 'CUSTOMER', partyId: cust.id },
        select: { amount: true },
      });
      const totalReceipts = receipts.reduce(
        (acc, r) => acc.plus(new Decimal(r.amount.toString())),
        new Decimal(0)
      );

      const payments = await tx.paymentVoucher.findMany({
        where: { partyType: 'CUSTOMER', partyId: cust.id },
        select: { amount: true },
      });
      const totalPayments = payments.reduce(
        (acc, p) => acc.plus(new Decimal(p.amount.toString())),
        new Decimal(0)
      );

      if (cust.salesInvoices.length === 0 && totalReceipts.isZero() && totalPayments.isZero()) {
        // No surviving sales invoices or vouchers: automatically reset customer balance to 0
        await tx.customer.update({
          where: { id: cust.id },
          data: { currentBalance: new Decimal(0), openingBalance: new Decimal(0) },
        });
      } else {
        const opening = new Decimal(cust.openingBalance.toString());
        const newBalance = opening.plus(invoiceRemaining).minus(totalReceipts).plus(totalPayments);

        await tx.customer.update({
          where: { id: cust.id },
          data: { currentBalance: newBalance },
        });
      }
    }

    // 2. Suppliers
    const suppliers = await tx.supplier.findMany({
      include: {
        purchaseInvoices: {
          select: { remainingBalance: true },
        },
      },
    });

    for (const supp of suppliers) {
      // Active opening stock items with Payment: CREDIT for this supplier
      const creditOpeningItems = await tx.openingStockItem.findMany({
        where: {
          supplierId: supp.id,
          notes: { contains: 'Payment: CREDIT' },
        },
        select: { baseQuantity: true, unitCost: true, notes: true },
      });

      let rawCreditTotal = new Decimal(0);
      for (const it of creditOpeningItems) {
        const baseQty = new Decimal(it.baseQuantity.toString());
        const cost = new Decimal(it.unitCost.toString());
        let extraCharges = new Decimal(0);
        const m = it.notes?.match(/Extra Charges: Rs\.([\d.]+)/);
        if (m) extraCharges = new Decimal(m[1]);
        rawCreditTotal = rawCreditTotal.plus(baseQty.times(cost).plus(extraCharges));
      }

      const purchaseRemaining = supp.purchaseInvoices.reduce(
        (acc: Decimal, inv: { remainingBalance: Decimal | string }) =>
          acc.plus(new Decimal(inv.remainingBalance.toString())),
        new Decimal(0)
      );

      // Consignment payables from sales
      const consignmentSales = await tx.salesInvoiceItem.findMany({
        where: { supplierId: supp.id, ownershipType: 'CONSIGNMENT' },
        select: { supplierPayable: true },
      });
      const consignmentPayableTotal = consignmentSales.reduce(
        (acc: Decimal, s: { supplierPayable: Decimal | string }) =>
          acc.plus(new Decimal(s.supplierPayable.toString())),
        new Decimal(0)
      );

      // Settlements paid to consignment supplier
      const settlements = await tx.supplierSettlement.findMany({
        where: { supplierId: supp.id },
        select: { netPaidAmount: true },
      });
      const settlementTotal = settlements.reduce(
        (acc: Decimal, s: { netPaidAmount: Decimal | string }) =>
          acc.plus(new Decimal(s.netPaidAmount.toString())),
        new Decimal(0)
      );

      // If supplier has no surviving purchases or raw stock, reset own AP to 0
      const newBalanceOwn =
        supp.purchaseInvoices.length === 0 && creditOpeningItems.length === 0
          ? new Decimal(0)
          : new Decimal(supp.openingBalanceOwn.toString()).plus(purchaseRemaining).plus(rawCreditTotal);

      const newBalanceCons =
        consignmentSales.length === 0
          ? new Decimal(0)
          : new Decimal(supp.openingBalanceConsignment.toString())
              .plus(consignmentPayableTotal)
              .minus(settlementTotal);

      await tx.supplier.update({
        where: { id: supp.id },
        data: {
          currentBalanceOwn: newBalanceOwn,
          currentBalanceConsignment: newBalanceCons,
          ...(supp.purchaseInvoices.length === 0 && creditOpeningItems.length === 0 && { openingBalanceOwn: new Decimal(0) }),
          ...(consignmentSales.length === 0 && { openingBalanceConsignment: new Decimal(0) }),
        },
      });
    }

    return { customerCount: customers.length, supplierCount: suppliers.length };
  });

  return res.json({
    success: true,
    message: `Recalculated balances for ${result.customerCount} customer(s) and ${result.supplierCount} supplier(s) successfully.`,
    data: result,
  });
});

export const partyRoutes = router;
