import { describe, it, expect } from 'vitest';
import {
  calculateBaseQuantity,
  convertBaseToSecondaryUnit,
  allocateFifo,
  calculateCommissionFinancials,
  validateJournalBalance,
  formatMoney,
} from '../src/index.js';

describe('Unit Conversion Engine', () => {
  it('converts Mann to KG accurately with snapshot', () => {
    // 10 Mann of Chilli where 1 Mann = 40 KG
    const res = calculateBaseQuantity('10.000000', '40.00000000', 'KG');
    expect(res.baseQuantity).toBe('400.000000');
    expect(res.multiplierToBase).toBe('40.00000000');
    expect(res.baseUnit).toBe('KG');
  });

  it('converts item-specific bag weights (e.g. 38 KG Chilli Bag vs 50 KG Turmeric Bag)', () => {
    // 5 Bags of Chilli @ 38 KG/bag
    const chilliBags = calculateBaseQuantity('5.000000', '38.00000000', 'KG');
    expect(chilliBags.baseQuantity).toBe('190.000000');

    // 5 Bags of Turmeric @ 50 KG/bag
    const turmericBags = calculateBaseQuantity('5.000000', '50.00000000', 'KG');
    expect(turmericBags.baseQuantity).toBe('250.000000');

    // Convert 190 KG back to bags
    const backToBags = convertBaseToSecondaryUnit(chilliBags.baseQuantity, '38.00000000');
    expect(backToBags).toBe('5.000000');
  });

  it('throws on negative quantity or zero conversion multiplier', () => {
    expect(() => calculateBaseQuantity('-5.000000', '40.00000000')).toThrow();
    expect(() => calculateBaseQuantity('5.000000', '0.00000000')).toThrow();
  });
});

describe('Deterministic FIFO Stock Allocator', () => {
  it('implements mandatory FIFO allocation and COGS calculation exactly as per prompt Part 13', () => {
    // Prompt Part 13 example:
    // Opening batch = 100 Mann at Rs. 20,000 per Mann (rate per KG = 20,000 / 40 = 500)
    // In KG: Opening = 4000 KG @ Rs. 500 / KG (Total = 2,000,000)
    // Purchase batch = 50 Mann at Rs. 22,000 per Mann (rate per KG = 22,000 / 40 = 550)
    // In KG: Purchase = 2000 KG @ Rs. 550 / KG (Total = 1,100,000)
    // Sale = 120 Mann = 4800 KG
    // Expected allocation:
    // - 4000 KG (100 Mann) from opening batch @ Rs. 500 = 2,000,000
    // - 800 KG (20 Mann) from purchase batch @ Rs. 550 = 440,000
    // Expected FIFO COGS = Rs. 2,440,000
    // Expected remaining purchase batch = 1200 KG (30 Mann)

    const batches = [
      {
        id: 1,
        batchNumber: 'BATCH-OPENING-001',
        ownershipType: 'OWN' as const,
        receivedDate: '2026-01-01T00:00:00Z',
        remainingBaseQty: '4000.000000',
        unitCost: '500.0000',
      },
      {
        id: 2,
        batchNumber: 'BATCH-PURCHASE-002',
        ownershipType: 'OWN' as const,
        receivedDate: '2026-01-10T00:00:00Z',
        remainingBaseQty: '2000.000000',
        unitCost: '550.0000',
      },
    ];

    const result = allocateFifo(batches, '4800.000000', 'OWN');

    expect(result.totalAllocatedBaseQty).toBe('4800.000000');
    expect(result.totalCogs).toBe('2440000.0000');
    expect(result.allocations).toHaveLength(2);

    expect(result.allocations[0].batchId).toBe(1);
    expect(result.allocations[0].allocatedBaseQty).toBe('4000.000000');
    expect(result.allocations[0].isExhausted).toBe(true);
    expect(result.allocations[0].newRemainingBaseQty).toBe('0.000000');

    expect(result.allocations[1].batchId).toBe(2);
    expect(result.allocations[1].allocatedBaseQty).toBe('800.000000');
    expect(result.allocations[1].isExhausted).toBe(false);
    expect(result.allocations[1].newRemainingBaseQty).toBe('1200.000000');
  });

  it('strictly prevents overselling and negative inventory', () => {
    const batches = [
      {
        id: 1,
        batchNumber: 'BATCH-001',
        ownershipType: 'OWN' as const,
        receivedDate: '2026-01-01',
        remainingBaseQty: '100.000000',
        unitCost: '10.0000',
      },
    ];

    expect(() => allocateFifo(batches, '100.000001', 'OWN')).toThrow(/INSUFFICIENT_STOCK/);
  });

  it('allocates consignment batches strictly matching supplier and creates 0 COGS', () => {
    const batches = [
      {
        id: 10,
        batchNumber: 'CONS-A-01',
        ownershipType: 'CONSIGNMENT' as const,
        supplierId: 101, // Supplier A
        receivedDate: '2026-01-01',
        remainingBaseQty: '500.000000',
        unitCost: '0.0000',
      },
      {
        id: 11,
        batchNumber: 'CONS-B-01',
        ownershipType: 'CONSIGNMENT' as const,
        supplierId: 102, // Supplier B
        receivedDate: '2026-01-02',
        remainingBaseQty: '500.000000',
        unitCost: '0.0000',
      },
    ];

    // Allocate 200 KG from Supplier A
    const res = allocateFifo(batches, '200.000000', 'CONSIGNMENT', 101);
    expect(res.totalCogs).toBe('0.0000');
    expect(res.allocations[0].batchId).toBe(10);
    expect(res.allocations[0].allocatedBaseQty).toBe('200.000000');
  });
});

describe('Percentage Commission Calculator', () => {
  it('calculates gross, commission income and supplier payable as per prompt Part 13', () => {
    // Prompt Part 13:
    // Quantity = 20 Mann (at 40 KG = 800 KG)
    // Rate = Rs. 25,000 per Mann (= 625 per KG)
    // Gross Sale = Rs. 500,000
    // Commission = 2%
    // Commission Income = Rs. 10,000
    // Supplier Payable = Rs. 490,000

    const agreements = [
      {
        id: 1,
        supplierId: 101,
        commissionPercentage: '2.000000',
        effectiveStartDate: '2026-01-01',
        isActive: true,
      },
    ];

    const result = calculateCommissionFinancials({
      baseQuantity: '800.000000',
      ratePerBaseUnit: '625.0000',
      discountAmount: '0.0000',
      agreements,
      supplierId: 101,
      transactionDate: '2026-01-15',
    });

    expect(result.grossSaleAmount).toBe('500000.0000');
    expect(result.commissionPercentage).toBe('2.000000');
    expect(result.commissionAmount).toBe('10000.0000');
    expect(result.supplierPayableAmount).toBe('490000.0000');
  });

  it('respects item-specific commission percentage override over general supplier percentage', () => {
    const agreements = [
      {
        id: 1,
        supplierId: 101,
        commissionPercentage: '2.000000', // General 2%
        effectiveStartDate: '2026-01-01',
        isActive: true,
      },
      {
        id: 2,
        supplierId: 101,
        itemId: 55, // Specific Chilli item 3%
        commissionPercentage: '3.000000',
        effectiveStartDate: '2026-01-01',
        isActive: true,
      },
    ];

    const result = calculateCommissionFinancials({
      baseQuantity: '100.000000',
      ratePerBaseUnit: '1000.0000', // Gross = 100,000
      agreements,
      supplierId: 101,
      itemId: 55,
      transactionDate: '2026-01-15',
    });

    expect(result.agreementIdUsed).toBe(2);
    expect(result.commissionPercentage).toBe('3.000000');
    expect(result.commissionAmount).toBe('3000.0000'); // 3% of 100,000
    expect(result.supplierPayableAmount).toBe('97000.0000');
  });
});

describe('Double-Entry Accounting Validator', () => {
  it('validates balanced journal entries', () => {
    const lines = [
      { accountId: 1020, debit: '500000.0000', credit: '0.0000' }, // Customer Receivable
      { accountId: 2020, debit: '0.0000', credit: '490000.0000' }, // Commission Supplier Payable
      { accountId: 4020, debit: '0.0000', credit: '10000.0000' },  // Commission Income
    ];

    const res = validateJournalBalance(lines);
    expect(res.isValid).toBe(true);
    expect(res.totalDebit).toBe('500000.0000');
    expect(res.totalCredit).toBe('500000.0000');
  });

  it('rejects unbalanced journal entries', () => {
    const lines = [
      { accountId: 1020, debit: '500000.0000', credit: '0.0000' },
      { accountId: 4010, debit: '0.0000', credit: '499000.0000' }, // Missing 1000
    ];

    const res = validateJournalBalance(lines);
    expect(res.isValid).toBe(false);
    expect(res.difference).toBe('1000.0000');
  });
});
