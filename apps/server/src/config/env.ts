import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from root or server directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_HOST: process.env.API_HOST || '0.0.0.0',
  DATABASE_URL: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/wholesale_erp',
  JWT_SECRET: process.env.JWT_SECRET || 'ghalla-mandi-super-secure-jwt-key-32chars',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '365d',
  MASTER_PIN: process.env.MASTER_PIN || '1234',
  DEFAULT_BASE_UNIT: process.env.DEFAULT_BASE_UNIT || 'KG',
  DEFAULT_MANN_KG: parseFloat(process.env.DEFAULT_MANN_KG || '40.0'),
  DEFAULT_COMMISSION_PCT: parseFloat(process.env.DEFAULT_COMMISSION_PCT || '2.0'),
  CLOUD_SYNC_ENABLED: process.env.CLOUD_SYNC_ENABLED === 'true',
  CLOUD_API_URL: process.env.CLOUD_API_URL || '',
  CLOUD_API_KEY: process.env.CLOUD_API_KEY || '',
  DEVICE_ID: process.env.DEVICE_ID || 'MAIN-SERVER',
};
