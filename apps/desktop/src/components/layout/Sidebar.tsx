import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Receipt,
  Warehouse,
  Users,
  Truck,
  Percent,
  BookOpen,
  CreditCard,
  UserCheck,
  FileSpreadsheet,
  Settings,
  ChevronRight,
  BookMarked,
} from 'lucide-react';
import snLogo from '../../assets/SN.jpeg';

export type NavModule =
  | 'dashboard'
  | 'raw_material'
  | 'purchase'
  | 'sale'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'commission'
  | 'accounts'
  | 'vouchers'
  | 'ledger'
  | 'employees'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  pendingSyncCount?: number;
  businessName?: string;
  ownerName?: string;
}

interface NavItem {
  id: NavModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  // MAIN
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'MAIN' },
  { id: 'sale', label: 'Sales', icon: Receipt, group: 'MAIN', badge: 'FIFO' },
  { id: 'purchase', label: 'Purchases', icon: ShoppingCart, group: 'MAIN' },
  { id: 'inventory', label: 'Inventory', icon: Warehouse, group: 'MAIN' },
  { id: 'raw_material', label: 'Raw Material / Stock', icon: Boxes, group: 'MAIN' },
  // MANAGEMENT
  { id: 'customers', label: 'Customers', icon: Users, group: 'MANAGEMENT' },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, group: 'MANAGEMENT' },
  { id: 'commission', label: 'Commission', icon: Percent, group: 'MANAGEMENT' },
  { id: 'employees', label: 'Employees', icon: UserCheck, group: 'MANAGEMENT' },
  // FINANCIAL
  { id: 'accounts', label: 'Accounts', icon: BookOpen, group: 'FINANCIAL' },
  { id: 'vouchers', label: 'Receipts / Payments', icon: CreditCard, group: 'FINANCIAL' },
  { id: 'ledger', label: 'Ledger (Khaata)', icon: BookMarked, group: 'FINANCIAL' },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet, group: 'FINANCIAL' },
  // SYSTEM
  { id: 'settings', label: 'Settings', icon: Settings, group: 'SYSTEM' },
];

const GROUP_LABELS: Record<string, string> = {
  MAIN: 'MAIN',
  MANAGEMENT: 'MANAGEMENT',
  FINANCIAL: 'FINANCIAL',
  SYSTEM: 'SYSTEM',
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  pendingSyncCount = 0,
  businessName = 'SN Inventory',
  ownerName = 'Owner',
}) => {
  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));

  return (
    <aside className="w-60 flex flex-col h-screen select-none bg-navy-900 border-r border-gray-200">

      {/* ── Brand Header ── */}
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 shadow-glow-green">
            <img src={snLogo} alt="SN Logo" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm text-white truncate leading-tight">{businessName}</h1>
            <span className="text-[10px] text-brand-400 font-medium tracking-wide uppercase">
              Inventory System
            </span>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groups.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group);
          return (
            <div key={group}>
              <div className="px-2 mb-1">
                <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">
                  {GROUP_LABELS[group]}
                </span>
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectModule(item.id as NavModule)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group ${isActive
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/60'
                        : 'text-gray-500 hover:text-white hover:bg-navy-700/70'
                        }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-700'
                            }`}
                        />
                        <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase tracking-wide ${isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-navy-800 text-brand-400 border border-navy-600'
                              }`}
                          >
                            {item.badge}
                          </span>
                        )}
                        {isActive && <ChevronRight className="w-3 h-3 text-white/70" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Owner Footer ── */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
            <img src={snLogo} alt="SN Logo" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800 truncate">{businessName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              <span className="text-[10px] text-gray-400">
                {pendingSyncCount > 0 ? `${pendingSyncCount} pending sync` : 'Live • Local Server'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
