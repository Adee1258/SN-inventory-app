import React, { useState, useEffect } from 'react';
import { Sidebar, type NavModule } from './components/layout/Sidebar.js';
import { Header } from './components/layout/Header.js';
import { LoginModal } from './components/auth/LoginModal.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { RawMaterialPage } from './pages/RawMaterialPage.js';
import { PurchasePage } from './pages/PurchasePage.js';
import { SalePage } from './pages/SalePage.js';
import { InventoryPage } from './pages/InventoryPage.js';
import { PartiesPage } from './pages/PartiesPage.js';
import { CommissionPage } from './pages/CommissionPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { VouchersPage } from './pages/VouchersPage.js';
import { LedgerPage } from './pages/LedgerPage.js';
import { EmployeesPage } from './pages/EmployeesPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { getApiBaseUrl } from './api/client.js';

export function App() {
  const [activeModule, setActiveModule] = useState<NavModule>('dashboard');
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('erp_token'));
  const [username, setUsername] = useState<string>(localStorage.getItem('erp_user') || 'Admin');
  const [isDbConnected, setIsDbConnected] = useState(true);

  const checkHealth = async () => {
    try {
      const baseUrl = getApiBaseUrl();
      const rootUrl = baseUrl.replace(/\/api\/v1\/?$/, '');
      const healthUrl = `${rootUrl}/health`;
      const res = await fetch(healthUrl);
      const data = await res.json();
      setIsDbConnected(Boolean(data.databaseConnected || data.status === 'OK'));
    } catch {
      setIsDbConnected(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);

    const onAuthExpired = () => {
      setAuthToken(null);
    };
    window.addEventListener('erp_auth_expired', onAuthExpired);

    const onUserUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setUsername(customEvent.detail);
      } else {
        setUsername(localStorage.getItem('erp_user') || 'Admin');
      }
    };
    window.addEventListener('erp_user_updated', onUserUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('erp_auth_expired', onAuthExpired);
      window.removeEventListener('erp_user_updated', onUserUpdated);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    setAuthToken(null);
  };

  const handleLoginSuccess = (token: string, user: string) => {
    setAuthToken(token);
    setUsername(user);
  };

  const getModuleTitle = () => {
    switch (activeModule) {
      case 'dashboard':
        return 'Overview Dashboard';
      case 'raw_material':
        return 'Raw Material / Opening Inventory';
      case 'purchase':
        return 'Purchase Management (Own Stock)';
      case 'sale':
        return 'Sale Counter (Common Wholesale)';
      case 'inventory':
        return 'Central Inventory & FIFO Batches';
      case 'customers':
        return 'Customer Master & Statements';
      case 'suppliers':
        return 'Supplier Master & Payables';
      case 'commission':
        return 'Commission & Consignment Management';
      case 'accounts':
        return 'General Ledger & Statements';
      case 'vouchers':
        return 'Receipts & Payments';
      case 'ledger':
        return 'General & Product Ledger (Khaata Book)';
      case 'employees':
        return 'Employees Registry';
      case 'reports':
        return 'Reports Center';
      case 'settings':
        return 'System & Unit Settings';
      default:
        return 'Wholesale ERP';
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100 text-gray-800 font-sans">
      {/* Owner Login Modal when unauthenticated */}
      {!authToken && <LoginModal onSuccess={handleLoginSuccess} />}

      {/* Professional Sidebar */}
      <Sidebar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        businessName="SN Inventory ERP"
        ownerName={username}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title={getModuleTitle()}
          isDbConnected={isDbConnected}
          cloudSyncEnabled={false}
          username={username}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-hidden flex flex-col bg-gray-100">
          {activeModule === 'dashboard' && <DashboardPage />}
          {activeModule === 'raw_material' && <RawMaterialPage />}
          {activeModule === 'purchase' && <PurchasePage />}
          {activeModule === 'sale' && <SalePage />}
          {activeModule === 'inventory' && <InventoryPage />}
          {activeModule === 'customers' && <PartiesPage type="customers" />}
          {activeModule === 'suppliers' && <PartiesPage type="suppliers" />}
          {activeModule === 'commission' && <CommissionPage />}
          {activeModule === 'accounts' && <AccountsPage />}
          {activeModule === 'vouchers' && <VouchersPage />}
          {activeModule === 'ledger' && <LedgerPage />}
          {activeModule === 'employees' && <EmployeesPage />}
          {activeModule === 'reports' && <ReportsPage />}
          {activeModule === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
export default App;
