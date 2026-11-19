import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  printInvoice: (options?: unknown) => Promise<boolean>;
  getAppVersion: () => string;
  platform: string;
}

const api: ElectronAPI = {
  printInvoice: (options) => ipcRenderer.invoke('print-invoice', options),
  getAppVersion: () => '1.0.0',
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', api);
