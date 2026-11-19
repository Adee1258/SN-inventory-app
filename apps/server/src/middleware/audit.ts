import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma.js';

export interface AuditLogOptions {
  action: string;
  tableName: string;
  getRecordId?: (req: Request, res: Response) => bigint | undefined;
}

/**
 * Creates an audit log entry in the database.
 */
export async function recordAuditLog(params: {
  action: string;
  tableName: string;
  recordId?: bigint | null;
  deviceId?: string | null;
  diffJson?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        tableName: params.tableName,
        recordId: params.recordId ?? null,
        deviceId: params.deviceId ?? null,
        diffJson: params.diffJson ?? null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to record audit log:', err);
  }
}

/**
 * Express middleware to automatically log mutating API requests
 */
export function auditLogMiddleware(options: AuditLogOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Intercept response finish
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const deviceId = (req.headers['x-device-id'] as string) || (req.headers['x-client-ip'] as string) || req.ip;
        const diffJson = req.method !== 'GET' ? JSON.stringify(req.body) : null;
        const recordId = options.getRecordId ? options.getRecordId(req, res) : undefined;

        await recordAuditLog({
          action: options.action,
          tableName: options.tableName,
          recordId,
          deviceId: typeof deviceId === 'string' ? deviceId : null,
          diffJson,
        });
      }
    });

    next();
  };
}
