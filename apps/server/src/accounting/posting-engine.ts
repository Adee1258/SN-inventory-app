import type { Prisma } from '@prisma/client';
import { validateJournalBalance, toMoney, formatMoney, Decimal } from '@erp/business-rules';
import type { DocumentReferenceType } from '@erp/shared-types';

export interface CreateJournalParams {
  tx: Prisma.TransactionClient;
  entryDate: Date | string;
  referenceType: DocumentReferenceType;
  referenceId: bigint;
  referenceNumber: string;
  narration: string;
  lines: {
    accountCode: string;
    debit: Decimal.Value;
    credit: Decimal.Value;
    partyType?: 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE';
    partyId?: bigint;
    description?: string;
  }[];
}

/**
 * Centralized Double-Entry Accounting Posting Engine.
 * All financial journals must pass through this engine to enforce deterministic balancing.
 */
export async function createBalancedJournalEntry(params: CreateJournalParams) {
  const { tx, entryDate, referenceType, referenceId, referenceNumber, narration, lines } = params;

  // Resolve account IDs for codes
  const accountCodes = lines.map((l) => l.accountCode);
  const accounts = await tx.chartOfAccounts.findMany({
    where: { accountCode: { in: accountCodes } },
  });

  const accountMap = new Map<string, bigint>();
  accounts.forEach((a) => accountMap.set(a.accountCode, a.id));

  // Verify all accounts exist
  for (const code of accountCodes) {
    if (!accountMap.has(code)) {
      throw new Error(`ACCOUNT_NOT_FOUND: General Ledger account code '${code}' does not exist.`);
    }
  }

  // Format lines for validation
  const validationLines = lines.map((l) => ({
    accountId: Number(accountMap.get(l.accountCode)!),
    debit: l.debit,
    credit: l.credit,
  }));

  const validation = validateJournalBalance(validationLines);
  if (!validation.isValid) {
    throw new Error(validation.error || 'UNBALANCED_JOURNAL: Debits do not equal credits');
  }

  // Fetch sequence for entry number
  const seq = await tx.documentSequence.upsert({
    where: { sequenceType: 'JOURNAL_ENTRY' },
    update: { currentNumber: { increment: 1 } },
    create: { sequenceType: 'JOURNAL_ENTRY', prefix: 'JV-', currentNumber: BigInt(1), paddingLength: 5 },
  });

  const paddedNum = seq.currentNumber.toString().padStart(seq.paddingLength, '0');
  const entryNumber = `${seq.prefix}${paddedNum}`;

  // Create Journal Header
  const journal = await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: new Date(entryDate),
      referenceType,
      referenceId,
      referenceNumber,
      narration,
      totalDebit: new Decimal(validation.totalDebit),
      totalCredit: new Decimal(validation.totalCredit),
      lines: {
        create: lines.map((l) => ({
          accountId: accountMap.get(l.accountCode)!,
          debit: toMoney(l.debit),
          credit: toMoney(l.credit),
          partyType: l.partyType,
          partyId: l.partyId,
          description: l.description,
        })),
      },
    },
    include: {
      lines: true,
    },
  });

  return journal;
}
