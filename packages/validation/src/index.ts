import { z } from 'zod';

// Regex for decimal string validation
const decimalStringRegex = /^-?\d+(\.\d+)?$/;
const positiveDecimalStringRegex = /^\d+(\.\d+)?$/;

export const DecimalStringSchema = z
  .string()
  .regex(decimalStringRegex, { message: 'Must be a valid decimal number string' });

export const PositiveDecimalStringSchema = z
  .string()
  .regex(positiveDecimalStringRegex, { message: 'Must be a valid non-negative decimal string' })
  .refine((val) => parseFloat(val) >= 0, { message: 'Amount cannot be negative' });

export const StrictlyPositiveDecimalStringSchema = z
  .string()
  .regex(positiveDecimalStringRegex, { message: 'Must be a strictly positive decimal string' })
  .refine((val) => parseFloat(val) > 0, { message: 'Amount must be greater than zero' });

// 1. Owner Login Schema
export const OwnerLoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
});

export const MasterPinSchema = z.object({
  pin: z.string().length(4, { message: 'PIN must be exactly 4 digits' }),
});

// 2. Unit & Item Schemas
export const UnitCreateSchema = z.object({
  code: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10),
  isBaseUnit: z.boolean().default(false),
});

export const ItemConversionInputSchema = z.object({
  unitId: z.number().int().positive(),
  multiplierToBase: StrictlyPositiveDecimalStringSchema,
});

export const ItemCreateSchema = z.object({
  code: z.string().min(1).max(30).toUpperCase(),
  name: z.string().min(1).max(100),
  categoryId: z.number().int().positive(),
  description: z.string().optional(),
  baseUnitId: z.number().int().positive(),
  minStockLevel: PositiveDecimalStringSchema.default('0.000000'),
  defaultSaleRate: PositiveDecimalStringSchema.optional(),
  conversions: z.array(ItemConversionInputSchema).optional(),
});

// 3. Customer & Supplier Schemas
export const CustomerCreateSchema = z.object({
  code: z.string().min(1).max(30).toUpperCase(),
  name: z.string().min(1).max(100),
  phone: z.string().min(5).max(30),
  address: z.string().optional(),
  openingBalance: DecimalStringSchema.default('0.0000'),
  creditLimit: PositiveDecimalStringSchema.optional(),
  notes: z.string().optional(),
});

export const SupplierCreateSchema = z.object({
  code: z.string().min(1).max(30).toUpperCase(),
  name: z.string().min(1).max(100),
  phone: z.string().min(5).max(30),
  address: z.string().optional(),
  openingBalanceOwn: DecimalStringSchema.default('0.0000'),
  openingBalanceConsignment: DecimalStringSchema.default('0.0000'),
  notes: z.string().optional(),
});

// 4. Opening Stock Line Schema
export const OpeningStockItemSchema = z.object({
  itemId: z.number().int().positive(),
  ownershipType: z.enum(['OWN', 'CONSIGNMENT']),
  supplierId: z.number().int().positive().optional().nullable(),
  enteredQuantity: StrictlyPositiveDecimalStringSchema,
  unitId: z.number().int().positive(),
  unitCost: PositiveDecimalStringSchema.default('0.0000'), // Landed cost for OWN, 0 for CONSIGNMENT
  extraCharges: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0.0000'), // bilti, freight, misc
  extraChargesNote: z.string().max(100).optional(),                       // label for extra charges
  paymentType: z.enum(['CREDIT', 'DEBIT', 'OPENING_STOCK']).default('DEBIT'),
  referenceValuation: PositiveDecimalStringSchema.optional(),
  batchNumber: z.string().min(1).max(50),
  notes: z.string().optional(),
});

export const OpeningStockCreateSchema = z.object({
  entryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().optional(),
  items: z.array(OpeningStockItemSchema).min(1, 'At least one item is required in opening stock'),
});

// 5. Purchase Invoice Schema (Own Stock Only)
export const PurchaseItemSchema = z.object({
  itemId: z.number().int().positive(),
  enteredQuantity: StrictlyPositiveDecimalStringSchema,
  unitId: z.number().int().positive(),
  ratePerEnteredUnit: StrictlyPositiveDecimalStringSchema,
  discountAmount: PositiveDecimalStringSchema.default('0.0000'),
  freightAllocation: PositiveDecimalStringSchema.default('0.0000'),
  loadingAllocation: PositiveDecimalStringSchema.default('0.0000'),
  batchNumber: z.string().optional(),
});

export const PurchaseCreateSchema = z.object({
  supplierId: z.number().int().positive(),
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  paymentMethod: z.enum(['CASH', 'BANK', 'CREDIT', 'PARTIAL']),
  paidAmount: PositiveDecimalStringSchema.default('0.0000'),
  cashBankAccountId: z.number().int().positive().optional().nullable(),
  items: z.array(PurchaseItemSchema).min(1, 'At least one purchase item is required'),
  notes: z.string().optional(),
});

// 6. Consignment Receipt Schema (Commission Stock Only)
export const ConsignmentReceiptItemSchema = z.object({
  itemId: z.number().int().positive(),
  enteredQuantity: StrictlyPositiveDecimalStringSchema,
  unitId: z.number().int().positive(),
  referenceRate: PositiveDecimalStringSchema.optional(),
  batchNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const ConsignmentReceiptCreateSchema = z.object({
  supplierId: z.number().int().positive(),
  receiptNumber: z.string().min(1).max(50),
  receiptDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  items: z.array(ConsignmentReceiptItemSchema).min(1, 'At least one consignment item is required'),
  vehicleNumber: z.string().optional(),
  driverPhone: z.string().optional(),
  notes: z.string().optional(),
});

// 7. Common Sale Invoice Schema
export const SaleItemSchema = z.object({
  itemId: z.number().int().positive(),
  ownershipType: z.enum(['OWN', 'CONSIGNMENT']),
  supplierId: z.number().int().positive().optional().nullable(),
  enteredQuantity: StrictlyPositiveDecimalStringSchema,
  unitId: z.number().int().positive(),
  ratePerEnteredUnit: StrictlyPositiveDecimalStringSchema,
  discountAmount: PositiveDecimalStringSchema.default('0.0000'),
  notes: z.string().optional(),
});

export const SaleCreateSchema = z.object({
  customerId: z.number().int().positive(),
  invoiceNumber: z.string().optional(), // Auto-generated if omitted
  invoiceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  paymentMethod: z.enum(['CASH', 'BANK', 'CREDIT', 'PARTIAL']),
  paidAmount: PositiveDecimalStringSchema.default('0.0000'),
  cashBankAccountId: z.number().int().positive().optional().nullable(),
  items: z.array(SaleItemSchema).min(1, 'At least one sale item is required'),
  notes: z.string().optional(),
});

// 8. Commission Agreement Schema
export const CommissionAgreementSchema = z.object({
  supplierId: z.number().int().positive(),
  itemId: z.number().int().positive().optional().nullable(),
  commissionPercentage: StrictlyPositiveDecimalStringSchema.refine(
    (v) => parseFloat(v) <= 100,
    { message: 'Commission percentage cannot exceed 100%' }
  ),
  effectiveStartDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  effectiveEndDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  notes: z.string().optional(),
});

// 9. Supplier Settlement Schema
export const SupplierSettlementSchema = z.object({
  supplierId: z.number().int().positive(),
  settlementDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: StrictlyPositiveDecimalStringSchema,
  cashBankAccountId: z.number().int().positive(),
  deductFromAdvanceAmount: PositiveDecimalStringSchema.default('0.0000'),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

// 10. Cash/Bank Vouchers
export const ReceiptVoucherSchema = z.object({
  voucherDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  cashBankAccountId: z.number().int().positive(),
  amount: StrictlyPositiveDecimalStringSchema,
  partyType: z.enum(['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER']),
  partyId: z.number().int().positive().optional().nullable(),
  creditAccountId: z.number().int().positive(),
  referenceNumber: z.string().optional(),
  narration: z.string().min(1).max(255),
});

export const PaymentVoucherSchema = z.object({
  voucherDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  cashBankAccountId: z.number().int().positive(),
  amount: StrictlyPositiveDecimalStringSchema,
  partyType: z.enum(['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER']),
  partyId: z.number().int().positive().optional().nullable(),
  debitAccountId: z.number().int().positive(),
  referenceNumber: z.string().optional(),
  narration: z.string().min(1).max(255),
});

// 11. Returns & Adjustments Schemas
export const PurchaseReturnItemSchema = z.object({
  batchId: z.number().int().positive(),
  baseQuantity: StrictlyPositiveDecimalStringSchema,
  unitCost: StrictlyPositiveDecimalStringSchema,
});

export const PurchaseReturnCreateSchema = z.object({
  purchaseInvoiceId: z.number().int().positive(),
  supplierId: z.number().int().positive(),
  returnDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  returnNumber: z.string().optional(),
  reason: z.string().optional(),
  items: z.array(PurchaseReturnItemSchema).min(1, 'At least one return item is required'),
});

export const SalesReturnItemSchema = z.object({
  salesInvoiceItemId: z.number().int().positive(),
  baseQuantity: StrictlyPositiveDecimalStringSchema,
  rate: StrictlyPositiveDecimalStringSchema,
  isSaleable: z.boolean().default(true),
});

export const SalesReturnCreateSchema = z.object({
  salesInvoiceId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  returnDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  returnNumber: z.string().optional(),
  reason: z.string().optional(),
  items: z.array(SalesReturnItemSchema).min(1, 'At least one return item is required'),
});

export const ConsignmentReturnItemSchema = z.object({
  batchId: z.number().int().positive(),
  baseQuantity: StrictlyPositiveDecimalStringSchema,
});

export const ConsignmentReturnCreateSchema = z.object({
  supplierId: z.number().int().positive(),
  returnDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  returnNumber: z.string().optional(),
  reason: z.string().optional(),
  items: z.array(ConsignmentReturnItemSchema).min(1, 'At least one return item is required'),
});

export const SupplierAdvanceCreateSchema = z.object({
  supplierId: z.number().int().positive(),
  advanceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  advanceNumber: z.string().optional(),
  amount: StrictlyPositiveDecimalStringSchema,
  cashBankAccountId: z.number().int().positive(),
  notes: z.string().optional(),
});

// 12. Commission Expense Schema
export const CommissionExpenseSchema = z.object({
  expenseDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  description: z.string().min(1).max(255),
  amount: StrictlyPositiveDecimalStringSchema,
  category: z.enum(['LOADING', 'LABOUR', 'TRANSPORT', 'RENT', 'ELECTRICITY', 'REPAIR', 'GENERAL']).default('GENERAL'),
  notes: z.string().optional(),
});
