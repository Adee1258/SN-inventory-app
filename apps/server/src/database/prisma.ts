import { PrismaClient } from '@prisma/client';

// Enable JSON serialization of BigInt
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  const intVal = Number(this);
  return Number.isSafeInteger(intVal) ? intVal : this.toString() as unknown as number;
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    console.error('Database connection failed:', err);
    return false;
  }
}
