export interface ElectronAPI {
  printInvoice: (options?: unknown) => Promise<boolean>;
  getAppVersion: () => string;
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
