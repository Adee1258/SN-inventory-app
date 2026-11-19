// ==========================================
// WHOLESALE GHALLA MANDI ERP - SHARED TYPES
// ==========================================

export type StockOwnershipType = 'OWN' | 'CONSIGNMENT';

export type StockBatchSourceType = 'OPENING' | 'PURCHASE' | 'CONSIGNMENT_RECEIPT';

export type StockBatchStatus = 'ACTIVE' | 'EXHAUSTED' | 'QUARANTINED' | 'CANCELLED';

export type StockMovementType =
  | 'OPENING'
  | 'PURCHASE_IN'
  | 'CONSIGNMENT_IN'
  | 'SALE_OUT'
  | 'PURCHASE_RETURN_OUT'
  | 'SALE_RETURN_IN'
  | 'CONSIGNMENT_RETURN_OUT'
  | 'DAMAGE_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'REVERSAL';

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'CONTRA_INCOME' | 'EXPENSE';

export type PaymentMethod = 'CASH' | 'BANK' | 'CREDIT' | 'PARTIAL';

export type SettlementPolicy = 'IMMEDIATE_UPON_SALE' | 'AFTER_CUSTOMER_COLLECTION' | 'MANUAL_APPROVAL';

// Document Reference Types
export type DocumentReferenceType =
  | 'OPENING_STOCK'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_RETURN'
  | 'CONSIGNMENT_RECEIPT'
  | 'CONSIGNMENT_RETURN'
  | 'SALE_INVOICE'
  | 'SALE_RETURN'
  | 'SUPPLIER_SETTLEMENT'
  | 'SUPPLIER_ADVANCE'
  | 'RECEIPT_VOUCHER'
  | 'PAYMENT_VOUCHER'
  | 'STOCK_ADJUSTMENT'
  | 'JOURNAL_ENTRY';

// Unit & Conversion Types
export interface UnitDto {
  id: number;
  code: string;
  name: string;
  isBaseUnit: boolean;
  symbol: string;
}

export interface ItemUnitConversionDto {
  id: number;
  itemId: number;
  unitId: number;
  unitName: string;
  multiplierToBase: string; // Decimal string e.g. "38.00000000"
}

export interface ItemDto {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  categoryName?: string;
  description?: string;
  baseUnitId: number;
  baseUnitName: string;
  minStockLevel: string;
  defaultSaleRate?: string;
  isActive: boolean;
  conversions?: ItemUnitConversionDto[];
}

// Party Types
export interface CustomerDto {
  id: number;
  code: string;
  name: string;
  phone: string;
  address?: string;
  openingBalance: string; // Debit receivable (+) or Credit advance (-)
  currentBalance?: string;
  creditLimit?: string;
  notes?: string;
  isActive: boolean;
}

export interface SupplierDto {
  id: number;
  code: string;
  name: string;
  phone: string;
  address?: string;
  openingBalanceOwn: string;
  openingBalanceConsignment: string;
  currentBalanceOwn?: string;
  currentBalanceConsignment?: string;
  notes?: string;
  isActive: boolean;
}

// Stock Batch Dto
export interface StockBatchDto {
  id: number;
  uuid: string;
  batchNumber: string;
  itemId: number;
  itemName: string;
  ownershipType: StockOwnershipType;
  supplierId?: number;
  supplierName?: string;
  sourceType: StockBatchSourceType;
  sourceDocumentId: number;
  receivedDate: string;
  initialBaseQty: string;
  remainingBaseQty: string;
  baseUnit: string;
  unitCost: string; // Landed cost for OWN, "0.0000" for CONSIGNMENT
  referenceValuation?: string;
  status: StockBatchStatus;
}

// FIFO Stock Allocation
export interface StockAllocationDto {
  batchId: number;
  batchNumber: string;
  allocatedBaseQty: string;
  unitCost: string;
  totalCost: string;
}

// Common Sale Invoice Line
export interface SaleLineInput {
  itemId: number;
  ownershipType: StockOwnershipType;
  supplierId?: number; // Required if CONSIGNMENT
  enteredQuantity: string;
  unitId: number;
  ratePerEnteredUnit: string;
  discountAmount?: string;
  notes?: string;
}

// Commission Agreement
export interface CommissionAgreementDto {
  id: number;
  supplierId: number;
  itemId?: number; // Optional override
  commissionPercentage: string; // e.g. "2.000000"
  effectiveStartDate: string;
  effectiveEndDate?: string;
  isActive: boolean;
  notes?: string;
}

// Accounting Journal Line
export interface JournalLineDto {
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  description?: string;
  partyType?: 'CUSTOMER' | 'SUPPLIER';
  partyId?: number;
}

export interface JournalEntryDto {
  id: number;
  entryNumber: string;
  entryDate: string;
  referenceType: DocumentReferenceType;
  referenceId: number;
  referenceNumber: string;
  narration: string;
  lines: JournalLineDto[];
  totalDebit: string;
  totalCredit: string;
}

// Sync Payload Envelope
export interface SyncEventPayload<T = unknown> {
  eventId: string;
  aggregateType: string;
  aggregateId: number | string;
  eventType: string;
  deviceId: string;
  timestamp: string;
  payload: T;
  signature?: string;
}

// System Status
export interface SystemStatusDto {
  isServerHealthy: boolean;
  isDbConnected: boolean;
  cloudSyncEnabled: boolean;
  cloudConnected: boolean;
  pendingSyncEventsCount: number;
  lastSuccessfulSyncAt?: string;
  localServerTime: string;
}
