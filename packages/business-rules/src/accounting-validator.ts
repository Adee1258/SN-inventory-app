import { Decimal, toMoney, formatMoney } from './decimal-utils.js';

export interface JournalLineVerificationItem {
  accountId: number;
  debit: Decimal.Value;
  credit: Decimal.Value;
}

export interface JournalBalanceValidationResult {
  isValid: boolean;
  totalDebit: string;
  totalCredit: string;
  difference: string;
  error?: string;
}

/**
 * Validates that all debit amounts equal credit amounts in an accounting journal.
 * Enforces double-entry equality to 4 decimal places.
 */
export function validateJournalBalance(
  lines: JournalLineVerificationItem[]
): JournalBalanceValidationResult {
  if (!lines || lines.length < 2) {
    return {
      isValid: false,
      totalDebit: '0.0000',
      totalCredit: '0.0000',
      difference: '0.0000',
      error: 'A balanced journal entry must contain at least two lines.',
    };
  }

  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  for (const line of lines) {
    const debitDec = toMoney(line.debit);
    const creditDec = toMoney(line.credit);

    if (debitDec.isNegative() || creditDec.isNegative()) {
      return {
        isValid: false,
        totalDebit: formatMoney(totalDebit),
        totalCredit: formatMoney(totalCredit),
        difference: '0.0000',
        error: `Negative amounts are forbidden in journal entries (debit: ${debitDec}, credit: ${creditDec}).`,
      };
    }

    if (!debitDec.isZero() && !creditDec.isZero()) {
      return {
        isValid: false,
        totalDebit: formatMoney(totalDebit),
        totalCredit: formatMoney(totalCredit),
        difference: '0.0000',
        error: 'A single journal line cannot have both non-zero debit and credit values.',
      };
    }

    totalDebit = totalDebit.plus(debitDec);
    totalCredit = totalCredit.plus(creditDec);
  }

  const diff = totalDebit.minus(totalCredit).abs();
  const isValid = diff.isZero();

  return {
    isValid,
    totalDebit: formatMoney(totalDebit),
    totalCredit: formatMoney(totalCredit),
    difference: formatMoney(diff),
    error: isValid
      ? undefined
      : `UNBALANCED_JOURNAL: Total debits (${formatMoney(totalDebit)}) do not equal total credits (${formatMoney(totalCredit)}). Difference: ${formatMoney(diff)}.`,
  };
}
