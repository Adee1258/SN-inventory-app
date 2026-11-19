import { Decimal, toConversionFactor, toQuantity, formatQuantity } from './decimal-utils.js';

export interface UnitConversionParams {
  enteredQuantity: Decimal.Value;
  multiplierToBase: Decimal.Value; // e.g. 38 for a 38 KG Chilli bag, 1 for KG, 40 for Mann
}

export interface UnitConversionResult {
  enteredQuantity: string;
  multiplierToBase: string;
  baseQuantity: string;
  baseUnit: string;
}

/**
 * Calculates normalized base quantity (in KG) and returns immutable snapshot fields.
 */
export function calculateBaseQuantity(
  enteredQuantity: Decimal.Value,
  multiplierToBase: Decimal.Value,
  baseUnitName = 'KG'
): UnitConversionResult {
  const enteredQtyDec = toQuantity(enteredQuantity);
  if (enteredQtyDec.isNegative()) {
    throw new Error(`Entered quantity cannot be negative: ${enteredQuantity}`);
  }

  const multiplierDec = toConversionFactor(multiplierToBase);
  if (multiplierDec.isZero() || multiplierDec.isNegative()) {
    throw new Error(`Unit conversion multiplier must be strictly positive: ${multiplierToBase}`);
  }

  const baseQtyDec = toQuantity(enteredQtyDec.times(multiplierDec));

  return {
    enteredQuantity: formatQuantity(enteredQtyDec),
    multiplierToBase: multiplierDec.toFixed(8),
    baseQuantity: formatQuantity(baseQtyDec),
    baseUnit: baseUnitName,
  };
}

/**
 * Converts a base quantity (in KG) back to secondary unit (e.g. Bags or Mann) for display.
 */
export function convertBaseToSecondaryUnit(
  baseQuantity: Decimal.Value,
  multiplierToBase: Decimal.Value
): string {
  const baseDec = toQuantity(baseQuantity);
  const multDec = toConversionFactor(multiplierToBase);
  if (multDec.isZero()) return '0.000000';
  return formatQuantity(baseDec.dividedBy(multDec));
}
