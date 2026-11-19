import { Decimal, toQuantity, toMoney, formatQuantity, formatMoney } from './decimal-utils.js';
import type { StockOwnershipType } from '@erp/shared-types';

export interface EligibleBatchInput {
  id: number;
  batchNumber: string;
  ownershipType: StockOwnershipType;
  supplierId?: number | null;
  receivedDate: string | Date;
  remainingBaseQty: Decimal.Value;
  unitCost: Decimal.Value; // Landed cost for OWN, 0 for CONSIGNMENT
}

export interface FifoAllocationLine {
  batchId: number;
  batchNumber: string;
  allocatedBaseQty: string;
  unitCost: string;
  totalCost: string;
  newRemainingBaseQty: string;
  isExhausted: boolean;
}

export interface FifoAllocationResult {
  totalAllocatedBaseQty: string;
  totalCogs: string; // Zero for CONSIGNMENT
  allocations: FifoAllocationLine[];
}

/**
 * Deterministic FIFO batch allocation algorithm.
 * Allocates from oldest eligible batches first.
 * Throws an error if available stock is insufficient to prevent negative inventory.
 */
export function allocateFifo(
  batches: EligibleBatchInput[],
  requestedBaseQty: Decimal.Value,
  expectedOwnership: StockOwnershipType,
  expectedSupplierId?: number | null
): FifoAllocationResult {
  const reqQtyDec = toQuantity(requestedBaseQty);

  if (reqQtyDec.isZero()) {
    return {
      totalAllocatedBaseQty: '0.000000',
      totalCogs: '0.0000',
      allocations: [],
    };
  }

  if (reqQtyDec.isNegative()) {
    throw new Error(`Requested allocation quantity cannot be negative: ${requestedBaseQty}`);
  }

  // Filter batches matching exact ownership and supplier restriction
  const eligible = batches.filter((b) => {
    if (b.ownershipType !== expectedOwnership) return false;
    if (expectedOwnership === 'CONSIGNMENT') {
      if (!expectedSupplierId) {
        throw new Error('Consignment stock allocation requires an explicit supplierId');
      }
      return b.supplierId === expectedSupplierId;
    }
    return true;
  });

  // Sort deterministically: receivedDate ASC, then id ASC
  eligible.sort((a, b) => {
    const timeA = new Date(a.receivedDate).getTime();
    const timeB = new Date(b.receivedDate).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });

  // Check total available
  const totalAvailable = eligible.reduce((acc, b) => acc.plus(toQuantity(b.remainingBaseQty)), new Decimal(0));

  if (totalAvailable.lessThan(reqQtyDec)) {
    throw new Error(
      `INSUFFICIENT_STOCK: Requested ${formatQuantity(reqQtyDec)} KG, but only ${formatQuantity(
        totalAvailable
      )} KG is available under ${expectedOwnership}${
        expectedSupplierId ? ` (Supplier ID: ${expectedSupplierId})` : ''
      }`
    );
  }

  let qtyRemainingToAllocate = reqQtyDec;
  let accumulatedCogs = new Decimal(0);
  const allocations: FifoAllocationLine[] = [];

  for (const batch of eligible) {
    const batchRemaining = toQuantity(batch.remainingBaseQty);
    if (batchRemaining.isZero() || batchRemaining.isNegative()) continue;

    let takeQty: Decimal;
    let newRemaining: Decimal;
    let isExhausted = false;

    if (batchRemaining.lessThanOrEqualTo(qtyRemainingToAllocate)) {
      takeQty = batchRemaining;
      newRemaining = new Decimal(0);
      isExhausted = true;
    } else {
      takeQty = qtyRemainingToAllocate;
      newRemaining = batchRemaining.minus(takeQty);
      isExhausted = false;
    }

    const unitCostDec = toMoney(batch.unitCost);
    // For consignment, COGS is always 0.0000
    const lineCost = expectedOwnership === 'OWN' ? toMoney(takeQty.times(unitCostDec)) : new Decimal(0);

    accumulatedCogs = accumulatedCogs.plus(lineCost);
    qtyRemainingToAllocate = qtyRemainingToAllocate.minus(takeQty);

    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      allocatedBaseQty: formatQuantity(takeQty),
      unitCost: formatMoney(unitCostDec),
      totalCost: formatMoney(lineCost),
      newRemainingBaseQty: formatQuantity(newRemaining),
      isExhausted,
    });

    if (qtyRemainingToAllocate.isZero()) {
      break;
    }
  }

  return {
    totalAllocatedBaseQty: formatQuantity(reqQtyDec),
    totalCogs: formatMoney(accumulatedCogs),
    allocations,
  };
}
