/**
 * Outbox Writer — Local → Cloud Sync
 *
 * Jab bhi local server pe koi transaction save ho (Sale, Purchase, Commission, Voucher),
 * yeh helper SyncOutbox table mein ek record daalta hai.
 * Sync Worker baad mein yeh records uthata hai aur cloud ko push karta hai.
 *
 * IMPORTANT: Vercel (cloud/serverless) pe yeh function kuch nahi karta — sirf local server hi outbox mein likhta hai.
 */

import { prisma } from '../database/prisma.js';

const isServerless = !!(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION
);

function safeJson(obj: unknown): string {
  return JSON.stringify(obj, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
}

/**
 * SyncOutbox mein event likhta hai.
 * aggregateType: 'SALE_INVOICE' | 'PURCHASE_INVOICE' | 'CONSIGNMENT_RECEIPT' | 'COMMISSION_EXPENSE' | 'RECEIPT_VOUCHER' | 'PAYMENT_VOUCHER' | 'SUPPLIER_SETTLEMENT'
 * eventType: 'CREATED' | 'UPDATED' | 'DELETED'
 * payload: koi bhi object (BigInt auto-convert hoga string mein)
 */
export async function writeOutbox(
  aggregateType: string,
  aggregateId: bigint,
  eventType: 'CREATED' | 'UPDATED' | 'DELETED',
  payload: unknown
): Promise<void> {
  if (isServerless) return; // Cloud pe kuch nahi karna

  try {
    await prisma.syncOutbox.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        payloadJson: safeJson(payload),
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[Outbox] Queued: ${aggregateType} #${aggregateId} (${eventType})`);
  } catch (err) {
    // Outbox write fail hone se main transaction fail nahi hona chahiye
    console.error('[Outbox] Write failed (non-critical):', err);
  }
}

/**
 * Sale ke validated input ko UUIDs se enrich karta hai taake
 * cloud ko IDs ki bajaye UUIDs mil sakein.
 */
export async function enrichSalePayload(validated: {
  customerId: number | string;
  items: Array<{
    itemId: number | string;
    supplierId?: number | string | null;
    unitId: number | string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}): Promise<Record<string, unknown>> {
  const customer = await prisma.customer.findUnique({
    where: { id: BigInt(validated.customerId) },
    select: { uuid: true, code: true, name: true },
  });

  const enrichedItems = await Promise.all(
    validated.items.map(async (line) => {
      const [item, unit] = await Promise.all([
        prisma.item.findUnique({
          where: { id: BigInt(line.itemId) },
          select: { uuid: true, code: true, name: true },
        }),
        prisma.unit.findUnique({
          where: { id: BigInt(line.unitId) },
          select: { code: true, name: true },
        }),
      ]);
      let supplierUuid: string | null = null;
      let supplierCode: string | null = null;
      if (line.supplierId) {
        const sup = await prisma.supplier.findUnique({
          where: { id: BigInt(line.supplierId) },
          select: { uuid: true, code: true },
        });
        supplierUuid = sup?.uuid ?? null;
        supplierCode = sup?.code ?? null;
      }
      return {
        ...line,
        itemUuid: item?.uuid ?? null,
        itemCode: item?.code ?? null,
        itemName: item?.name ?? null,
        unitCode: unit?.code ?? null,
        unitName: unit?.name ?? null,
        supplierUuid,
        supplierCode,
      };
    })
  );

  return {
    ...validated,
    customerUuid: customer?.uuid ?? null,
    customerCode: customer?.code ?? null,
    customerName: customer?.name ?? null,
    items: enrichedItems,
  };
}

/**
 * Purchase ke validated input ko UUIDs se enrich karta hai.
 */
export async function enrichPurchasePayload(validated: {
  supplierId: number | string;
  items: Array<{
    itemId: number | string;
    unitId: number | string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}): Promise<Record<string, unknown>> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: BigInt(validated.supplierId) },
    select: { uuid: true, code: true, name: true },
  });

  const enrichedItems = await Promise.all(
    validated.items.map(async (line) => {
      const [item, unit] = await Promise.all([
        prisma.item.findUnique({
          where: { id: BigInt(line.itemId) },
          select: { uuid: true, code: true, name: true },
        }),
        prisma.unit.findUnique({
          where: { id: BigInt(line.unitId) },
          select: { code: true, name: true },
        }),
      ]);
      return {
        ...line,
        itemUuid: item?.uuid ?? null,
        itemCode: item?.code ?? null,
        itemName: item?.name ?? null,
        unitCode: unit?.code ?? null,
        unitName: unit?.name ?? null,
      };
    })
  );

  return {
    ...validated,
    supplierUuid: supplier?.uuid ?? null,
    supplierCode: supplier?.code ?? null,
    supplierName: supplier?.name ?? null,
    items: enrichedItems,
  };
}

/**
 * Commission Receipt ke validated input ko UUIDs se enrich karta hai.
 */
export async function enrichConsignmentPayload(validated: {
  supplierId: number | string;
  items: Array<{
    itemId: number | string;
    unitId: number | string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}): Promise<Record<string, unknown>> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: BigInt(validated.supplierId) },
    select: { uuid: true, code: true, name: true },
  });

  const enrichedItems = await Promise.all(
    validated.items.map(async (line) => {
      const [item, unit] = await Promise.all([
        prisma.item.findUnique({
          where: { id: BigInt(line.itemId) },
          select: { uuid: true, code: true, name: true },
        }),
        prisma.unit.findUnique({
          where: { id: BigInt(line.unitId) },
          select: { code: true, name: true },
        }),
      ]);
      return {
        ...line,
        itemUuid: item?.uuid ?? null,
        itemCode: item?.code ?? null,
        itemName: item?.name ?? null,
        unitCode: unit?.code ?? null,
        unitName: unit?.name ?? null,
      };
    })
  );

  return {
    ...validated,
    supplierUuid: supplier?.uuid ?? null,
    supplierCode: supplier?.code ?? null,
    supplierName: supplier?.name ?? null,
    items: enrichedItems,
  };
}
