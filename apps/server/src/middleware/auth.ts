import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { prisma } from '../database/prisma.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    username: string;
    isOwner: boolean;
  };
  deviceId?: string;
}

const isLocalhostRequest = (req: Request): boolean => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const host = req.hostname || req.headers.host || '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    ENV.NODE_ENV === 'development'
  );
};

export function requireOwnerAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const isLocal = isLocalhostRequest(req);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Standalone desktop / local mandi operator fallback
    if (isLocal) {
      req.user = { username: 'admin', isOwner: true };
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Owner authentication token is required.',
    });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as { username: string; isOwner: boolean };
    req.user = decoded;
    return next();
  } catch (_err) {
    // If token expired or invalid but request is local, grant local owner privileges
    if (isLocal) {
      req.user = { username: 'admin', isOwner: true };
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Authentication token has expired or is invalid.',
    });
  }
}

export async function requireDeviceOrOwnerAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const isLocal = isLocalhostRequest(req);

  // If owner token is present, evaluate
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireOwnerAuth(req, res, next);
  }

  // Standalone desktop / local mandi operator fallback
  if (isLocal) {
    req.user = { username: 'admin', isOwner: true };
    return next();
  }

  // Check LAN Device Token
  const deviceToken = req.headers['x-device-token'] as string;
  if (deviceToken) {
    const device = await prisma.registeredDevice.findUnique({
      where: { deviceToken },
    });

    if (device && device.isAuthorized) {
      req.deviceId = device.uuid;
      return next();
    }
  }

  return res.status(401).json({
    success: false,
    error: 'UNAUTHORIZED_DEVICE',
    message: 'Access denied: Workstation device is not authorized on this Mandi server.',
  });
}
