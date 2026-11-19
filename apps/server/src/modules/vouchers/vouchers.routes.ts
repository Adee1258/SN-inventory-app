import { Router, type Request, type Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { ReceiptVoucherSchema, PaymentVoucherSchema } from '@erp/validation';
import { requireOwnerAuth } from '../../middleware/auth.js';
import { Decimal, toMoney } from '@erp/business-rules';
import { createBalancedJournalEntry } from '../../accounting/posting-engine.js';

const router = Router();

// List Cash & Bank Accounts
router.get('/accounts', async (_req: Request, res: Response) => {
  const accounts = await prisma.cashBankAccount.findMany({
    orderBy: { accountName: 'asc' },
  });
  return res.json({ success: true, data: accounts });
});

// List Receipts (with auto-cleanup of orphan customer vouchers)
router.get('/receipts', async (_req: Request, res: Response) => {
  try {
    const allCustomers = await prisma.customer.findMany({ select: { id: true } });
    const existingCustomerIds = new Set(allCustomers.map((c) => c.id.toString()));

    const orphanCustomerReceipts = await prisma.receiptVoucher.findMany({
      where: { partyType: 'CUSTOMER' },
    });

    for (const rv of orphanCustomerReceipts) {
      if (rv.partyId && !existingCustomerIds.has(rv.partyId.toString())) {
        await prisma.cashBankAccount.update({
          where: { id: rv.cashBankAccountId },
          data: { currentBalance: { decrement: rv.amount } },
        });

        const journals = await prisma.journalEntry.findMany({
          where: { referenceType: 'RECEIPT_VOUCHER', referenceId: rv.id },
          select: { id: true },
        });
        for (const j of journals) {
          await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
          await prisma.journalEntry.delete({ where: { id: j.id } });
        }

        await prisma.receiptVoucher.delete({ where: { id: rv.id } });
      }
    }
  } catch (err) {
    console.error('Error in orphan receipt cleanup:', err);
  }

  const receipts = await prisma.receiptVoucher.findMany({
    include: { cashBankAccount: true },
    orderBy: { voucherDate: 'desc' },
  });
  return res.json({ success: true, data: receipts });
});

// Post Receipt Voucher
router.post('/receipts', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = ReceiptVoucherSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const cashAccount = await tx.cashBankAccount.findUnique({
      where: { id: BigInt(validated.cashBankAccountId) },
    });
    if (!cashAccount) throw new Error('Cash/Bank account not found');

    const creditAccount = await tx.chartOfAccounts.findUnique({
      where: { id: BigInt(validated.creditAccountId) },
    });
    if (!creditAccount) throw new Error('Credit account not found');

    const amt = toMoney(validated.amount);

    // Sequence
    const seq = await tx.documentSequence.upsert({
      where: { sequenceType: 'RECEIPT_VOUCHER' },
      update: { currentNumber: { increment: 1 } },
      create: { sequenceType: 'RECEIPT_VOUCHER', prefix: 'RCT-', currentNumber: BigInt(1), paddingLength: 5 },
    });
    const voucherNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;

    const voucher = await tx.receiptVoucher.create({
      data: {
        voucherNumber,
        voucherDate: new Date(validated.voucherDate),
        cashBankAccountId: cashAccount.id,
        amount: amt,
        partyType: validated.partyType,
        partyId: validated.partyId ? BigInt(validated.partyId) : null,
        creditAccountId: creditAccount.id,
        referenceNumber: validated.referenceNumber,
        narration: validated.narration,
      },
    });

    // Update Cash Balance
    await tx.cashBankAccount.update({
      where: { id: cashAccount.id },
      data: { currentBalance: { increment: amt } },
    });

    // Update Customer or Supplier Balance if applicable
    if (validated.partyType === 'CUSTOMER' && validated.partyId) {
      await tx.customer.update({
        where: { id: BigInt(validated.partyId) },
        data: { currentBalance: { decrement: amt } },
      });
    } else if (validated.partyType === 'SUPPLIER' && validated.partyId) {
      if (creditAccount.accountCode === '2020') {
        // Commission / Consignment Supplier receipt (e.g. advance return or refund)
        await tx.supplier.update({
          where: { id: BigInt(validated.partyId) },
          data: { currentBalanceConsignment: { increment: amt } },
        });
      } else if (creditAccount.accountCode === '2010') {
        // Own-stock Trade Supplier receipt (e.g. refund)
        await tx.supplier.update({
          where: { id: BigInt(validated.partyId) },
          data: { currentBalanceOwn: { increment: amt } },
        });
      }
    } else if (validated.partyType === 'EMPLOYEE' && validated.partyId) {
      // Employee returned cash advance back into the business
      const emp = await tx.employee.findUnique({ where: { id: BigInt(validated.partyId) } });
      if (emp) {
        let opBal = '0.00';
        let advs: any[] = [];
        let uNotes = '';
        if (emp.notes) {
          try {
            if (emp.notes.trim().startsWith('{')) {
              const p = JSON.parse(emp.notes);
              opBal = p.openingBalance || '0.00';
              advs = Array.isArray(p.advances) ? p.advances : [];
              uNotes = p.remarks || '';
            }
          } catch {}
        }
        const newAdv = {
          id: 'adv_' + Date.now(),
          date: validated.voucherDate,
          amount: amt.toFixed(2),
          type: 'DEDUCTED',
          notes: validated.narration || 'Advance return received from employee',
        };
        const updatedJson = JSON.stringify({
          openingBalance: opBal,
          advances: [newAdv, ...advs],
          remarks: uNotes,
        });
        await tx.employee.update({
          where: { id: emp.id },
          data: { notes: updatedJson },
        });
      }
    }

    // Balanced Journal Entry:
    // Debit: 1010/1011 (Cash/Bank)
    // Credit: creditAccount.accountCode (e.g. 1020 Customer Receivable or other)
    await createBalancedJournalEntry({
      tx,
      entryDate: validated.voucherDate,
      referenceType: 'RECEIPT_VOUCHER',
      referenceId: voucher.id,
      referenceNumber: voucherNumber,
      narration: validated.narration,
      lines: [
        {
          accountCode: cashAccount.accountType === 'BANK' ? '1011' : '1010',
          debit: amt,
          credit: 0,
          description: `Receipt into ${cashAccount.accountName}`,
        },
        {
          accountCode: creditAccount.accountCode,
          debit: 0,
          credit: amt,
          partyType: validated.partyType === 'CUSTOMER' ? 'CUSTOMER' : validated.partyType === 'SUPPLIER' ? 'SUPPLIER' : validated.partyType === 'EMPLOYEE' ? 'EMPLOYEE' : undefined,
          partyId: validated.partyId ? BigInt(validated.partyId) : undefined,
          description: validated.narration,
        },
      ],
    });

    return voucher;
  });

  return res.status(201).json({ success: true, data: result });
});

// List Payments (with auto-cleanup of orphan supplier vouchers)
router.get('/payments', async (_req: Request, res: Response) => {
  try {
    const allSuppliers = await prisma.supplier.findMany({ select: { id: true } });
    const existingSupplierIds = new Set(allSuppliers.map((s) => s.id.toString()));

    const orphanSupplierPayments = await prisma.paymentVoucher.findMany({
      where: { partyType: 'SUPPLIER' },
    });

    for (const pv of orphanSupplierPayments) {
      if (pv.partyId && !existingSupplierIds.has(pv.partyId.toString())) {
        await prisma.cashBankAccount.update({
          where: { id: pv.cashBankAccountId },
          data: { currentBalance: { increment: pv.amount } },
        });

        const journals = await prisma.journalEntry.findMany({
          where: { referenceType: 'PAYMENT_VOUCHER', referenceId: pv.id },
          select: { id: true },
        });
        for (const j of journals) {
          await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
          await prisma.journalEntry.delete({ where: { id: j.id } });
        }

        await prisma.paymentVoucher.delete({ where: { id: pv.id } });
      }
    }
  } catch (err) {
    console.error('Error in orphan payment cleanup:', err);
  }

  const payments = await prisma.paymentVoucher.findMany({
    include: { cashBankAccount: true },
    orderBy: { voucherDate: 'desc' },
  });
  return res.json({ success: true, data: payments });
});

// Post Payment Voucher
router.post('/payments', requireOwnerAuth, async (req: Request, res: Response) => {
  const validated = PaymentVoucherSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const cashAccount = await tx.cashBankAccount.findUnique({
      where: { id: BigInt(validated.cashBankAccountId) },
    });
    if (!cashAccount) throw new Error('Cash/Bank account not found');

    const debitAccount = await tx.chartOfAccounts.findUnique({
      where: { id: BigInt(validated.debitAccountId) },
    });
    if (!debitAccount) throw new Error('Debit account not found');

    const amt = toMoney(validated.amount);

    // Sequence
    const seq = await tx.documentSequence.upsert({
      where: { sequenceType: 'PAYMENT_VOUCHER' },
      update: { currentNumber: { increment: 1 } },
      create: { sequenceType: 'PAYMENT_VOUCHER', prefix: 'PAY-', currentNumber: BigInt(1), paddingLength: 5 },
    });
    const voucherNumber = `${seq.prefix}${seq.currentNumber.toString().padStart(seq.paddingLength, '0')}`;

    const voucher = await tx.paymentVoucher.create({
      data: {
        voucherNumber,
        voucherDate: new Date(validated.voucherDate),
        cashBankAccountId: cashAccount.id,
        amount: amt,
        partyType: validated.partyType,
        partyId: validated.partyId ? BigInt(validated.partyId) : null,
        debitAccountId: debitAccount.id,
        referenceNumber: validated.referenceNumber,
        narration: validated.narration,
      },
    });

    // Deduct Cash Balance
    await tx.cashBankAccount.update({
      where: { id: cashAccount.id },
      data: { currentBalance: { decrement: amt } },
    });

    // Update Customer Balance if paying a customer (e.g. refund / return of advance)
    if (validated.partyType === 'CUSTOMER' && validated.partyId) {
      await tx.customer.update({
        where: { id: BigInt(validated.partyId) },
        data: { currentBalance: { increment: amt } },
      });
    }

    // Update Employee if paying employee advance
    if (validated.partyType === 'EMPLOYEE' && validated.partyId) {
      const emp = await tx.employee.findUnique({ where: { id: BigInt(validated.partyId) } });
      if (emp && debitAccount.accountCode === '1030') {
        let opBal = '0.00';
        let advs: any[] = [];
        let uNotes = '';
        if (emp.notes) {
          try {
            if (emp.notes.trim().startsWith('{')) {
              const p = JSON.parse(emp.notes);
              opBal = p.openingBalance || '0.00';
              advs = Array.isArray(p.advances) ? p.advances : [];
              uNotes = p.remarks || '';
            }
          } catch {}
        }
        const newAdv = {
          id: 'adv_' + Date.now(),
          date: validated.voucherDate,
          amount: amt.toFixed(2),
          type: 'GIVEN',
          notes: validated.narration || 'Advance Payment Voucher',
        };
        const updatedJson = JSON.stringify({
          openingBalance: opBal,
          advances: [newAdv, ...advs],
          remarks: uNotes,
        });
        await tx.employee.update({
          where: { id: emp.id },
          data: { notes: updatedJson },
        });
      }
    }

    // Update Supplier Balance if paying a supplier
    if (validated.partyType === 'SUPPLIER' && validated.partyId) {
      if (debitAccount.accountCode === '2020') {
        // Commission / Consignment Supplier payment
        await tx.supplier.update({
          where: { id: BigInt(validated.partyId) },
          data: { currentBalanceConsignment: { decrement: amt } },
        });
      } else if (debitAccount.accountCode === '2010') {
        // Own-stock Trade Supplier payment
        await tx.supplier.update({
          where: { id: BigInt(validated.partyId) },
          data: { currentBalanceOwn: { decrement: amt } },
        });
      }
    }

    // Balanced Journal Entry:
    // Debit: debitAccount.accountCode (e.g. 1020 Customer AR / 2010 AP / 5020 Labour)
    // Credit: 1010/1011 (Cash/Bank)
    await createBalancedJournalEntry({
      tx,
      entryDate: validated.voucherDate,
      referenceType: 'PAYMENT_VOUCHER',
      referenceId: voucher.id,
      referenceNumber: voucherNumber,
      narration: validated.narration,
      lines: [
        {
          accountCode: debitAccount.accountCode,
          debit: amt,
          credit: 0,
          partyType: validated.partyType === 'CUSTOMER' ? 'CUSTOMER' : validated.partyType === 'SUPPLIER' ? 'SUPPLIER' : validated.partyType === 'EMPLOYEE' ? 'EMPLOYEE' : undefined,
          partyId: validated.partyId ? BigInt(validated.partyId) : undefined,
          description: validated.narration,
        },
        {
          accountCode: cashAccount.accountType === 'BANK' ? '1011' : '1010',
          debit: 0,
          credit: amt,
          description: `Disbursement from ${cashAccount.accountName}`,
        },
      ],
    });

    return voucher;
  });

  return res.status(201).json({ success: true, data: result });
});

// Delete Receipt Voucher (Reverses Cash, Customer Receivable & Journal)
router.delete('/receipts/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const voucherId = BigInt(req.params.id);

  const result = await prisma.$transaction(async (tx) => {
    const voucher = await tx.receiptVoucher.findUnique({
      where: { id: voucherId },
    });
    if (!voucher) throw new Error('Receipt voucher not found');

    // 1. Revert Cash Account
    await tx.cashBankAccount.update({
      where: { id: voucher.cashBankAccountId },
      data: { currentBalance: { decrement: voucher.amount } },
    });

    // 2. Revert Customer or Employee Balance if receipt
    if (voucher.partyType === 'CUSTOMER' && voucher.partyId) {
      const cust = await tx.customer.findUnique({ where: { id: voucher.partyId } });
      if (cust) {
        await tx.customer.update({
          where: { id: voucher.partyId },
          data: { currentBalance: { increment: voucher.amount } },
        });
      }
    } else if (voucher.partyType === 'EMPLOYEE' && voucher.partyId) {
      const emp = await tx.employee.findUnique({ where: { id: voucher.partyId } });
      if (emp && emp.notes) {
        try {
          if (emp.notes.trim().startsWith('{')) {
            const p = JSON.parse(emp.notes);
            const advAmtStr = voucher.amount.toFixed(2);
            const advances = Array.isArray(p.advances) ? p.advances : [];
            const idx = advances.findIndex((a: any) => a.amount === advAmtStr && a.type === 'DEDUCTED');
            if (idx !== -1) advances.splice(idx, 1);
            const updatedJson = JSON.stringify({
              openingBalance: p.openingBalance || '0.00',
              advances,
              remarks: p.remarks || '',
            });
            await tx.employee.update({
              where: { id: emp.id },
              data: { notes: updatedJson },
            });
          }
        } catch {}
      }
    }

    // 3. Delete Journal Entries
    const journals = await tx.journalEntry.findMany({
      where: { referenceType: 'RECEIPT_VOUCHER', referenceId: voucher.id },
      select: { id: true },
    });
    for (const j of journals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    // 4. Delete Voucher
    await tx.receiptVoucher.delete({ where: { id: voucher.id } });

    return { message: `Receipt voucher ${voucher.voucherNumber} reversed and deleted.` };
  });

  return res.json({ success: true, data: result });
});

// Delete Payment Voucher (Reverses Cash, Supplier Payable & Journal)
router.delete('/payments/:id', requireOwnerAuth, async (req: Request, res: Response) => {
  const voucherId = BigInt(req.params.id);

  const result = await prisma.$transaction(async (tx) => {
    const voucher = await tx.paymentVoucher.findUnique({
      where: { id: voucherId },
    });
    if (!voucher) throw new Error('Payment voucher not found');

    // 1. Revert Cash Account
    await tx.cashBankAccount.update({
      where: { id: voucher.cashBankAccountId },
      data: { currentBalance: { increment: voucher.amount } },
    });

    // 2. Revert Customer, Supplier or Employee Balance
    if (voucher.partyType === 'CUSTOMER' && voucher.partyId) {
      const cust = await tx.customer.findUnique({ where: { id: voucher.partyId } });
      if (cust) {
        await tx.customer.update({
          where: { id: voucher.partyId },
          data: { currentBalance: { decrement: voucher.amount } },
        });
      }
    } else if (voucher.partyType === 'EMPLOYEE' && voucher.partyId) {
      const emp = await tx.employee.findUnique({ where: { id: voucher.partyId } });
      if (emp) {
        const debitAcc = await tx.chartOfAccounts.findUnique({ where: { id: voucher.debitAccountId } });
        if (debitAcc?.accountCode === '1030' && emp.notes) {
          try {
            if (emp.notes.trim().startsWith('{')) {
              const p = JSON.parse(emp.notes);
              const advAmtStr = voucher.amount.toFixed(2);
              const advances = Array.isArray(p.advances) ? p.advances : [];
              const idx = advances.findIndex((a: any) => a.amount === advAmtStr && a.type === 'GIVEN');
              if (idx !== -1) advances.splice(idx, 1);
              const updatedJson = JSON.stringify({
                openingBalance: p.openingBalance || '0.00',
                advances,
                remarks: p.remarks || '',
              });
              await tx.employee.update({
                where: { id: emp.id },
                data: { notes: updatedJson },
              });
            }
          } catch {}
        }
      }
    } else if (voucher.partyType === 'SUPPLIER' && voucher.partyId) {
      const supp = await tx.supplier.findUnique({ where: { id: voucher.partyId } });
      if (supp) {
        const debitAcc = await tx.chartOfAccounts.findUnique({ where: { id: voucher.debitAccountId } });
        if (debitAcc?.accountCode === '2020') {
          await tx.supplier.update({
            where: { id: voucher.partyId },
            data: { currentBalanceConsignment: { increment: voucher.amount } },
          });
        } else {
          await tx.supplier.update({
            where: { id: voucher.partyId },
            data: { currentBalanceOwn: { increment: voucher.amount } },
          });
        }
      }
    }

    // 3. Delete Journal Entries
    const journals = await tx.journalEntry.findMany({
      where: { referenceType: 'PAYMENT_VOUCHER', referenceId: voucher.id },
      select: { id: true },
    });
    for (const j of journals) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: j.id } });
      await tx.journalEntry.delete({ where: { id: j.id } });
    }

    // 4. Delete Voucher
    await tx.paymentVoucher.delete({ where: { id: voucher.id } });

    return { message: `Payment voucher ${voucher.voucherNumber} reversed and deleted.` };
  });

  return res.json({ success: true, data: result });
});

export const voucherRoutes = router;
