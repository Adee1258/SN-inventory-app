/**
 * Sync Routes — Cloud Server Side
 *
 * POST /api/v1/sync/push  — Local server se aane wala batch receive karta hai aur SyncInbox mein store karta hai
 * GET  /api/v1/sync/status — Pending outbox count aur last sync info deta hai
 *
 * Cloud pe: Sirf receive karta hai (inbox). Local pe: Sirf send karta hai (outbox).
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../../database/prisma.js';

const router = Router();

// ─────────────────────────────────────────────────────────────
// POST /sync/push — Local server se batch receive karo
// ─────────────────────────────────────────────────────────────
router.post('/push', async (req: Request, res: Response) => {
  const { batch } = req.body as {
    batch: Array<{
      uuid: string;
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: unknown;
      createdAt: string;
    }>;
  };

  if (!Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({ success: false, message: 'Batch array required' });
  }

  const acknowledgedUuids: string[] = [];

  for (const record of batch) {
    try {
      // Pehle check karo ke yeh UUID pehle se exist toh nahi karta (idempotent)
      const existing = await prisma.syncInbox.findUnique({
        where: { uuid: record.uuid },
      });

      if (existing) {
        // Already processed — acknowledge it again (idempotent)
        acknowledgedUuids.push(record.uuid);
        continue;
      }

      // SyncInbox mein store karo (future processing ke liye)
      await prisma.syncInbox.create({
        data: {
          uuid: record.uuid,
          aggregateType: record.aggregateType,
          aggregateId: BigInt(record.aggregateId),
          eventType: record.eventType,
          payloadJson: JSON.stringify(record.payload),
        },
      });

      acknowledgedUuids.push(record.uuid);

      // Log
      await prisma.syncLog.create({
        data: {
          batchSize: 1,
          status: 'RECEIVED',
          responseCode: 200,
          latencyMs: 0,
          details: `Received ${record.aggregateType} #${record.aggregateId} (${record.eventType})`,
        },
      });
    } catch (err) {
      console.error(`[SyncPush] Failed to process record ${record.uuid}:`, err);
      // Skip this record — it will be retried by the local sync worker
    }
  }

  return res.json({
    success: true,
    acknowledgedUuids,
    received: batch.length,
    acknowledged: acknowledgedUuids.length,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /sync/status — Pending outbox count aur sync health
// ─────────────────────────────────────────────────────────────
router.get('/status', async (_req: Request, res: Response) => {
  const [pendingCount, acknowledgedCount, failedCount, lastLog] = await Promise.all([
    prisma.syncOutbox.count({ where: { status: 'PENDING' } }),
    prisma.syncOutbox.count({ where: { status: 'ACKNOWLEDGED' } }),
    prisma.syncOutbox.count({ where: { status: 'FAILED' } }),
    prisma.syncLog.findFirst({ orderBy: { createdAt: 'desc' } }),
  ]);

  return res.json({
    success: true,
    data: {
      pendingCount,
      acknowledgedCount,
      failedCount,
      lastSyncAt: lastLog?.createdAt ?? null,
      lastSyncStatus: lastLog?.status ?? null,
    },
  });
});

export const syncRoutes = router;
