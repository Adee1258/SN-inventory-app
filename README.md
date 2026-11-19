# SN Inventory ERP — Professional Wholesale & Ghalla Mandi ERP

> **Windows Desktop Application** | **Electron** | **React** | **Node.js** | **MySQL 8** | **LAN + Cloud**

A production-grade, double-entry accounting and commodity inventory desktop ERP designed specifically for wholesale agricultural commodity trading and Ghalla Mandi businesses dealing in **Red Chilli, Coriander, Turmeric, Cumin, Grains, and Spices**.

---

## 🌟 Key Business Capabilities & Non-Negotiable Rules

1. **Dual Stock Ownership (Own vs. Consignment)**
   - **Own Stock:** Physical inventory recognized as the shop's balance-sheet asset (`1040`), purchased from suppliers (`2010 AP`), generating sales revenue (`4010`) and cost of goods sold (`5010 COGS`) via mandatory FIFO.
   - **Consignment / Commission Stock:** Physical goods held on behalf of growers/suppliers with **zero shop asset recognition**. Sales generate commission income (`4020`) and supplier consignment payable (`2020`). Consignment goods are **never** counted towards own inventory asset or COGS.
2. **Deterministic FIFO Costing**
   - Strictly First-In, First-Out (FIFO) stock allocation and valuation. Average costing and LIFO are prohibited by design.
   - Negative stock is blocked at both database and business logic levels (`INSUFFICIENT_STOCK`).
3. **Strict Percentage-Based Commission**
   - Configurable supplier-wise and supplier+item-specific override agreements.
   - Commission rate snapshot saved immutably on each sale line item upon posting.
4. **Item-Specific Unit Conversions**
   - Commodities are measured in **Mann, KG, and Bags**.
   - Because 1 Bag of Red Chilli (~38 KG) ≠ 1 Bag of Turmeric (~50 KG), bag weights are configurable per commodity item rather than globally hardcoded.
   - Conversion multipliers are snapshotted on transactions so changing future conversions never alters historical invoices.
5. **Centralized Double-Entry Accounting Engine**
   - Every posting (Opening stock, purchases, sales, returns, payments, settlements) creates balanced debits and credits validated before insertion.
   - Dedicated Chart of Accounts (`1010` to `5040`).
6. **Single Owner Security Model**
   - Single owner authentication with Argon2id password hashing and quick 4-digit PIN verification.
   - LAN client devices connect via device registration and cryptographically signed tokens.
7. **Transactional Outbox Sync (LAN + Cloud)**
   - Local shop computer acts as the central server for all shop terminals.
   - Outbox pattern queues state changes for background cloud synchronization.

---

## 📁 Repository Structure

```
SN-Inventory-app/
├── apps/
│   ├── server/                   # Node.js + Express + TypeScript Backend API
│   │   ├── src/
│   │   │   ├── accounting/       # Double-entry posting engine
│   │   │   ├── database/         # Prisma client & connection manager
│   │   │   ├── middleware/       # Auth, audit logging, error handling
│   │   │   ├── modules/          # Feature domains:
│   │   │   │   ├── auth/         # Owner login, PIN, device registration
│   │   │   │   ├── items/        # Commodity items, categories, unit conversions
│   │   │   │   ├── parties/      # Customers, suppliers, ledgers
│   │   │   │   ├── opening-stock/# Raw material / shop opening inventory
│   │   │   │   ├── inventory/    # FIFO batches, stock movements & valuation
│   │   │   │   ├── purchases/    # Own-stock purchase invoices & purchase returns
│   │   │   │   ├── commission/   # Agreements, consignment receipts, returns, advances, settlements
│   │   │   │   ├── sales/        # Common sales invoices & sales returns
│   │   │   │   ├── accounting/   # Trial balance, P&L, balance sheet, journals
│   │   │   │   ├── vouchers/     # Receipt & payment vouchers
│   │   │   │   └── dashboard/    # Live real-time KPIs & metrics
│   │   │   ├── sync/             # Background transactional outbox sync worker
│   │   │   └── index.ts          # Express application entrypoint
│   │   └── package.json
│   │
│   └── desktop/                  # Electron + React + TypeScript Desktop Client
│       ├── electron/             # Electron main process (window lifecycle, IPC)
│       ├── preload/              # Secure contextBridge preload script
│       ├── src/                  # React 18 UI with Tailwind CSS & Lucide icons
│       │   ├── api/              # Strongly typed API client
│       │   ├── components/       # Header, Sidebar (13 modules), LoginModal
│       │   ├── pages/            # Dashboard, Purchases, Sales, Inventory, Ledgers, etc.
│       │   └── App.tsx           # Router, auth gating, status monitoring
│       └── package.json
│
├── packages/
│   ├── business-rules/           # Pure, deterministic domain calculation engines
│   │   ├── src/
│   │   │   ├── decimal-utils.ts  # 28-precision Decimal.js financial utilities
│   │   │   ├── unit-conversion.ts# Mann, Bag, KG conversion with snapshots
│   │   │   ├── fifo-allocator.ts # Strict FIFO batch allocation & negative stock prevention
│   │   │   ├── commission-calculator.ts # Percentage hierarchy & split calculation
│   │   │   └── accounting-validator.ts  # Balanced journal validation
│   │   └── test/                 # 10 unit tests covering all rules
│   │
│   ├── shared-types/             # Cross-package TypeScript interfaces & enums
│   └── validation/               # Zod schemas for all API payloads
│
├── prisma/
│   ├── schema.prisma             # 48-table relational schema with MySQL 8 mappings
│   └── seed.ts                   # Initial seed (Owner auth, default commodities, COA)
│
├── docs/
│   ├── architecture-blueprint.md # Comprehensive 19-section architectural specification
│   └── installation.md           # Step-by-step Windows & MySQL installation guide
│
├── .env.example                  # Environment variable template
├── package.json                  # Workspace root
└── tsconfig.base.json            # Shared TypeScript configuration
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: `v20.x` or higher
- **MySQL**: Community Server `8.0+`
- **Windows**: 10 or 11 (64-bit)

### 2. Install Dependencies
```powershell
# Set skip binary download if offline or restricted network
$env:ELECTRON_SKIP_BINARY_DOWNLOAD=1
npm install
```

### 3. Setup Database & Environment
1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item ".env.example" ".env"
   ```
2. Create the database in MySQL:
   ```sql
   CREATE DATABASE wholesale_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Run migrations and seed data:
   ```powershell
   npx prisma migrate dev --schema=./prisma/schema.prisma --name init
   npx tsx ./prisma/seed.ts
   ```

### 4. Run Business Logic Tests
```powershell
npx vitest run --reporter=verbose
```
*Expected: 10/10 tests pass covering FIFO costing, bag weight variance, consignment isolation, commission calculations, and journal balancing.*

### 5. Start Development Environment
```powershell
# Run both backend server (port 4000) and desktop renderer (port 5173) concurrently:
npm run dev
```

---

## 🔑 Default Credentials

- **Username**: `admin`
- **Password**: `Password123!`
- **Quick PIN**: `1234`

---

## 📚 Complete Documentation

- For in-depth architectural details, see [docs/architecture-blueprint.md](file:///c:/Users/DELL/OneDrive/Desktop/SN-Inventory-app/docs/architecture-blueprint.md).
- For detailed MySQL Windows setup and LAN configuration, see [docs/installation.md](file:///c:/Users/DELL/OneDrive/Desktop/SN-Inventory-app/docs/installation.md).
