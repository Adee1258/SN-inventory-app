import { Decimal, toMoney, toQuantity, toPercentage, formatMoney, formatPercentage } from './decimal-utils.js';
import type { CommissionAgreementDto } from '@erp/shared-types';

export interface CommissionCalculationInput {
  baseQuantity: Decimal.Value;
  ratePerBaseUnit: Decimal.Value;
  discountAmount?: Decimal.Value;
  agreements: CommissionAgreementDto[];
  supplierId: number;
  itemId?: number;
  transactionDate: string | Date;
  fallbackDefaultPercentage?: Decimal.Value;
}

export interface CommissionCalculationResult {
  grossSaleAmount: string;
  discountAmount: string;
  netSaleAmount: string;
  commissionPercentage: string;
  commissionAmount: string;
  supplierPayableAmount: string;
  agreementIdUsed?: number;
}

/**
 * Resolves the applicable commission agreement using strict precedence:
 * 1. Supplier + Item override active on transactionDate.
 * 2. Supplier general agreement active on transactionDate.
 * 3. Configured fallback default percentage (e.g. 2.000000%).
 */
export function resolveCommissionAgreement(
  agreements: CommissionAgreementDto[],
  supplierId: number,
  itemId?: number,
  transactionDate: string | Date = new Date()
): { agreementId?: number; percentage: Decimal } {
  const targetTime = new Date(transactionDate).getTime();

  const isEligible = (a: CommissionAgreementDto) => {
    if (!a.isActive || a.supplierId !== supplierId) return false;
    const startTime = new Date(a.effectiveStartDate).getTime();
    if (targetTime < startTime) return false;
    if (a.effectiveEndDate) {
      const endTime = new Date(a.effectiveEndDate).getTime();
      if (targetTime > endTime) return false;
    }
    return true;
  };

  // 1. Check Supplier + Item specific
  if (itemId) {
    const itemOverride = agreements.find((a) => isEligible(a) && a.itemId === itemId);
    if (itemOverride) {
      return {
        agreementId: itemOverride.id,
        percentage: toPercentage(itemOverride.commissionPercentage),
      };
    }
  }

  // 2. Check Supplier general agreement
  const supplierAgreement = agreements.find((a) => isEligible(a) && !a.itemId);
  if (supplierAgreement) {
    return {
      agreementId: supplierAgreement.id,
      percentage: toPercentage(supplierAgreement.commissionPercentage),
    };
  }

  // 3. Fallback
  return {
    agreementId: undefined,
    percentage: toPercentage('2.000000'),
  };
}

/**
 * Calculates commission sale financials:
 * Gross = Base Qty * Rate
 * Net Sale = Gross - Discount
 * Commission = Net Sale * (Percentage / 100)
 * Supplier Payable = Net Sale - Commission
 */
export function calculateCommissionFinancials(
  input: CommissionCalculationInput
): CommissionCalculationResult {
  const qtyDec = toQuantity(input.baseQuantity);
  const rateDec = toMoney(input.ratePerBaseUnit);
  const discountDec = toMoney(input.discountAmount ?? 0);

  if (qtyDec.isNegative()) {
    throw new Error('Quantity cannot be negative for commission calculation');
  }

  const grossSaleDec = toMoney(qtyDec.times(rateDec));
  const netSaleDec = toMoney(Decimal.max(0, grossSaleDec.minus(discountDec)));

  const resolved = resolveCommissionAgreement(
    input.agreements,
    input.supplierId,
    input.itemId,
    input.transactionDate
  );

  const pctDec = input.fallbackDefaultPercentage
    ? toPercentage(input.fallbackDefaultPercentage)
    : resolved.percentage;

  const commissionDec = toMoney(netSaleDec.times(pctDec.dividedBy(100)));
  const supplierPayableDec = toMoney(netSaleDec.minus(commissionDec));

  return {
    grossSaleAmount: formatMoney(grossSaleDec),
    discountAmount: formatMoney(discountDec),
    netSaleAmount: formatMoney(netSaleDec),
    commissionPercentage: formatPercentage(pctDec),
    commissionAmount: formatMoney(commissionDec),
    supplierPayableAmount: formatMoney(supplierPayableDec),
    agreementIdUsed: resolved.agreementId,
  };
}
