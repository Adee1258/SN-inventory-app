import { prisma } from '../database/prisma.js';
import { ENV } from '../config/env.js';

let syncIntervalTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Transactional Outbox Sync Worker
 * Periodically polls and pushes outbox records to the cloud server when enabled.
 * Adheres strictly to the rule: "Only mark outbox ACKNOWLEDGED after receiving server confirmation."
 */
export async function processOutboxBatch(): Promise<number> {
  if (isProcessing) return 0;
  isProcessing = true;

  try {
    // Fetch pending outbox records in strict FIFO creation order
    const pendingRecords = await prisma.syncOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { id: 'asc' },
      take: 50,
    });

    if (pendingRecords.length === 0) {
      return 0;
    }

    // If cloud sync is not enabled, records remain queued safely in the outbox
    if (!ENV.CLOUD_SYNC_ENABLED || !ENV.CLOUD_API_URL) {
      return 0;
    }

    const payload = pendingRecords.map((r) => ({
      uuid: r.uuid,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId.toString(),
      eventType: r.eventType,
      payload: JSON.parse(r.payloadJson),
      createdAt: r.createdAt.toISOString(),
    }));

    const startTime = Date.now();
    let responseStatus = 0;
    let errorDetails: string | null = null;

    try {
      const response = await fetch(`${ENV.CLOUD_API_URL}/api/v1/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': ENV.DEVICE_ID || 'MAIN-SERVER',
          'Authorization': `Bearer ${ENV.CLOUD_API_KEY || ''}`,
        },
        body: JSON.stringify({ batch: payload }),
      });

      responseStatus = response.status;
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const result = (await response.json()) as { acknowledgedUuids?: string[] };
        const ackedUuids = result.acknowledgedUuids || pendingRecords.map((r) => r.uuid);

        // Transactionally mark acknowledged records
        await prisma.syncOutbox.updateMany({
          where: { uuid: { in: ackedUuids } },
          data: {
            status: 'ACKNOWLEDGED',
            syncedAt: new Date(),
          },
        });

        // Log sync success
        await prisma.syncLog.create({
          data: {
            batchSize: ackedUuids.length,
            status: 'SUCCESS',
            responseCode: responseStatus,
            latencyMs,
            details: `Pushed ${ackedUuids.length} records successfully.`,
          },
        });

        return ackedUuids.length;
      } else {
        errorDetails = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (netErr: unknown) {
      errorDetails = netErr instanceof Error ? netErr.message : 'Network error during cloud sync';
    }

    // Handle failure for the batch
    const failedIds = pendingRecords.map((r) => r.id);
    await prisma.syncOutbox.updateMany({
      where: { id: { in: failedIds } },
      data: {
        retryCount: { increment: 1 },
        lastError: errorDetails,
      },
    });

    await prisma.syncLog.create({
      data: {
        batchSize: pendingRecords.length,
        status: 'FAILED',
        responseCode: responseStatus || null,
        latencyMs: Date.now() - startTime,
        details: errorDetails || 'Sync push failed',
      },
    });

    return 0;
  } catch (err) {
    console.error('[SyncWorker] Error in sync process:', err);
    return 0;
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the background outbox polling daemon
 */
export function startSyncWorker(intervalMs = 15000): void {
  if (syncIntervalTimer) return;

  console.log(`[SyncWorker] Starting outbox synchronization worker (Interval: ${intervalMs}ms)`);
  syncIntervalTimer = setInterval(async () => {
    try {
      await processOutboxBatch();
    } catch (e) {
      console.error('[SyncWorker] Unexpected worker interval error:', e);
    }
  }, intervalMs);
}

/**
 * Stops the sync daemon gracefully
 */
export function stopSyncWorker(): void {
  if (syncIntervalTimer) {
    clearInterval(syncIntervalTimer);
    syncIntervalTimer = null;
    console.log('[SyncWorker] Synchronization worker stopped');
  }
}
