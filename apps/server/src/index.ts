import 'express-async-errors';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ENV } from './config/env.js';
import { checkDatabaseConnection } from './database/prisma.js';
import { errorHandler } from './middleware/error-handler.js';

// Route Modules
import { authRoutes } from './modules/auth/auth.routes.js';
import { itemRoutes } from './modules/items/items.routes.js';
import { partyRoutes } from './modules/parties/parties.routes.js';
import { openingStockRoutes } from './modules/opening-stock/opening-stock.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { purchaseRoutes } from './modules/purchases/purchases.routes.js';
import { commissionRoutes } from './modules/commission/commission.routes.js';
import { saleRoutes } from './modules/sales/sales.routes.js';
import { accountingRoutes } from './modules/accounting/accounting.routes.js';
import { voucherRoutes } from './modules/vouchers/vouchers.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { startSyncWorker } from './sync/sync-worker.js';

const app = express();

// Security & Parsing Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Electron renderer interacts locally
app.use(cors({ origin: '*' })); // Allow LAN clients
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (ENV.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health Check
app.get('/health', async (_req: Request, res: Response) => {
  const isDbConnected = await checkDatabaseConnection();
  return res.json({
    status: 'OK',
    application: 'Wholesale / Ghalla Mandi ERP Backend API',
    version: '1.0.0',
    databaseConnected: isDbConnected,
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/parties', partyRoutes);
app.use('/api/v1/opening-stock', openingStockRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/purchases', purchaseRoutes);
app.use('/api/v1/commission', commissionRoutes);
app.use('/api/v1/sales', saleRoutes);
app.use('/api/v1/accounting', accountingRoutes);
app.use('/api/v1/vouchers', voucherRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/settings', settingsRoutes);

// Centralized Error Handler
app.use(errorHandler);

// Start Server (only when not running inside Vercel serverless environment)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(ENV.PORT, ENV.API_HOST, async () => {
    console.log(`=======================================================`);
    console.log(` Wholesale / Ghalla Mandi ERP Local API Server Started`);
    console.log(` Listening on: http://${ENV.API_HOST}:${ENV.PORT}`);
    console.log(` Environment:  ${ENV.NODE_ENV}`);
    console.log(`=======================================================`);
    await checkDatabaseConnection();
    startSyncWorker();
  });
}

export { app };
