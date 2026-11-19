-- CreateTable
CREATE TABLE `business_profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `businessName` VARCHAR(150) NOT NULL,
    `tradeLicenseNo` VARCHAR(50) NULL,
    `taxNumber` VARCHAR(50) NULL,
    `phone` VARCHAR(30) NOT NULL,
    `email` VARCHAR(100) NULL,
    `address` TEXT NULL,
    `mandiLocation` VARCHAR(100) NULL,
    `currencySymbol` VARCHAR(10) NOT NULL DEFAULT 'Rs.',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `business_profile_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `settingKey` VARCHAR(100) NOT NULL,
    `settingValue` TEXT NOT NULL,
    `description` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_settings_uuid_key`(`uuid`),
    UNIQUE INDEX `app_settings_settingKey_key`(`settingKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `owner_auth` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `masterPinHash` VARCHAR(255) NOT NULL,
    `salt` VARCHAR(64) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `owner_auth_uuid_key`(`uuid`),
    UNIQUE INDEX `owner_auth_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registered_devices` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `deviceName` VARCHAR(100) NOT NULL,
    `deviceToken` VARCHAR(255) NOT NULL,
    `ipAddress` VARCHAR(45) NULL,
    `macAddress` VARCHAR(50) NULL,
    `isAuthorized` BOOLEAN NOT NULL DEFAULT true,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `registered_devices_uuid_key`(`uuid`),
    UNIQUE INDEX `registered_devices_deviceToken_key`(`deviceToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financial_years` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `yearCode` VARCHAR(20) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `isClosed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `financial_years_uuid_key`(`uuid`),
    UNIQUE INDEX `financial_years_yearCode_key`(`yearCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounting_periods` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `financialYearId` BIGINT NOT NULL,
    `periodNumber` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `isClosed` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_sequences` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sequenceType` VARCHAR(50) NOT NULL,
    `prefix` VARCHAR(20) NOT NULL,
    `currentNumber` BIGINT NOT NULL DEFAULT 0,
    `paddingLength` INTEGER NOT NULL DEFAULT 5,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_sequences_sequenceType_key`(`sequenceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `isBaseUnit` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `units_uuid_key`(`uuid`),
    UNIQUE INDEX `units_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_categories` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `item_categories_uuid_key`(`uuid`),
    UNIQUE INDEX `item_categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `categoryId` BIGINT NOT NULL,
    `baseUnitId` BIGINT NOT NULL,
    `description` TEXT NULL,
    `minStockLevel` DECIMAL(19, 6) NOT NULL DEFAULT 0.000000,
    `defaultSaleRate` DECIMAL(19, 4) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `items_uuid_key`(`uuid`),
    UNIQUE INDEX `items_code_key`(`code`),
    INDEX `items_categoryId_idx`(`categoryId`),
    INDEX `items_baseUnitId_idx`(`baseUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_unit_conversions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `itemId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `multiplierToBase` DECIMAL(19, 8) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `item_unit_conversions_uuid_key`(`uuid`),
    UNIQUE INDEX `item_unit_conversions_itemId_unitId_key`(`itemId`, `unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `address` TEXT NULL,
    `openingBalance` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `currentBalance` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `creditLimit` DECIMAL(19, 4) NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_uuid_key`(`uuid`),
    UNIQUE INDEX `customers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `address` TEXT NULL,
    `openingBalanceOwn` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `openingBalanceConsignment` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `currentBalanceOwn` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `currentBalanceConsignment` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `suppliers_uuid_key`(`uuid`),
    UNIQUE INDEX `suppliers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `address` TEXT NULL,
    `jobTitle` VARCHAR(50) NOT NULL,
    `salary` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `joiningDate` DATE NOT NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employees_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opening_stock_entries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `entryNumber` VARCHAR(50) NOT NULL,
    `entryDate` DATE NOT NULL,
    `notes` TEXT NULL,
    `isFinalized` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `opening_stock_entries_uuid_key`(`uuid`),
    UNIQUE INDEX `opening_stock_entries_entryNumber_key`(`entryNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opening_stock_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `openingStockEntryId` BIGINT NOT NULL,
    `itemId` BIGINT NOT NULL,
    `ownershipType` ENUM('OWN', 'CONSIGNMENT') NOT NULL,
    `supplierId` BIGINT NULL,
    `enteredQuantity` DECIMAL(19, 6) NOT NULL,
    `enteredUnitName` VARCHAR(50) NOT NULL,
    `conversionFactorSnap` DECIMAL(19, 8) NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,
    `baseUnitName` VARCHAR(20) NOT NULL,
    `unitCost` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `referenceValuation` DECIMAL(19, 4) NULL,
    `batchNumber` VARCHAR(50) NOT NULL,
    `notes` TEXT NULL,

    UNIQUE INDEX `opening_stock_items_uuid_key`(`uuid`),
    INDEX `opening_stock_items_openingStockEntryId_idx`(`openingStockEntryId`),
    INDEX `opening_stock_items_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_batches` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `batchNumber` VARCHAR(50) NOT NULL,
    `itemId` BIGINT NOT NULL,
    `ownershipType` ENUM('OWN', 'CONSIGNMENT') NOT NULL,
    `sourceType` ENUM('OPENING', 'PURCHASE', 'CONSIGNMENT_RECEIPT') NOT NULL,
    `sourceDocumentId` BIGINT NOT NULL,
    `supplierId` BIGINT NULL,
    `receivedDate` DATE NOT NULL,
    `initialBaseQty` DECIMAL(19, 6) NOT NULL,
    `remainingBaseQty` DECIMAL(19, 6) NOT NULL,
    `baseUnitName` VARCHAR(20) NOT NULL DEFAULT 'KG',
    `unitCost` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `referenceValuation` DECIMAL(19, 4) NULL,
    `status` ENUM('ACTIVE', 'EXHAUSTED', 'QUARANTINED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_batches_uuid_key`(`uuid`),
    UNIQUE INDEX `stock_batches_batchNumber_key`(`batchNumber`),
    INDEX `stock_batches_itemId_ownershipType_status_receivedDate_id_idx`(`itemId`, `ownershipType`, `status`, `receivedDate`, `id`),
    INDEX `stock_batches_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `batchId` BIGINT NOT NULL,
    `itemId` BIGINT NOT NULL,
    `ownershipType` ENUM('OWN', 'CONSIGNMENT') NOT NULL,
    `supplierId` BIGINT NULL,
    `movementType` ENUM('OPENING', 'PURCHASE_IN', 'CONSIGNMENT_IN', 'SALE_OUT', 'PURCHASE_RETURN_OUT', 'SALE_RETURN_IN', 'CONSIGNMENT_RETURN_OUT', 'DAMAGE_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL') NOT NULL,
    `enteredQuantity` DECIMAL(19, 6) NOT NULL,
    `enteredUnitName` VARCHAR(50) NOT NULL,
    `conversionFactorSnap` DECIMAL(19, 8) NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,
    `baseUnitName` VARCHAR(20) NOT NULL DEFAULT 'KG',
    `referenceType` ENUM('OPENING_STOCK', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'CONSIGNMENT_RECEIPT', 'CONSIGNMENT_RETURN', 'SALE_INVOICE', 'SALE_RETURN', 'SUPPLIER_SETTLEMENT', 'SUPPLIER_ADVANCE', 'RECEIPT_VOUCHER', 'PAYMENT_VOUCHER', 'STOCK_ADJUSTMENT', 'JOURNAL_ENTRY') NOT NULL,
    `referenceId` BIGINT NOT NULL,
    `referenceNumber` VARCHAR(50) NOT NULL,
    `movementDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `stock_movements_uuid_key`(`uuid`),
    INDEX `stock_movements_batchId_idx`(`batchId`),
    INDEX `stock_movements_itemId_idx`(`itemId`),
    INDEX `stock_movements_movementDate_idx`(`movementDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_allocations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `batchId` BIGINT NOT NULL,
    `salesInvoiceItemId` BIGINT NOT NULL,
    `allocatedBaseQty` DECIMAL(19, 6) NOT NULL,
    `unitCost` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `totalCost` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `stock_allocations_uuid_key`(`uuid`),
    INDEX `stock_allocations_batchId_idx`(`batchId`),
    INDEX `stock_allocations_salesInvoiceItemId_idx`(`salesInvoiceItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_invoices` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `invoiceNumber` VARCHAR(50) NOT NULL,
    `supplierInvoiceNo` VARCHAR(50) NULL,
    `supplierId` BIGINT NOT NULL,
    `invoiceDate` DATE NOT NULL,
    `paymentMethod` ENUM('CASH', 'BANK', 'CREDIT', 'PARTIAL') NOT NULL,
    `grossAmount` DECIMAL(19, 4) NOT NULL,
    `discountAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `freightAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `loadingAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `netLandedAmount` DECIMAL(19, 4) NOT NULL,
    `paidAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `remainingBalance` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `purchase_invoices_uuid_key`(`uuid`),
    UNIQUE INDEX `purchase_invoices_invoiceNumber_key`(`invoiceNumber`),
    INDEX `purchase_invoices_supplierId_idx`(`supplierId`),
    INDEX `purchase_invoices_invoiceDate_idx`(`invoiceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_invoice_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `purchaseInvoiceId` BIGINT NOT NULL,
    `itemId` BIGINT NOT NULL,
    `enteredQuantity` DECIMAL(19, 6) NOT NULL,
    `enteredUnitName` VARCHAR(50) NOT NULL,
    `conversionFactorSnap` DECIMAL(19, 8) NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,
    `baseUnitName` VARCHAR(20) NOT NULL DEFAULT 'KG',
    `ratePerEnteredUnit` DECIMAL(19, 4) NOT NULL,
    `grossAmount` DECIMAL(19, 4) NOT NULL,
    `discountAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `freightAllocated` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `loadingAllocated` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `netLandedAmount` DECIMAL(19, 4) NOT NULL,
    `batchNumber` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `purchase_invoice_items_uuid_key`(`uuid`),
    INDEX `purchase_invoice_items_purchaseInvoiceId_idx`(`purchaseInvoiceId`),
    INDEX `purchase_invoice_items_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_returns` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `returnNumber` VARCHAR(50) NOT NULL,
    `purchaseInvoiceId` BIGINT NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `returnDate` DATE NOT NULL,
    `totalAmount` DECIMAL(19, 4) NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `purchase_returns_uuid_key`(`uuid`),
    UNIQUE INDEX `purchase_returns_returnNumber_key`(`returnNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_return_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `purchaseReturnId` BIGINT NOT NULL,
    `batchId` BIGINT NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,
    `unitCost` DECIMAL(19, 4) NOT NULL,
    `totalCost` DECIMAL(19, 4) NOT NULL,

    UNIQUE INDEX `purchase_return_items_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commission_agreements` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `itemId` BIGINT NULL,
    `commissionPercentage` DECIMAL(9, 6) NOT NULL,
    `effectiveStartDate` DATE NOT NULL,
    `effectiveEndDate` DATE NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commission_agreements_uuid_key`(`uuid`),
    INDEX `commission_agreements_supplierId_itemId_isActive_idx`(`supplierId`, `itemId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consignment_receipts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `receiptNumber` VARCHAR(50) NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `receiptDate` DATE NOT NULL,
    `vehicleNumber` VARCHAR(50) NULL,
    `driverPhone` VARCHAR(30) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `consignment_receipts_uuid_key`(`uuid`),
    UNIQUE INDEX `consignment_receipts_receiptNumber_key`(`receiptNumber`),
    INDEX `consignment_receipts_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consignment_receipt_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `consignmentReceiptId` BIGINT NOT NULL,
    `itemId` BIGINT NOT NULL,
    `enteredQuantity` DECIMAL(19, 6) NOT NULL,
    `enteredUnitName` VARCHAR(50) NOT NULL,
    `conversionFactorSnap` DECIMAL(19, 8) NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,
    `baseUnitName` VARCHAR(20) NOT NULL DEFAULT 'KG',
    `referenceRate` DECIMAL(19, 4) NULL,
    `batchNumber` VARCHAR(50) NOT NULL,
    `notes` TEXT NULL,

    UNIQUE INDEX `consignment_receipt_items_uuid_key`(`uuid`),
    INDEX `consignment_receipt_items_consignmentReceiptId_idx`(`consignmentReceiptId`),
    INDEX `consignment_receipt_items_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consignment_returns` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `returnNumber` VARCHAR(50) NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `returnDate` DATE NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `consignment_returns_uuid_key`(`uuid`),
    UNIQUE INDEX `consignment_returns_returnNumber_key`(`returnNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consignment_return_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `consignmentReturnId` BIGINT NOT NULL,
    `batchId` BIGINT NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,

    UNIQUE INDEX `consignment_return_items_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_advances` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `advanceNumber` VARCHAR(50) NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `advanceDate` DATE NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `allocatedAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `remainingAmount` DECIMAL(19, 4) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `supplier_advances_uuid_key`(`uuid`),
    UNIQUE INDEX `supplier_advances_advanceNumber_key`(`advanceNumber`),
    INDEX `supplier_advances_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_advance_allocations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `supplierAdvanceId` BIGINT NOT NULL,
    `supplierSettlementId` BIGINT NOT NULL,
    `allocatedAmount` DECIMAL(19, 4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `supplier_advance_allocations_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_settlements` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `settlementNumber` VARCHAR(50) NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `settlementDate` DATE NOT NULL,
    `grossPayableAmount` DECIMAL(19, 4) NOT NULL,
    `advanceDeductionAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `netPaidAmount` DECIMAL(19, 4) NOT NULL,
    `paymentMethod` ENUM('CASH', 'BANK', 'CREDIT', 'PARTIAL') NOT NULL,
    `referenceNumber` VARCHAR(50) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `supplier_settlements_uuid_key`(`uuid`),
    UNIQUE INDEX `supplier_settlements_settlementNumber_key`(`settlementNumber`),
    INDEX `supplier_settlements_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_invoices` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `invoiceNumber` VARCHAR(50) NOT NULL,
    `customerId` BIGINT NOT NULL,
    `invoiceDate` DATE NOT NULL,
    `paymentMethod` ENUM('CASH', 'BANK', 'CREDIT', 'PARTIAL') NOT NULL,
    `grossAmount` DECIMAL(19, 4) NOT NULL,
    `discountAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `taxAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `netInvoiceAmount` DECIMAL(19, 4) NOT NULL,
    `paidAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `remainingBalance` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sales_invoices_uuid_key`(`uuid`),
    UNIQUE INDEX `sales_invoices_invoiceNumber_key`(`invoiceNumber`),
    INDEX `sales_invoices_customerId_idx`(`customerId`),
    INDEX `sales_invoices_invoiceDate_idx`(`invoiceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_invoice_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `salesInvoiceId` BIGINT NOT NULL,
    `itemId` BIGINT NOT NULL,
    `ownershipType` ENUM('OWN', 'CONSIGNMENT') NOT NULL,
    `supplierId` BIGINT NULL,
    `enteredQuantity` DECIMAL(19, 6) NOT NULL,
    `enteredUnitName` VARCHAR(50) NOT NULL,
    `conversionFactorSnap` DECIMAL(19, 8) NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,
    `baseUnitName` VARCHAR(20) NOT NULL DEFAULT 'KG',
    `ratePerEnteredUnit` DECIMAL(19, 4) NOT NULL,
    `grossAmount` DECIMAL(19, 4) NOT NULL,
    `discountAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `netAmount` DECIMAL(19, 4) NOT NULL,
    `commissionPercentage` DECIMAL(9, 6) NOT NULL DEFAULT 0.000000,
    `commissionAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `supplierPayable` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `cogsAmount` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,

    UNIQUE INDEX `sales_invoice_items_uuid_key`(`uuid`),
    INDEX `sales_invoice_items_salesInvoiceId_idx`(`salesInvoiceId`),
    INDEX `sales_invoice_items_itemId_idx`(`itemId`),
    INDEX `sales_invoice_items_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_returns` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `returnNumber` VARCHAR(50) NOT NULL,
    `salesInvoiceId` BIGINT NOT NULL,
    `customerId` BIGINT NOT NULL,
    `returnDate` DATE NOT NULL,
    `totalAmount` DECIMAL(19, 4) NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sales_returns_uuid_key`(`uuid`),
    UNIQUE INDEX `sales_returns_returnNumber_key`(`returnNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_return_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `salesReturnId` BIGINT NOT NULL,
    `salesInvoiceItemId` BIGINT NOT NULL,
    `baseQuantity` DECIMAL(19, 6) NOT NULL,
    `rate` DECIMAL(19, 4) NOT NULL,
    `grossAmount` DECIMAL(19, 4) NOT NULL,
    `commissionReversed` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `supplierPayableAdj` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `isSaleable` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `sales_return_items_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chart_of_accounts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `accountCode` VARCHAR(30) NOT NULL,
    `accountName` VARCHAR(100) NOT NULL,
    `category` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'CONTRA_INCOME', 'EXPENSE') NOT NULL,
    `parentId` BIGINT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `chart_of_accounts_uuid_key`(`uuid`),
    UNIQUE INDEX `chart_of_accounts_accountCode_key`(`accountCode`),
    INDEX `chart_of_accounts_accountCode_idx`(`accountCode`),
    INDEX `chart_of_accounts_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_entries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `entryNumber` VARCHAR(50) NOT NULL,
    `entryDate` DATE NOT NULL,
    `referenceType` ENUM('OPENING_STOCK', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'CONSIGNMENT_RECEIPT', 'CONSIGNMENT_RETURN', 'SALE_INVOICE', 'SALE_RETURN', 'SUPPLIER_SETTLEMENT', 'SUPPLIER_ADVANCE', 'RECEIPT_VOUCHER', 'PAYMENT_VOUCHER', 'STOCK_ADJUSTMENT', 'JOURNAL_ENTRY') NOT NULL,
    `referenceId` BIGINT NOT NULL,
    `referenceNumber` VARCHAR(50) NOT NULL,
    `narration` TEXT NOT NULL,
    `totalDebit` DECIMAL(19, 4) NOT NULL,
    `totalCredit` DECIMAL(19, 4) NOT NULL,
    `isReversed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `journal_entries_uuid_key`(`uuid`),
    UNIQUE INDEX `journal_entries_entryNumber_key`(`entryNumber`),
    INDEX `journal_entries_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    INDEX `journal_entries_entryDate_idx`(`entryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_entry_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `journalEntryId` BIGINT NOT NULL,
    `accountId` BIGINT NOT NULL,
    `debit` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `credit` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `partyType` VARCHAR(20) NULL,
    `partyId` BIGINT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `journal_entry_lines_uuid_key`(`uuid`),
    INDEX `journal_entry_lines_journalEntryId_idx`(`journalEntryId`),
    INDEX `journal_entry_lines_accountId_idx`(`accountId`),
    INDEX `journal_entry_lines_partyType_partyId_idx`(`partyType`, `partyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cash_bank_accounts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `accountName` VARCHAR(100) NOT NULL,
    `accountType` VARCHAR(20) NOT NULL,
    `bankName` VARCHAR(100) NULL,
    `accountNumber` VARCHAR(50) NULL,
    `glAccountId` BIGINT NOT NULL,
    `currentBalance` DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cash_bank_accounts_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipt_vouchers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `voucherNumber` VARCHAR(50) NOT NULL,
    `voucherDate` DATE NOT NULL,
    `cashBankAccountId` BIGINT NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `partyType` VARCHAR(20) NULL,
    `partyId` BIGINT NULL,
    `creditAccountId` BIGINT NOT NULL,
    `referenceNumber` VARCHAR(50) NULL,
    `narration` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `receipt_vouchers_uuid_key`(`uuid`),
    UNIQUE INDEX `receipt_vouchers_voucherNumber_key`(`voucherNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_vouchers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `voucherNumber` VARCHAR(50) NOT NULL,
    `voucherDate` DATE NOT NULL,
    `cashBankAccountId` BIGINT NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `partyType` VARCHAR(20) NULL,
    `partyId` BIGINT NULL,
    `debitAccountId` BIGINT NOT NULL,
    `referenceNumber` VARCHAR(50) NULL,
    `narration` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payment_vouchers_uuid_key`(`uuid`),
    UNIQUE INDEX `payment_vouchers_voucherNumber_key`(`voucherNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_outbox` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `aggregateType` VARCHAR(50) NOT NULL,
    `aggregateId` BIGINT NOT NULL,
    `eventType` VARCHAR(50) NOT NULL,
    `payloadJson` LONGTEXT NOT NULL,
    `status` ENUM('PENDING', 'ACKNOWLEDGED', 'FAILED', 'CONFLICT') NOT NULL DEFAULT 'PENDING',
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `syncedAt` DATETIME(3) NULL,

    UNIQUE INDEX `sync_outbox_uuid_key`(`uuid`),
    INDEX `sync_outbox_status_id_idx`(`status`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_inbox` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `aggregateType` VARCHAR(50) NOT NULL,
    `aggregateId` BIGINT NOT NULL,
    `eventType` VARCHAR(50) NOT NULL,
    `payloadJson` LONGTEXT NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sync_inbox_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `batchSize` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `responseCode` INTEGER NULL,
    `latencyMs` INTEGER NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `tableName` VARCHAR(50) NOT NULL,
    `recordId` BIGINT NULL,
    `deviceId` VARCHAR(50) NULL,
    `diffJson` LONGTEXT NULL,
    `performedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `audit_logs_uuid_key`(`uuid`),
    INDEX `audit_logs_tableName_recordId_idx`(`tableName`, `recordId`),
    INDEX `audit_logs_performedAt_idx`(`performedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accounting_periods` ADD CONSTRAINT `accounting_periods_financialYearId_fkey` FOREIGN KEY (`financialYearId`) REFERENCES `financial_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `item_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_baseUnitId_fkey` FOREIGN KEY (`baseUnitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_unit_conversions` ADD CONSTRAINT `item_unit_conversions_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_unit_conversions` ADD CONSTRAINT `item_unit_conversions_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_stock_items` ADD CONSTRAINT `opening_stock_items_openingStockEntryId_fkey` FOREIGN KEY (`openingStockEntryId`) REFERENCES `opening_stock_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_stock_items` ADD CONSTRAINT `opening_stock_items_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `stock_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_allocations` ADD CONSTRAINT `stock_allocations_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `stock_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_allocations` ADD CONSTRAINT `stock_allocations_salesInvoiceItemId_fkey` FOREIGN KEY (`salesInvoiceItemId`) REFERENCES `sales_invoice_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoice_items` ADD CONSTRAINT `purchase_invoice_items_purchaseInvoiceId_fkey` FOREIGN KEY (`purchaseInvoiceId`) REFERENCES `purchase_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoice_items` ADD CONSTRAINT `purchase_invoice_items_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_returns` ADD CONSTRAINT `purchase_returns_purchaseInvoiceId_fkey` FOREIGN KEY (`purchaseInvoiceId`) REFERENCES `purchase_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_returns` ADD CONSTRAINT `purchase_returns_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_purchaseReturnId_fkey` FOREIGN KEY (`purchaseReturnId`) REFERENCES `purchase_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_agreements` ADD CONSTRAINT `commission_agreements_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_agreements` ADD CONSTRAINT `commission_agreements_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignment_receipts` ADD CONSTRAINT `consignment_receipts_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignment_receipt_items` ADD CONSTRAINT `consignment_receipt_items_consignmentReceiptId_fkey` FOREIGN KEY (`consignmentReceiptId`) REFERENCES `consignment_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignment_receipt_items` ADD CONSTRAINT `consignment_receipt_items_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignment_returns` ADD CONSTRAINT `consignment_returns_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignment_return_items` ADD CONSTRAINT `consignment_return_items_consignmentReturnId_fkey` FOREIGN KEY (`consignmentReturnId`) REFERENCES `consignment_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_advances` ADD CONSTRAINT `supplier_advances_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_advance_allocations` ADD CONSTRAINT `supplier_advance_allocations_supplierAdvanceId_fkey` FOREIGN KEY (`supplierAdvanceId`) REFERENCES `supplier_advances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_advance_allocations` ADD CONSTRAINT `supplier_advance_allocations_supplierSettlementId_fkey` FOREIGN KEY (`supplierSettlementId`) REFERENCES `supplier_settlements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_settlements` ADD CONSTRAINT `supplier_settlements_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoice_items` ADD CONSTRAINT `sales_invoice_items_salesInvoiceId_fkey` FOREIGN KEY (`salesInvoiceId`) REFERENCES `sales_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoice_items` ADD CONSTRAINT `sales_invoice_items_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_returns` ADD CONSTRAINT `sales_returns_salesInvoiceId_fkey` FOREIGN KEY (`salesInvoiceId`) REFERENCES `sales_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_returns` ADD CONSTRAINT `sales_returns_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_return_items` ADD CONSTRAINT `sales_return_items_salesReturnId_fkey` FOREIGN KEY (`salesReturnId`) REFERENCES `sales_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chart_of_accounts` ADD CONSTRAINT `chart_of_accounts_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `chart_of_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entry_lines` ADD CONSTRAINT `journal_entry_lines_journalEntryId_fkey` FOREIGN KEY (`journalEntryId`) REFERENCES `journal_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entry_lines` ADD CONSTRAINT `journal_entry_lines_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `chart_of_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipt_vouchers` ADD CONSTRAINT `receipt_vouchers_cashBankAccountId_fkey` FOREIGN KEY (`cashBankAccountId`) REFERENCES `cash_bank_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_vouchers` ADD CONSTRAINT `payment_vouchers_cashBankAccountId_fkey` FOREIGN KEY (`cashBankAccountId`) REFERENCES `cash_bank_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
