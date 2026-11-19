import { Router, type Request, type Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { Decimal } from '@erp/business-rules';

const router = Router();

// Known settings keys and their defaults
export const SETTINGS_DEFAULTS: Record<string, string> = {
  business_name: 'SN Inventory ERP',
  owner_name: 'Shop Owner',
  mandi_location: 'New Grain Market Wholesale Yard',
  mann_default_kg: '40',
  bag_default_kg: '50',
  default_commission_pct: '2',
};

// Helper to get a setting value from DB or default
export async function getSettingValue(key: string, defaultValue?: string): Promise<string> {
  const row = await prisma.appSettings.findUnique({ where: { settingKey: key } });
  if (row && row.settingValue) return row.settingValue;
  return defaultValue ?? SETTINGS_DEFAULTS[key] ?? '';
}

// GET /api/v1/settings — returns all settings as key-value map
router.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.appSettings.findMany();
  const result: Record<string, string> = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    result[row.settingKey] = row.settingValue;
  }
  return res.json({ success: true, data: result });
});

// POST /api/v1/settings — upsert multiple settings at once and sync conversions for all items
router.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, string>;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ success: false, message: 'Body must be a key-value object' });
  }

  // 1. Upsert into AppSettings table
  const upsertOps = Object.entries(body).map(([key, value]) =>
    prisma.appSettings.upsert({
      where: { settingKey: key },
      update: { settingValue: String(value).trim() },
      create: { settingKey: key, settingValue: String(value).trim() },
    })
  );
  await Promise.all(upsertOps);

  // 2. If mann_default_kg or bag_default_kg was provided, sync itemUnitConversion for all active items
  const mannKgNum = parseFloat(body.mann_default_kg);
  const bagKgNum = parseFloat(body.bag_default_kg);

  const units = await prisma.unit.findMany();
  const mannUnit = units.find((u) => u.code.toUpperCase() === 'MANN');
  const bagUnit = units.find((u) => u.code.toUpperCase() === 'BAG');
  const items = await prisma.item.findMany({ where: { isActive: true } });

  const conversionOps = [];

  if (mannUnit && !isNaN(mannKgNum) && mannKgNum > 0) {
    const mannDec = new Decimal(mannKgNum);
    for (const item of items) {
      if (item.baseUnitId !== mannUnit.id) {
        conversionOps.push(
          prisma.itemUnitConversion.upsert({
            where: { itemId_unitId: { itemId: item.id, unitId: mannUnit.id } },
            update: { multiplierToBase: mannDec },
            create: { itemId: item.id, unitId: mannUnit.id, multiplierToBase: mannDec },
          })
        );
      }
    }
  }

  if (bagUnit && !isNaN(bagKgNum) && bagKgNum > 0) {
    const bagDec = new Decimal(bagKgNum);
    for (const item of items) {
      if (item.baseUnitId !== bagUnit.id) {
        conversionOps.push(
          prisma.itemUnitConversion.upsert({
            where: { itemId_unitId: { itemId: item.id, unitId: bagUnit.id } },
            update: { multiplierToBase: bagDec },
            create: { itemId: item.id, unitId: bagUnit.id, multiplierToBase: bagDec },
          })
        );
      }
    }
  }

  if (conversionOps.length > 0) {
    await prisma.$transaction(conversionOps);
  }

  return res.json({
    success: true,
    message: 'Configuration saved and item unit conversions updated successfully',
  });
});

export const settingsRoutes = router;
