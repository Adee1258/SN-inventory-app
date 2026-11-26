import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

function isLocalServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4000/health', { timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startLocalServer(): Promise<void> {
  if (await isLocalServerRunning()) {
    return;
  }

  const bundlePath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'bundle.js')
    : path.resolve(__dirname, '../../server/dist/bundle.js');

  if (!fs.existsSync(bundlePath)) {
    console.warn('Local server bundle not found at:', bundlePath);
    return;
  }

  const serverCwd = path.dirname(bundlePath);
  serverProcess = spawn(process.execPath, [bundlePath], {
    cwd: serverCwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: '4000',
      API_HOST: '127.0.0.1',
      DATABASE_URL:
        process.env.LOCAL_DATABASE_URL ||
        'mysql://root:Chadeel%40128@127.0.0.1:3306/wholesale_erp',
      JWT_SECRET:
        process.env.JWT_SECRET ||
        'sn-inventory-erp-super-secret-key-change-this-now-2024',
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
      MASTER_PIN: process.env.MASTER_PIN || '1234',
    },
    stdio: 'pipe',
    windowsHide: true,
  });

  serverProcess.stdout?.on('data', (d) => console.log('[LocalServer]', d.toString().trim()));
  serverProcess.stderr?.on('data', (d) => console.error('[LocalServer]', d.toString().trim()));
  serverProcess.on('exit', (code) => {
    console.log('[LocalServer] exited with code:', code);
    serverProcess = null;
  });

  // Wait for local server to be ready before opening window (avoids ERR_CONNECTION_REFUSED on startup)
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && serverProcess) {
    if (await isLocalServerRunning()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

function stopLocalServer(): void {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'Wholesale / Ghalla Mandi ERP - Windows Desktop Edition',
    webPreferences: {
      preload: path.join(__dirname, 'preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  const devUrl = 'http://localhost:5173';
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await startLocalServer();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('will-quit', () => {
  stopLocalServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopLocalServer();
    app.quit();
  }
});

// IPC Handler for Printing / System info
ipcMain.handle('print-invoice', async (_event, options) => {
  if (!mainWindow) return false;
  return new Promise((resolve) => {
    mainWindow!.webContents.print({ silent: false, printBackground: true, ...options }, (success, failureReason) => {
      if (!success) console.error('Print failed:', failureReason);
      resolve(success);
    });
  });
});
