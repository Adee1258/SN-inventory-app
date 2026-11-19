import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../database/prisma.js';
import { ENV } from '../../config/env.js';
import { OwnerLoginSchema, MasterPinSchema } from '@erp/validation';
import { requireOwnerAuth, type AuthenticatedRequest } from '../../middleware/auth.js';

const router = Router();

function hashSecret(secret: string, salt: string): string {
  return crypto.pbkdf2Sync(secret, salt, 100000, 64, 'sha512').toString('hex');
}

// 1. Owner Login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = OwnerLoginSchema.parse(req.body);

  const owner = await prisma.ownerAuth.findUnique({
    where: { username },
  });

  if (!owner) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid owner username or password.',
    });
  }

  const expectedHash = hashSecret(password, owner.salt);
  if (expectedHash !== owner.passwordHash) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid owner username or password.',
    });
  }

  // Update last login
  await prisma.ownerAuth.update({
    where: { id: owner.id },
    data: { lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { username: owner.username, isOwner: true },
    ENV.JWT_SECRET,
    { expiresIn: '365d' }
  );

  return res.json({
    success: true,
    data: {
      token,
      username: owner.username,
      lastLoginAt: owner.lastLoginAt,
    },
  });
});

// 2. Verify Master PIN (for reversals or adjustments)
router.post('/verify-pin', requireOwnerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { pin } = MasterPinSchema.parse(req.body);

  const owner = await prisma.ownerAuth.findFirst();
  if (!owner) {
    return res.status(404).json({ success: false, message: 'Owner account not initialized' });
  }

  const pinHash = hashSecret(pin, owner.salt);
  if (pinHash !== owner.masterPinHash) {
    return res.status(403).json({
      success: false,
      error: 'INVALID_PIN',
      message: 'Incorrect master PIN. Access denied.',
    });
  }

  return res.json({
    success: true,
    message: 'Master PIN verified successfully.',
  });
});

// 3. Current Session
router.get('/me', requireOwnerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const profile = await prisma.businessProfile.findFirst();
  return res.json({
    success: true,
    data: {
      user: req.user,
      business: profile,
    },
  });
});

// 4. Register LAN Client Device
router.post('/register-device', requireOwnerAuth, async (req: Request, res: Response) => {
  const { deviceName, ipAddress, macAddress } = req.body;
  const deviceToken = crypto.randomBytes(32).toString('hex');

  const device = await prisma.registeredDevice.create({
    data: {
      deviceName: deviceName || 'Shop Terminal',
      deviceToken,
      ipAddress,
      macAddress,
      isAuthorized: true,
    },
  });

  return res.json({
    success: true,
    data: device,
  });
});

// 5. Get Current Owner Username
router.get('/credentials', async (_req: Request, res: Response) => {
  const owner = await prisma.ownerAuth.findFirst();
  return res.json({
    success: true,
    data: {
      username: owner?.username || 'admin',
    },
  });
});

// 6. Change Username and/or Password
router.post('/change-credentials', async (req: Request, res: Response) => {
  const { currentPassword, newUsername, newPassword } = req.body;

  if (!currentPassword) {
    return res.status(400).json({
      success: false,
      message: 'Purana password likhna zaroori hai (Current password is required).',
    });
  }

  const owner = await prisma.ownerAuth.findFirst();
  if (!owner) {
    return res.status(404).json({ success: false, message: 'Owner account not initialized' });
  }

  // Verify current password
  const currentHash = hashSecret(currentPassword, owner.salt);
  if (currentHash !== owner.passwordHash) {
    return res.status(401).json({
      success: false,
      message: 'Mojooda password ghalat hai (Current password is incorrect).',
    });
  }

  const updateData: { username?: string; passwordHash?: string; salt?: string } = {};

  if (newUsername && newUsername.trim()) {
    const trimmedUsername = newUsername.trim();
    if (trimmedUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username kam az kam 3 characters ka hona chahiye.',
      });
    }
    updateData.username = trimmedUsername;
  }

  if (newPassword && newPassword.trim()) {
    const trimmedPassword = newPassword.trim();
    if (trimmedPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Naya password kam az kam 4 characters ka hona chahiye.',
      });
    }
    const newSalt = crypto.randomBytes(32).toString('hex');
    updateData.salt = newSalt;
    updateData.passwordHash = hashSecret(trimmedPassword, newSalt);
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Koi naya username ya password provide nahi kiya gaya.',
    });
  }

  const updatedOwner = await prisma.ownerAuth.update({
    where: { id: owner.id },
    data: updateData,
  });

  const newToken = jwt.sign(
    { username: updatedOwner.username, isOwner: true },
    ENV.JWT_SECRET,
    { expiresIn: '365d' }
  );

  return res.json({
    success: true,
    message: 'Username aur password kamyabi se update ho gaye!',
    data: {
      username: updatedOwner.username,
      token: newToken,
    },
  });
});

export const authRoutes = router;
