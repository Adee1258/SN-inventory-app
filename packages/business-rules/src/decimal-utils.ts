import Decimal from 'decimal.js';

// Configure Decimal.js with 28 digits precision and standard rounding (ROUND_HALF_UP)
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 28,
});

export { Decimal };

export const PRECISION = {
  MONEY: 4,
  QUANTITY: 6,
  PERCENTAGE: 6,
  CONVERSION: 8,
} as const;

export function toMoney(val: Decimal.Value): Decimal {
  return new Decimal(val).toDecimalPlaces(PRECISION.MONEY);
}

export function toQuantity(val: Decimal.Value): Decimal {
  return new Decimal(val).toDecimalPlaces(PRECISION.QUANTITY);
}

export function toPercentage(val: Decimal.Value): Decimal {
  return new Decimal(val).toDecimalPlaces(PRECISION.PERCENTAGE);
}

export function toConversionFactor(val: Decimal.Value): Decimal {
  return new Decimal(val).toDecimalPlaces(PRECISION.CONVERSION);
}

export function formatMoney(val: Decimal.Value): string {
  return toMoney(val).toFixed(PRECISION.MONEY);
}

export function formatQuantity(val: Decimal.Value): string {
  return toQuantity(val).toFixed(PRECISION.QUANTITY);
}

export function formatPercentage(val: Decimal.Value): string {
  return toPercentage(val).toFixed(PRECISION.PERCENTAGE);
}

export function isZero(val: Decimal.Value): boolean {
  return new Decimal(val).isZero();
}

export function isPositive(val: Decimal.Value): boolean {
  return new Decimal(val).isPositive() && !new Decimal(val).isZero();
}

export function isNegative(val: Decimal.Value): boolean {
  return new Decimal(val).isNegative() && !new Decimal(val).isZero();
}
