import { PrismaClient, type Prisma } from '@prisma/client';

// Enable JSON serialization of BigInt
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  const intVal = Number(this);
  return Number.isSafeInteger(intVal) ? intVal : this.toString() as unknown as number;
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export interface DbTransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Transaction wrapper with generous timeouts for TiDB Cloud (high-latency hosted DB).
 * Default Prisma timeout is 5s which is too short for multi-query transactions over the network.
 */
export async function dbTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: DbTransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: 15000,  // 15s max wait for a connection slot
    timeout: 30000,  // 30s max for the transaction itself
    ...opts,
  });
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    console.error('Database connection failed:', err);
    return false;
  }
}
