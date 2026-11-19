# Installation & Setup Guide

**SN Inventory ERP — Wholesale / Ghalla Mandi**

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ LTS | Download from nodejs.org |
| npm | 10+ | Comes with Node.js |
| MySQL | 8.0+ Community | See Section 2 below |
| Windows | 10 / 11 | 64-bit required |

---

## 1. Project Installation

```powershell
# 1. Clone or unzip the project
cd "C:\Users\DELL\OneDrive\Desktop\SN-Inventory-app"

# 2. Install all workspace packages (skips Electron binary download)
$env:ELECTRON_SKIP_BINARY_DOWNLOAD=1
npm install

# 3. Confirm business-rules tests pass
npx vitest run
# Expected: 10 passed (10)

# 4. Confirm server TypeScript compiles cleanly
npx tsc -b apps/server
# Expected: exit 0, no output

# 5. Confirm frontend builds
npm run build --workspace=@erp/desktop
# Expected: ✓ 1521 modules transformed
```

---

## 2. MySQL 8 Installation (Windows)

### 2.1 Download MySQL Installer

1. Open browser → go to: **https://dev.mysql.com/downloads/installer/**
2. Download **"MySQL Installer for Windows"** (the full 400MB version, not web-installer)
3. Run the installer as Administrator

### 2.2 Installer Steps

1. **Setup Type:** Choose **"Server only"** (or "Custom" if you want MySQL Workbench too)
2. **Config Type:** Select **"Development Computer"**
3. **Port:** Leave as **3306** (default)
4. **Root Password:** Set a strong password — write it down!
   - Example: `SN@Inventory2024!`
   - You will put this in `.env` file
5. **Windows Service:** Keep **"Start MySQL Server at System Startup"** checked
6. **Apply Configuration** → Finish

### 2.3 Verify MySQL is Running

Open PowerShell and run:

```powershell
# Check if MySQL service is running
Get-Service -Name "MySQL*"
# Expected: Status = Running

# Optional: Connect to test
mysql -u root -p
# Enter your root password when prompted
# You should see: mysql>
```

---

## 3. Configure Environment Variables

```powershell
# Copy the template (already done if .env exists)
Copy-Item ".env.example" ".env"
```

Open `.env` in Notepad and update these values:

```env
# Replace 'password' with your actual MySQL root password
DATABASE_URL="mysql://root:YourActualPassword@localhost:3306/wholesale_erp"

# Generate a random JWT secret (at least 32 characters)
JWT_SECRET="replace-with-long-random-string-here-minimum-32-chars"

# Set your preferred 4-digit PIN for quick actions
MASTER_PIN="1234"
```

> **Security Note:** Never commit `.env` to git. It is listed in `.gitignore`.

---

## 4. Create the Database

```powershell
# Connect to MySQL
mysql -u root -p

# Run this SQL (copy-paste into the mysql> prompt):
CREATE DATABASE wholesale_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW DATABASES;
EXIT;
```

Expected output includes: `wholesale_erp` in the list.

---

## 5. Run Database Migrations

```powershell
# From the project root
npx prisma migrate dev --schema=./prisma/schema.prisma --name init
```

Expected output:
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": MySQL 8.x at "localhost:3306"

Applying migration `20241117000000_init`...
Database migrations applied.

✔ Generated Prisma Client
```

> **If migration fails:** Confirm MySQL is running (`Get-Service MySQL*`) and `.env` DATABASE_URL is correct.

---

## 6. Seed Initial Data

```powershell
npx tsx ./prisma/seed.ts
```

This creates:
- ✅ Business profile (SN Inventory)
- ✅ Owner login: **admin** / **Password123!** (PIN: 1234)
- ✅ Units: KG (base), Mann (40 KG), Bag (item-specific)
- ✅ Item categories: Spices, Grains
- ✅ 4 commodity items:
  - Red Chilli (38 KG/bag)
  - Coriander (40 KG/bag)
  - Turmeric (50 KG/bag)
  - Cumin (50 KG/bag)
- ✅ Chart of Accounts (15 accounts: 1010–5040)
- ✅ Cash and Bank accounts
- ✅ Document sequences (INV-, PUR-, JV-, etc.)

Expected final line: `Seed completed successfully.`

---

## 7. Start the Application

### 7a. Start the Backend API Server

```powershell
# Terminal 1 — Start the backend
npm run dev --workspace=@erp/server
# Expected: Server running on http://0.0.0.0:4000
```

### 7b. Verify the Server is Healthy

```powershell
# Terminal 2 — Health check
Invoke-WebRequest -Uri "http://localhost:4000/health" | Select-Object -ExpandProperty Content
```

Expected response:
```json
{"status":"OK","databaseConnected":true,"version":"1.0.0"}
```

### 7c. Test Login

```powershell
$body = '{"username":"admin","password":"Password123!"}'
Invoke-WebRequest -Uri "http://localhost:4000/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body | Select-Object -ExpandProperty Content
```

Expected response (truncated):
```json
{"success":true,"data":{"token":"eyJ...","username":"admin","businessName":"SN Inventory"}}
```

### 7d. Start the Frontend Dev Server

```powershell
# Terminal 2 (or 3)
npm run dev --workspace=@erp/desktop
# Opens at http://localhost:5173
```

Open browser at **http://localhost:5173**

---

## 8. LAN Setup (Other Computers)

To connect other computers in your shop to the main server:

### 8a. Find the Main Computer's LAN IP

```powershell
# On the main computer (server)
ipconfig
# Note the IPv4 Address — e.g., 192.168.1.5
```

### 8b. Configure LAN Clients

On each client computer's browser or Electron app, point the API URL to:

```
http://192.168.1.5:4000/api/v1
```

The main computer's Windows Firewall must allow inbound connections on port 4000:

```powershell
# Run as Administrator on the main computer
New-NetFirewallRule -DisplayName "ERP Server Port 4000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 4000 `
  -Action Allow
```

### 8c. Register LAN Devices

Each LAN device must register to get a device token:

```powershell
$body = '{"deviceName":"Counter PC","deviceType":"DESKTOP"}'
Invoke-WebRequest -Uri "http://192.168.1.5:4000/api/v1/auth/register-device" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body | Select-Object -ExpandProperty Content
```

---

## 9. Project Structure

```
SN-Inventory-app/
├── apps/
│   ├── server/              # Node.js + Express + TypeScript API
│   │   └── src/
│   │       ├── modules/     # Feature modules (auth, sales, purchases, etc.)
│   │       ├── accounting/  # Double-entry posting engine
│   │       ├── middleware/  # Auth, error handling
│   │       └── index.ts     # App entry point
│   └── desktop/             # Electron + React + TypeScript frontend
│       ├── electron/        # Electron main process
│       ├── preload/         # Context bridge
│       └── src/             # React application
│           ├── components/  # Shared UI components
│           ├── pages/       # 13 module pages
│           └── api/         # API client
├── packages/
│   ├── business-rules/      # FIFO, commission, unit conversion, journal validation
│   ├── shared-types/        # TypeScript types shared across packages
│   └── validation/          # Zod schemas for all API inputs
├── prisma/
│   ├── schema.prisma        # 48-table MySQL schema
│   └── seed.ts              # Initial data seeding
├── docs/                    # Documentation
├── .env                     # Local config (not in git)
├── .env.example             # Config template
└── package.json             # Workspace root
```

---

## 10. Running Tests

```powershell
# All business logic unit tests
npx vitest run --reporter=verbose

# Expected output:
# ✓ Unit Conversion Engine > converts Mann to KG accurately
# ✓ Unit Conversion Engine > converts item-specific bag weights
# ✓ Unit Conversion Engine > throws on negative quantity
# ✓ FIFO Stock Allocator > implements mandatory FIFO allocation
# ✓ FIFO Stock Allocator > strictly prevents overselling
# ✓ FIFO Stock Allocator > allocates consignment batches separately
# ✓ Commission Calculator > calculates gross, commission and supplier payable
# ✓ Commission Calculator > respects item-specific override
# ✓ Accounting Validator > validates balanced journal entries
# ✓ Accounting Validator > rejects unbalanced journal entries
# Test Files  1 passed (1) | Tests  10 passed (10)
```

---

## 11. Default Login Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `Password123!` |
| PIN | `1234` |

> **Change the password** after first login through Settings → Security.

---

## 12. Troubleshooting

### "Cannot connect to database"
1. Check MySQL service: `Get-Service -Name "MySQL*"`
2. Verify `.env` DATABASE_URL password is correct
3. Confirm database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### "Port 4000 already in use"
```powershell
# Find what is using port 4000
netstat -ano | findstr :4000
# Kill the process by PID (replace 1234 with actual PID)
Stop-Process -Id 1234 -Force
```

### "Prisma Client not generated"
```powershell
npx prisma generate --schema=./prisma/schema.prisma
```

### "npm install fails with EPERM"
Run PowerShell as Administrator, or:
```powershell
npm cache clean --force
npm install
```

### Vite CJS deprecation warning
This is a harmless warning from Vite's Node API. The build output is correct.
It will be resolved in a future Vite version.

---

## 13. Production Deployment (Future)

For production Windows EXE packaging:

```powershell
# Install electron-builder (future step)
npm install --save-dev electron-builder

# Build production EXE
npm run build --workspace=@erp/desktop
npx electron-builder --win
```

This creates a Windows installer in `apps/desktop/release/`.
