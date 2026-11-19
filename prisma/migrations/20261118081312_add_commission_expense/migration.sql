-- AlterTable
ALTER TABLE `journal_entries` MODIFY `referenceType` ENUM('OPENING_STOCK', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'CONSIGNMENT_RECEIPT', 'CONSIGNMENT_RETURN', 'SALE_INVOICE', 'SALE_RETURN', 'SUPPLIER_SETTLEMENT', 'SUPPLIER_ADVANCE', 'RECEIPT_VOUCHER', 'PAYMENT_VOUCHER', 'STOCK_ADJUSTMENT', 'JOURNAL_ENTRY', 'COMMISSION_EXPENSE') NOT NULL;

-- AlterTable
ALTER TABLE `stock_movements` MODIFY `referenceType` ENUM('OPENING_STOCK', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'CONSIGNMENT_RECEIPT', 'CONSIGNMENT_RETURN', 'SALE_INVOICE', 'SALE_RETURN', 'SUPPLIER_SETTLEMENT', 'SUPPLIER_ADVANCE', 'RECEIPT_VOUCHER', 'PAYMENT_VOUCHER', 'STOCK_ADJUSTMENT', 'JOURNAL_ENTRY', 'COMMISSION_EXPENSE') NOT NULL;

-- CreateTable
CREATE TABLE `commission_expenses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `expenseDate` DATE NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `category` VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commission_expenses_uuid_key`(`uuid`),
    INDEX `commission_expenses_expenseDate_idx`(`expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `opening_stock_items_supplierId_idx` ON `opening_stock_items`(`supplierId`);

-- AddForeignKey
ALTER TABLE `opening_stock_items` ADD CONSTRAINT `opening_stock_items_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
