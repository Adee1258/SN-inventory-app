import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashSecret(secret: string, salt: string): string {
  return crypto.pbkdf2Sync(secret, salt, 100000, 64, 'sha512').toString('hex');
}

async function main() {
  console.log('--- SEEDING WHOLESALE GHALLA MANDI ERP FOUNDATION ---');

  // 1. Business Profile
  const existingProfile = await prisma.businessProfile.findFirst();
  if (!existingProfile) {
    await prisma.businessProfile.create({
      data: {
        businessName: 'Bismillah Ghalla Mandi Commission Agents',
        tradeLicenseNo: 'GM-COMM-2026-99',
        taxNumber: 'NTN-8829102-1',
        phone: '+92 300 1234567',
        email: 'info@bismillahmandi.com',
        address: 'Shop # 14-16, New Grain Market (Ghalla Mandi)',
        mandiLocation: 'Ghalla Mandi Wholesale Market',
        currencySymbol: 'Rs.',
      },
    });
    console.log('✓ Business Profile seeded');
  }

  // 2. Single Owner Auth (Username: admin, Password: Password123!, PIN: 1234)
  const existingAuth = await prisma.ownerAuth.findFirst();
  if (!existingAuth) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashSecret('Password123!', salt);
    const pinHash = hashSecret('1234', salt);

    await prisma.ownerAuth.create({
      data: {
        username: 'admin',
        passwordHash,
        masterPinHash: pinHash,
        salt,
      },
    });
    console.log('✓ Owner Authentication seeded (User: admin)');
  }

  // 3. Document Sequences
  const sequences = [
    { sequenceType: 'PURCHASE_INVOICE', prefix: 'PUR-', paddingLength: 5 },
    { sequenceType: 'CONSIGNMENT_RECEIPT', prefix: 'CON-', paddingLength: 5 },
    { sequenceType: 'SALE_INVOICE', prefix: 'INV-', paddingLength: 5 },
    { sequenceType: 'RECEIPT_VOUCHER', prefix: 'RCT-', paddingLength: 5 },
    { sequenceType: 'PAYMENT_VOUCHER', prefix: 'PAY-', paddingLength: 5 },
    { sequenceType: 'JOURNAL_ENTRY', prefix: 'JV-', paddingLength: 5 },
    { sequenceType: 'SETTLEMENT', prefix: 'SET-', paddingLength: 5 },
    { sequenceType: 'ADVANCE', prefix: 'ADV-', paddingLength: 5 },
  ];

  for (const seq of sequences) {
    await prisma.documentSequence.upsert({
      where: { sequenceType: seq.sequenceType },
      update: {},
      create: {
        sequenceType: seq.sequenceType,
        prefix: seq.prefix,
        currentNumber: BigInt(0),
        paddingLength: seq.paddingLength,
      },
    });
  }
  console.log('✓ Document sequences initialized');

  // 4. Units (KG is base unit)
  const kg = await prisma.unit.upsert({
    where: { code: 'KG' },
    update: {},
    create: { code: 'KG', name: 'Kilogram', symbol: 'kg', isBaseUnit: true },
  });

  const mann = await prisma.unit.upsert({
    where: { code: 'MANN' },
    update: {},
    create: { code: 'MANN', name: 'Mann (Maund)', symbol: 'mann', isBaseUnit: false },
  });

  const bag = await prisma.unit.upsert({
    where: { code: 'BAG' },
    update: {},
    create: { code: 'BAG', name: 'Bag (Bora)', symbol: 'bag', isBaseUnit: false },
  });
  console.log('✓ Units seeded: KG (Base), Mann, Bag');

  // 5. Item Categories
  const spicesCat = await prisma.itemCategory.upsert({
    where: { code: 'SPICES' },
    update: {},
    create: { code: 'SPICES', name: 'Wholesale Spices (Masalay)' },
  });

  const grainsCat = await prisma.itemCategory.upsert({
    where: { code: 'GRAINS' },
    update: {},
    create: { code: 'GRAINS', name: 'Grains & Cereals (Anaaj)' },
  });

  // 6. Commodities Master & Specific Bag Weight Conversions
  const commodities = [
    { code: 'CHILLI-01', name: 'Red Chilli Whole (Surkh Mirch)', bagKg: '38.00000000', mannKg: '40.00000000' },
    { code: 'CORIANDER-01', name: 'Coriander Seeds (Dhania Sabut)', bagKg: '40.00000000', mannKg: '40.00000000' },
    { code: 'TURMERIC-01', name: 'Turmeric Whole (Haldi Sabut)', bagKg: '50.00000000', mannKg: '40.00000000' },
    { code: 'CUMIN-01', name: 'Cumin Seeds (Safaid Zeera)', bagKg: '50.00000000', mannKg: '40.00000000' },
  ];

  for (const c of commodities) {
    const item = await prisma.item.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        categoryId: spicesCat.id,
        baseUnitId: kg.id,
        minStockLevel: '500.000000',
      },
    });

    // Seed Mann conversion (40 KG)
    await prisma.itemUnitConversion.upsert({
      where: { itemId_unitId: { itemId: item.id, unitId: mann.id } },
      update: { multiplierToBase: c.mannKg },
      create: { itemId: item.id, unitId: mann.id, multiplierToBase: c.mannKg },
    });

    // Seed Bag conversion (Item-specific weight!)
    await prisma.itemUnitConversion.upsert({
      where: { itemId_unitId: { itemId: item.id, unitId: bag.id } },
      update: { multiplierToBase: c.bagKg },
      create: { itemId: item.id, unitId: bag.id, multiplierToBase: c.bagKg },
    });
  }
  console.log('✓ Commodity items and item-specific bag weight conversions seeded');

  // 7. Complete Double-Entry Chart of Accounts
  const coa = [
    // Assets
    { code: '1010', name: 'Cash in Shop Till', category: 'ASSET' as const, isSystem: true },
    { code: '1011', name: 'Main Bank Current Account', category: 'ASSET' as const, isSystem: true },
    { code: '1020', name: 'Customer Accounts Receivable', category: 'ASSET' as const, isSystem: true },
    { code: '1030', name: 'Staff Advances & Employee Loans', category: 'ASSET' as const, isSystem: true },
    { code: '1040', name: 'Own Inventory Asset (Trading Stock)', category: 'ASSET' as const, isSystem: true },
    { code: '1050', name: 'Supplier Crop Advances', category: 'ASSET' as const, isSystem: true },
    // Liabilities
    { code: '2010', name: 'Accounts Payable: Own Stock Suppliers', category: 'LIABILITY' as const, isSystem: true },
    { code: '2020', name: 'Commission Supplier Payable (Consignment)', category: 'LIABILITY' as const, isSystem: true },
    // Equity
    { code: '3010', name: 'Owner Capital', category: 'EQUITY' as const, isSystem: true },
    { code: '3020', name: 'Opening Balance Clearing Equity', category: 'EQUITY' as const, isSystem: true },
    // Income
    { code: '4010', name: 'Own Stock Sales Revenue', category: 'INCOME' as const, isSystem: true },
    { code: '4020', name: 'Consignment Commission Income', category: 'INCOME' as const, isSystem: true },
    // Expenses
    { code: '5010', name: 'Cost of Goods Sold (FIFO)', category: 'EXPENSE' as const, isSystem: true },
    { code: '5020', name: 'Shop Labour & Loading/Unloading', category: 'EXPENSE' as const, isSystem: true },
    { code: '5030', name: 'Mandi Transport & Freight Expense', category: 'EXPENSE' as const, isSystem: true },
    { code: '5040', name: 'Shop Rent & Utilities', category: 'EXPENSE' as const, isSystem: true },
    { code: '5050', name: 'Staff Salaries & Wages Expense', category: 'EXPENSE' as const, isSystem: true },
  ];

  for (const acc of coa) {
    await prisma.chartOfAccounts.upsert({
      where: { accountCode: acc.code },
      update: {},
      create: {
        accountCode: acc.code,
        accountName: acc.name,
        category: acc.category,
        isSystem: acc.isSystem,
      },
    });
  }
  console.log('✓ Chart of Accounts seeded with 15 balanced general ledger accounts');

  // 8. Cash/Bank Register
  const cashGl = await prisma.chartOfAccounts.findUnique({ where: { accountCode: '1010' } });
  const bankGl = await prisma.chartOfAccounts.findUnique({ where: { accountCode: '1011' } });

  if (cashGl) {
    const existingCash = await prisma.cashBankAccount.findFirst({ where: { glAccountId: cashGl.id } });
    if (!existingCash) {
      await prisma.cashBankAccount.create({
        data: {
          accountName: 'Shop Cash Drawer',
          accountType: 'CASH',
          glAccountId: cashGl.id,
        },
      });
    }
  }

  if (bankGl) {
    const existingBank = await prisma.cashBankAccount.findFirst({ where: { glAccountId: bankGl.id } });
    if (!existingBank) {
      await prisma.cashBankAccount.create({
        data: {
          accountName: 'Habib Bank Mandi Branch',
          accountType: 'BANK',
          bankName: 'Habib Bank Limited',
          accountNumber: 'PK12HABB00012345678901',
          glAccountId: bankGl.id,
        },
      });
    }
  }
  console.log('✓ Cash and Bank accounts linked to General Ledger');
  console.log('--- SEEDING COMPLETED SUCCESSFULLY ---');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
