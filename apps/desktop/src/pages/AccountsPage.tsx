import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  FileText,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  Landmark,
  BookMarked,
  Scale,
  Wallet,
  Calendar,
  RefreshCw,
  ChevronRight,
  Search,
  Download,
  Printer,
  Trash2,
  Plus,
  Copy,
  Check,
  Edit2,
  X,
  Info,
  Sparkles,
  ShieldAlert,
  Layers,
  Wrench,
  CheckCircle,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { api } from '../api/client.js';
import { exportToCsv, printDocument } from '../utils/exportUtils.js';
import { ConfirmModal, type ConfirmDialogState } from '../components/common/ConfirmModal.js';

/* ─── Types ─── */
interface TrialBalanceAccount {
  accountId: number | string;
  accountCode: string;
  accountName: string;
  category: string;
  totalDebit: string;
  totalCredit: string;
  netDebit: string;
  netCredit: string;
  netNormalBalance?: string;
  rawNormalBalance?: number;
}

interface TrialBalanceData {
  isBalanced: boolean;
  totalDebit: string;
  totalCredit: string;
  difference: string;
  accounts: TrialBalanceAccount[];
}

interface ProfitAndLossData {
  ownSalesRevenue: string;
  costOfGoodsSold: string;
  grossTradingProfit: string;
  commissionIncome: string;
  operatingExpenses: string;
  netProfit: string;
}

interface BalanceSheetData {
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  assets: { name: string; balance: string }[];
  liabilities: { name: string; balance: string }[];
  equity: { name: string; balance: string }[];
}

interface ChartAccount {
  id: number | string;
  accountCode: string;
  accountName: string;
  category: string;
  parentCategory?: string;
  parentId?: number | string | null;
  parent?: { id: number | string; accountCode: string; accountName: string } | null;
  isSystem?: boolean;
  isActive?: boolean;
  totalDebit?: string;
  totalCredit?: string;
  balance?: string;
  rawBalance?: number;
  transactionCount?: number;
  hasChildren?: boolean;
}

interface VoucherItem {
  id: number | string;
  voucherNumber: string;
  voucherDate: string;
  amount: string | number;
  partyType?: string;
  partyId?: number | string;
  narration: string;
  referenceNumber?: string;
  cashBankAccount?: { id: number; accountName: string; accountType: string };
}

type ActiveModule =
  | null
  | 'cash_book'
  | 'journal_voucher'
  | 'trial_balance'
  | 'profit_loss'
  | 'balance_sheet'
  | 'chart_of_accounts';

interface AccountModule {
  id: ActiveModule;
  label: string;
  urduLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  description: string;
}

const ACCOUNT_TYPE_CONFIG: Record<
  string,
  {
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    label: string;
    englishName: string;
    romanName: string;
    parents: string[];
    suggestions: string[];
  }
> = {
  ASSET: {
    type: 'ASSET',
    label: 'Assets (Asasay)',
    englishName: 'Assets',
    romanName: 'Asasay',
    parents: ['Current Assets', 'Fixed Assets', 'Other Non-Current Assets'],
    suggestions: [
      'Cash in Shop Till (Galla)',
      'Main Bank Current Account',
      'Secondary Bank Account',
      'Petty Cash (Munshi Till)',
      'Customer Accounts Receivable',
      'Mandi Commission & Brokerage Receivable',
      'Own Inventory Asset (Trading Stock)',
      'Bardana & Packaging Stock (Bora / Bags)',
      'Supplier Crop Advances (Zamindar Peshi)',
      'Staff & Employee Advances',
      'Mandi Shop & Godown Property',
      'Vehicles & Loading Pickups (Shahzore / Suzuki)',
      'Weighbridge & Digital Kanda',
      'Shop Furniture, Computers & Safe',
    ],
  },
  LIABILITY: {
    type: 'LIABILITY',
    label: 'Liabilities (Wajib-ul-Ada / Dena)',
    englishName: 'Liabilities',
    romanName: 'Dena / Wajib-ul-Ada',
    parents: ['Current Liabilities', 'Long-Term Liabilities'],
    suggestions: [
      'Accounts Payable: Own Stock Suppliers',
      'Commission Supplier Payable (Consignment)',
      'Customer Advances Received',
      'Bardana / Bag Security Deposits',
      'Accrued Labour & Palladari Payable',
      'Mandi Market Committee Cess Payable',
      'Bank Loans & Running Finance',
      'Informal Loans (Qarz-e-Hasna)',
    ],
  },
  INCOME: {
    type: 'INCOME',
    label: 'Revenue (Aamdani)',
    englishName: 'Revenue',
    romanName: 'Aamdani',
    parents: ['Operating Revenue', 'Mandi Service Fees & Other Income'],
    suggestions: [
      'Own Stock Sales Revenue',
      'Consignment Commission Income',
      'Tulai & Weighing Charges Income',
      'Dami & Brokerage Income',
      'Bardana Profit / Rental Income',
      'Discounts Received from Suppliers',
      'Miscellaneous Scrap & Mandi Income',
    ],
  },
  EQUITY: {
    type: 'EQUITY',
    label: 'Capital (Sarmaya)',
    englishName: 'Capital',
    romanName: 'Sarmaya',
    parents: ["Owner's Equity", 'Drawings & Retained Earnings'],
    suggestions: [
      'Owner Capital',
      'Opening Balance Clearing Equity',
      'Owner Drawings (Zaati Kharch)',
      'Retained Earnings / Prior Years Profit',
    ],
  },
  EXPENSE: {
    type: 'EXPENSE',
    label: 'Expenses (Kharchay)',
    englishName: 'Expenses',
    romanName: 'Kharchay',
    parents: ['Direct Costs & Labour', 'Operating & Administrative Expenses'],
    suggestions: [
      'Cost of Goods Sold (FIFO)',
      'Shop Labour & Loading/Unloading (Palladari)',
      'Mandi Transport & Freight Expense',
      'Cleaning, Sieving & Packing Charges',
      'Market Committee Cess / Mandi Tax',
      'Shop & Godown Rent',
      'Electricity, Gas & Water Utilities',
      'Staff Salaries & Munshi Allowance',
      'Tea, Meals & Guest Hospitality (Chai Pani)',
      'Mobile, Telephone & Internet Bills',
      'Printing, Stationery & Ledger Books',
      'Shop Repairs, Maintenance & Cleaning',
      'Bank Charges & Online Transfer Fees',
      'Bad Debts & Uncollectible Khata',
      'Depreciation Expense',
    ],
  },
};

const ACCOUNT_MODULES: AccountModule[] = [
  { id: 'cash_book', label: 'Cash Book', urduLabel: 'Raqam Ki Aamad o Raft', icon: Wallet, bgClass: 'from-emerald-600 to-teal-700', description: 'Cash in / Cash out register' },
  { id: 'journal_voucher', label: 'Journal Entries (JV)', urduLabel: 'Roznamcha & Adjustments', icon: FileText, bgClass: 'from-slate-700 to-slate-800', description: 'Double entry transactions & New JV' },
  { id: 'trial_balance', label: 'Trial Balance (TB)', urduLabel: 'Debit = Credit Check', icon: Scale, bgClass: 'from-gray-700 to-gray-800', description: 'Zero variance accounting verification' },
  { id: 'profit_loss', label: 'Profit & Loss', urduLabel: 'Nafa Nuqsan Ka Hisaab', icon: TrendingUp, bgClass: 'from-brand-600 to-emerald-700', description: 'Trading margin + Commission - Expenses' },
  { id: 'balance_sheet', label: 'Balance Sheet', urduLabel: 'Assets vs Liabilities', icon: BarChart3, bgClass: 'from-brand-700 to-teal-800', description: 'Financial standing' },
  { id: 'chart_of_accounts', label: 'Chart of Accounts', urduLabel: 'Tamam Khatay (GL)', icon: BookMarked, bgClass: 'from-green-600 to-green-700', description: 'Master chart of accounts' },
];

const fmt = (v: number | string | undefined | null) => {
  const n = parseFloat(String(v || 0));
  return isNaN(n) ? '0.00' : n.toFixed(2);
};

export const AccountsPage: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ActiveModule>('cash_book');
  // Business Stream Filter: Own Trading vs Commission Agency vs Consolidated
  const [businessSegment, setBusinessSegment] = useState<'ALL' | 'OWN' | 'CONSIGNMENT'>('ALL');
  const [tb, setTb] = useState<TrialBalanceData | null>(null);
  const [pnl, setPnl] = useState<ProfitAndLossData | null>(null);
  const [bs, setBs] = useState<BalanceSheetData | null>(null);
  const [journals, setJournals] = useState<any[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [receipts, setReceipts] = useState<VoucherItem[]>([]);
  const [payments, setPayments] = useState<VoucherItem[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  // ─── Trial Balance State ───
  const [tbAsOfDate, setTbAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [tbChecking, setTbChecking] = useState(false);
  const [tbRepairing, setTbRepairing] = useState(false);
  const [tbCheckStatus, setTbCheckStatus] = useState<{ checked: boolean; isBalanced: boolean; message: string } | null>(null);
  const [showZeroBalanceAccounts, setShowZeroBalanceAccounts] = useState(false);

  // ─── Journal Voucher (JV / Roznamcha) State ───
  const [jvDate, setJvDate] = useState(new Date().toISOString().split('T')[0]);
  const [jvNarration, setJvNarration] = useState('');
  const [jvLines, setJvLines] = useState<
    { id: string; accountCode: string; type: 'DEBIT' | 'CREDIT'; amount: string }[]
  >([
    { id: '1', accountCode: '', type: 'DEBIT', amount: '' },
    { id: '2', accountCode: '', type: 'CREDIT', amount: '' },
  ]);
  const [jvActionLoading, setJvActionLoading] = useState(false);
  const [jvNotice, setJvNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ─── Day-End Rokar (Galla Closing) State ───
  const [showRokarModal, setShowRokarModal] = useState(false);
  const [rokarDate, setRokarDate] = useState(new Date().toISOString().split('T')[0]);
  const [physicalCashCounted, setPhysicalCashCounted] = useState<string>('');

  // ─── General Ledger Drill-Down State ───
  const [drilldownAccount, setDrilldownAccount] = useState<{
    code: string;
    name: string;
    category: string;
    loading: boolean;
    data: any | null;
  } | null>(null);

  // ─── Year-End Closing State ───
  const [showYearEndModal, setShowYearEndModal] = useState(false);
  const [closingDate, setClosingDate] = useState(new Date().toISOString().split('T')[0]);
  const [closingTargetCode, setClosingTargetCode] = useState<'3010' | '3040'>('3010');
  const [closingNotes, setClosingNotes] = useState('');
  const [closingLoading, setClosingLoading] = useState(false);
  const [closingNotice, setClosingNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ─── Chart of Accounts State ───
  const [showAddAccountForm, setShowAddAccountForm] = useState(true);
  const [coaCategoryFilter, setCoaCategoryFilter] = useState<string>('ALL');
  const [newAccType, setNewAccType] = useState<'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'>('ASSET');
  const [newAccParent, setNewAccParent] = useState<string>('Current Assets');
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccCode, setNewAccCode] = useState<string>('1060');
  const [newAccOpBal, setNewAccOpBal] = useState<string>('0.00');
  const [newAccOpType, setNewAccOpType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [copyCodeFeedback, setCopyCodeFeedback] = useState<string | null>(null);
  const [coaActionLoading, setCoaActionLoading] = useState(false);
  const [coaNotice, setCoaNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  /* Load all financial data */
  const loadData = async (targetSegment?: 'ALL' | 'OWN' | 'CONSIGNMENT' | unknown) => {
    setLoading(true);
    try {
      const activeSeg: 'ALL' | 'OWN' | 'CONSIGNMENT' =
        typeof targetSegment === 'string' && (targetSegment === 'ALL' || targetSegment === 'OWN' || targetSegment === 'CONSIGNMENT')
          ? targetSegment
          : businessSegment;
      const segQuery = activeSeg === 'ALL' ? '' : `segment=${activeSeg}`;
      const startQuery = dateFilter.start ? `startDate=${dateFilter.start}` : '';
      const endQuery = dateFilter.end ? `endDate=${dateFilter.end}` : '';
      const fullDateQuery = [segQuery, startQuery, endQuery].filter(Boolean).join('&');
      const bsDateQuery = [segQuery, endQuery].filter(Boolean).join('&');

      const [tbData, pnlData, bsData, jvData, chartData, rcData, pmData, suppData, custData, empData] =
        await Promise.all([
          api.get<TrialBalanceData>(`/accounting/trial-balance${fullDateQuery ? `?${fullDateQuery}` : ''}`).catch(() => null),
          api.get<ProfitAndLossData>(`/accounting/profit-and-loss${fullDateQuery ? `?${fullDateQuery}` : ''}`).catch(() => null),
          api.get<BalanceSheetData>(`/accounting/balance-sheet${bsDateQuery ? `?${bsDateQuery}` : ''}`).catch(() => null),
          api.get<any[]>(`/accounting/journal-entries?limit=150${fullDateQuery ? `&${fullDateQuery}` : ''}`).catch(() => []),
          api.get<ChartAccount[]>('/accounting/chart-of-accounts').catch(() => []),
          api.get<VoucherItem[]>('/vouchers/receipts').catch(() => []),
          api.get<VoucherItem[]>('/vouchers/payments').catch(() => []),
          api.get<any[]>('/parties/suppliers').catch(() => []),
          api.get<any[]>('/parties/customers').catch(() => []),
          api.get<any[]>('/parties/employees').catch(() => []),
        ]);

      setTb(tbData);
      setPnl(pnlData);
      setBs(bsData);
      setJournals(jvData || []);
      setChartAccounts(chartData || []);
      setReceipts(rcData || []);
      setPayments(pmData || []);
      setSuppliers(suppData || []);
      setCustomers(custData || []);
      setEmployees(empData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When user switches business segment or changes date range, re-fetch segment & date filtered financials
  useEffect(() => {
    let isCurrent = true;
    const fetchSegmentFinancials = async () => {
      setLoading(true);
      try {
        const segQuery = businessSegment === 'ALL' ? '' : `segment=${businessSegment}`;
        const startQuery = dateFilter.start ? `startDate=${dateFilter.start}` : '';
        const endQuery = dateFilter.end ? `endDate=${dateFilter.end}` : '';
        const fullDateQuery = [segQuery, startQuery, endQuery].filter(Boolean).join('&');
        const bsDateQuery = [segQuery, endQuery].filter(Boolean).join('&');

        const [tbData, pnlData, bsData, jvData] = await Promise.all([
          api.get<TrialBalanceData>(`/accounting/trial-balance${fullDateQuery ? `?${fullDateQuery}` : ''}`).catch(() => null),
          api.get<ProfitAndLossData>(`/accounting/profit-and-loss${fullDateQuery ? `?${fullDateQuery}` : ''}`).catch(() => null),
          api.get<BalanceSheetData>(`/accounting/balance-sheet${bsDateQuery ? `?${bsDateQuery}` : ''}`).catch(() => null),
          api.get<any[]>(`/accounting/journal-entries?limit=150${fullDateQuery ? `&${fullDateQuery}` : ''}`).catch(() => []),
        ]);

        if (isCurrent) {
          if (tbData) setTb(tbData);
          if (pnlData) setPnl(pnlData);
          if (bsData) setBs(bsData);
          if (jvData) setJournals(jvData);
        }
      } catch (err) {
        console.error('Error fetching segment financials:', err);
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    fetchSegmentFinancials();
    return () => {
      isCurrent = false;
    };
  }, [businessSegment, dateFilter.start, dateFilter.end]);

  const handleModuleClick = (mod: ActiveModule) => {
    setActiveModule(mod);
    setSearchQuery('');
  };

  // Helper to find party name
  const getPartyName = (partyType?: string, partyId?: number | string) => {
    if (!partyType || !partyId) return '—';
    if (partyType === 'CUSTOMER') {
      const c = customers.find((x) => String(x.id) === String(partyId));
      return c ? `${c.name} (Customer)` : `Customer #${partyId}`;
    }
    if (partyType === 'SUPPLIER') {
      const s = suppliers.find((x) => String(x.id) === String(partyId));
      return s ? `${s.name} (Supplier)` : `Supplier #${partyId}`;
    }
    if (partyType === 'EMPLOYEE') {
      const e = employees.find((x) => String(x.id) === String(partyId));
      return e ? `${e.name} (Staff)` : `Staff #${partyId}`;
    }
    return `${partyType} #${partyId}`;
  };

  // ─── Chart of Accounts Handlers ───
  const getNextAvailableCode = (type: string) => {
    const rangeMap: Record<string, { start: number; end: number }> = {
      ASSET: { start: 1000, end: 1999 },
      LIABILITY: { start: 2000, end: 2999 },
      EQUITY: { start: 3000, end: 3999 },
      INCOME: { start: 4000, end: 4999 },
      EXPENSE: { start: 5000, end: 5999 },
    };
    const range = rangeMap[type] || rangeMap.ASSET;
    let max = range.start;
    chartAccounts
      .filter((a) => a.category === type)
      .forEach((a) => {
        const n = parseInt(a.accountCode, 10);
        if (!isNaN(n) && n >= range.start && n <= range.end && n > max) {
          max = n;
        }
      });
    return (max + 10).toString();
  };

  const handleTypeChange = (t: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE') => {
    setNewAccType(t);
    const parents = ACCOUNT_TYPE_CONFIG[t]?.parents || [];
    setNewAccParent(parents[0] || 'General');
    const code = getNextAvailableCode(t);
    setNewAccCode(code);
    setNewAccOpType(t === 'ASSET' || t === 'EXPENSE' ? 'DEBIT' : 'CREDIT');
  };

  const handleCopyCode = (code: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
    }
    setCopyCodeFeedback(code);
    setTimeout(() => setCopyCodeFeedback(null), 2000);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccCode.trim() || !newAccName.trim()) {
      setCoaNotice({ type: 'error', text: 'Please enter account code and name.' });
      return;
    }

    setCoaActionLoading(true);
    setCoaNotice(null);
    try {
      const res: any = await api.post('/accounting/chart-of-accounts', {
        accountCode: newAccCode.trim(),
        accountName: newAccName.trim(),
        category: newAccType,
        parentCategory: newAccParent,
        openingBalance: parseFloat(newAccOpBal) || 0,
        openingBalanceType: newAccOpType,
      });

      setCoaNotice({
        type: 'success',
        text: res?.message || `Account ${newAccCode} - ${newAccName} created successfully!`,
      });
      setNewAccName('');
      setNewAccOpBal('0.00');
      // Set next code
      const nextCode = (parseInt(newAccCode, 10) + 10).toString();
      setNewAccCode(nextCode);
      await loadData();
    } catch (err: any) {
      setCoaNotice({ type: 'error', text: err?.message || 'Failed to create account.' });
    } finally {
      setCoaActionLoading(false);
    }
  };

  const handleDeleteAccount = async (acc: ChartAccount) => {
    if (acc.isSystem) {
      alert(`Account ${acc.accountCode} (${acc.accountName}) is a protected system account and cannot be deleted.`);
      return;
    }
    if ((acc.transactionCount ?? 0) > 0) {
      alert(`Cannot delete account ${acc.accountCode} (${acc.accountName}) because it has active transactions.`);
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Account',
      message: `Are you sure you want to delete account "${acc.accountCode} - ${acc.accountName}"?`,
      confirmLabel: 'Yes, Delete Account',
      isDestructive: true,
      onConfirm: async () => {
        setCoaActionLoading(true);
        try {
          await api.delete(`/accounting/chart-of-accounts/${acc.id}`);
          setCoaNotice({ type: 'success', text: `Account ${acc.accountCode} deleted successfully.` });
          await loadData();
        } catch (err: any) {
          setCoaNotice({ type: 'error', text: err?.message || 'Failed to delete account.' });
        } finally {
          setCoaActionLoading(false);
        }
      },
    });
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    setCoaActionLoading(true);
    try {
      await api.put(`/accounting/chart-of-accounts/${editingAccount.id}`, {
        accountName: editingAccount.accountName,
        isActive: editingAccount.isActive,
      });
      setCoaNotice({ type: 'success', text: `Account updated successfully!` });
      setEditingAccount(null);
      await loadData();
    } catch (err: any) {
      setCoaNotice({ type: 'error', text: err?.message || 'Failed to update account.' });
    } finally {
      setCoaActionLoading(false);
    }
  };

  const handleRegenerateCOA = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Synchronize Chart of Accounts',
      message: 'Do you want to regenerate and synchronize the complete Wholesale Mandi Chart of Accounts? This will add any missing standard accounts without affecting existing ones.',
      confirmLabel: 'Yes, Synchronize',
      isDestructive: false,
      onConfirm: async () => {
        setCoaActionLoading(true);
        try {
          const res: any = await api.post('/accounting/chart-of-accounts/regenerate', {});
          setCoaNotice({ type: 'success', text: res?.message || 'Chart of Accounts regenerated successfully!' });
          await loadData();
        } catch (err: any) {
          setCoaNotice({ type: 'error', text: err?.message || 'Failed to regenerate Chart of Accounts.' });
        } finally {
          setCoaActionLoading(false);
        }
      },
    });
  };

  /* ── Export CSV for active view ── */
  const handleExportCsv = () => {
    if (activeModule === 'cash_book') {
      const headers = ['Date', 'Type', 'Voucher #', 'Party', 'Account', 'Narration', 'Inflow (+)', 'Outflow (-)'];
      const rows = combinedCashBook.map((r) => [
        new Date(r.voucherDate).toLocaleDateString(),
        r.type,
        r.voucherNumber,
        getPartyName(r.partyType, r.partyId),
        r.cashBankAccount?.accountName || 'Cash',
        r.narration,
        r.type === 'RECEIPT' ? fmt(r.amount) : '0.00',
        r.type === 'PAYMENT' ? fmt(r.amount) : '0.00',
      ]);
      exportToCsv('Cash_Book_Ledger', headers, rows);
    } else if (activeModule === 'trial_balance' && tb) {
      const headers = ['Side', 'Category', 'Code', 'Account Name', 'Amount (Rs)'];
      const rows = [
        ...tbDataFiltered.assets.map((a) => ['DEBIT', 'ASSETS', a.accountCode, a.accountName, a.amount.toFixed(2)]),
        ...tbDataFiltered.expenses.map((e) => ['DEBIT', 'EXPENSES', e.accountCode, e.accountName, e.amount.toFixed(2)]),
        ...tbDataFiltered.equity.map((eq) => ['CREDIT', 'EQUITY', eq.accountCode, eq.accountName, eq.amount.toFixed(2)]),
        ...tbDataFiltered.liabilities.map((l) => ['CREDIT', 'LIABILITIES', l.accountCode, l.accountName, l.amount.toFixed(2)]),
        ...tbDataFiltered.revenue.map((r) => ['CREDIT', 'REVENUE', r.accountCode, r.accountName, r.amount.toFixed(2)]),
      ];
      exportToCsv(`Trial_Balance_${businessSegment}_${tbAsOfDate}`, headers, rows);
    } else if (activeModule === 'journal_voucher') {
      const headers = ['Entry #', 'Date', 'Reference', 'Narration', 'Debit Total', 'Credit Total'];
      const rows = filteredJournals.map((j) => [j.entryNumber, new Date(j.entryDate).toLocaleDateString(), j.referenceNumber || '', j.narration, j.totalDebit, j.totalCredit]);
      exportToCsv('Journal_Ledger', headers, rows);
    }
  };

  // Helper: check if a voucher belongs to Commission stream
  const isCommissionVoucher = (v: any) => {
    const nar = (v.narration || '').toLowerCase();
    if (nar.includes('commission') || nar.includes('consignment') || nar.includes('amanat') || nar.includes('settlement') || nar.includes('bilti')) return true;
    if (v.partyType === 'SUPPLIER') {
      const s = suppliers.find((x) => String(x.id) === String(v.partyId));
      if (s) {
        const hasComm = Number(s._count?.consignmentReceipts || 0) > 0 || Number(s._count?.commissionAgreements || 0) > 0 || parseFloat(s.currentBalanceConsignment || '0') > 0;
        if (hasComm && (s.currentBalanceOwn === '0' || !s._count?.purchaseInvoices)) return true;
      }
    }
    return false;
  };

  // Helper: check if a GL account belongs to Commission / Amanat Maal
  const isCommissionAccount = (acc: { accountCode?: string; accountName?: string }) => {
    const code = acc.accountCode || '';
    const name = (acc.accountName || '').toLowerCase();
    if (['1025', '1050', '2020', '4020', '4030', '4035'].includes(code)) return true;
    if (
      name.includes('commission') ||
      name.includes('consignment') ||
      name.includes('amanat') ||
      name.includes('tulai') ||
      name.includes('dami') ||
      name.includes('brokerage') ||
      name.includes('zamindar') ||
      name.includes('peshi')
    ) {
      return true;
    }
    return false;
  };

  // Helper: check if a GL account belongs to Own Stock / Trading
  const isOwnAccount = (acc: { accountCode?: string; accountName?: string }) => {
    const code = acc.accountCode || '';
    const name = (acc.accountName || '').toLowerCase();
    if (['1040', '1045', '2010', '4010', '5010'].includes(code)) return true;
    if (
      name.includes('trading stock') ||
      name.includes('own inventory') ||
      name.includes('own stock') ||
      name.includes('cogs') ||
      name.includes('cost of goods sold') ||
      name.includes('bardana')
    ) {
      return true;
    }
    if (isCommissionAccount(acc)) return false;
    return true;
  };

  // Trial Balance Action Handlers
  const handleGenerateTB = async (selectedEndDate = dateFilter.end || tbAsOfDate) => {
    setLoading(true);
    try {
      const segQuery = businessSegment === 'ALL' ? '' : `segment=${businessSegment}`;
      const startQuery = dateFilter.start ? `startDate=${dateFilter.start}` : '';
      const endQuery = selectedEndDate ? `endDate=${selectedEndDate}` : '';
      const fullQuery = [segQuery, startQuery, endQuery].filter(Boolean).join('&');
      const res = await api.get<TrialBalanceData>(`/accounting/trial-balance${fullQuery ? `?${fullQuery}` : ''}`);
      if (res) {
        setTb(res);
        setTbCheckStatus(null);
      }
    } catch (err: any) {
      console.error('Error generating Trial Balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckTB = () => {
    setTbChecking(true);
    setTimeout(() => {
      if (tb) {
        const leftTotal = tbDataFiltered.totalDebit;
        const rightTotal = tbDataFiltered.totalCredit;
        const diff = Math.abs(leftTotal - rightTotal);
        const isBal = diff < 0.01;
        setTbCheckStatus({
          checked: true,
          isBalanced: isBal,
          message: isBal
            ? 'Zabardast! Trial Balance is 100% Balanced (Zero Variance — All Debits = Credits).'
            : `Variance Detected: Rs. ${diff.toFixed(2)} farq hai Debit aur Credit mein. 'Repair' button use karein ya vouchers check karein.`,
        });
      }
      setTbChecking(false);
    }, 400);
  };

  const handleRepairTB = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Run Ledger Sync & Repair',
      message: 'Do you want to run Ledger Sync & Repair? This will verify all general ledger accounts and re-synchronize double entries.',
      confirmLabel: 'Yes, Run Repair',
      isDestructive: false,
      onConfirm: async () => {
        setTbRepairing(true);
        try {
          await api.post('/accounting/chart-of-accounts/regenerate', {});
          await handleGenerateTB(tbAsOfDate);
          setTbCheckStatus({
            checked: true,
            isBalanced: true,
            message: 'Repair Successful: Chart of accounts synchronized and ledger balances re-calculated!',
          });
        } catch (err: any) {
          setTbCheckStatus({
            checked: true,
            isBalanced: false,
            message: `Repair failed: ${err?.message || 'Error occurred during repair'}`,
          });
        } finally {
          setTbRepairing(false);
        }
      },
    });
  };

  // ─── JV Helpers & Actions ───
  const addJvLine = (type: 'DEBIT' | 'CREDIT' = 'DEBIT') => {
    const newId = (Date.now() + Math.random()).toString();
    setJvLines((prev) => [...prev, { id: newId, accountCode: '', type, amount: '' }]);
  };

  const removeJvLine = (id: string) => {
    if (jvLines.length <= 2) return;
    setJvLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateJvLine = (id: string, field: 'accountCode' | 'type' | 'amount', value: any) => {
    setJvLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const toggleJvLineType = (id: string) => {
    setJvLines((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, type: l.type === 'DEBIT' ? 'CREDIT' : 'DEBIT' } : l
      )
    );
  };

  const totalJvDebit = React.useMemo(() => {
    return jvLines
      .filter((l) => l.type === 'DEBIT')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  }, [jvLines]);

  const totalJvCredit = React.useMemo(() => {
    return jvLines
      .filter((l) => l.type === 'CREDIT')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  }, [jvLines]);

  const isJvEquilibrium =
    totalJvDebit > 0 && Math.abs(totalJvDebit - totalJvCredit) < 0.01;

  const getAccountBalanceDisplay = (code: string) => {
    if (!code) return '0.00';
    const acc = chartAccounts.find((a) => a.accountCode === code);
    if (!acc) return '0.00';
    const bal = parseFloat(acc.balance || '0');
    return `${bal < 0 ? '-' : ''}Rs. ${Math.abs(bal).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleSaveJv = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isJvEquilibrium) {
      setJvNotice({
        type: 'error',
        text: 'Voucher unbalance hai! Debit aur Credit barabar hona lazmi hai.',
      });
      return;
    }

    const invalidLine = jvLines.find(
      (l) => !l.accountCode || (parseFloat(l.amount) || 0) <= 0
    );
    if (invalidLine) {
      setJvNotice({
        type: 'error',
        text: 'Tamam lines mein Account select karein aur amount 0 se bari likhein.',
      });
      return;
    }

    setJvActionLoading(true);
    setJvNotice(null);
    try {
      const payloadLines = jvLines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.type === 'DEBIT' ? parseFloat(l.amount) : 0,
        credit: l.type === 'CREDIT' ? parseFloat(l.amount) : 0,
        description: jvNarration,
      }));

      const res: any = await api.post('/accounting/journal-entries', {
        voucherDate: jvDate,
        narration: jvNarration || 'Manual Journal Voucher',
        lines: payloadLines,
      });

      setJvNotice({
        type: 'success',
        text: res?.message || 'Journal Voucher successfully saved and posted!',
      });
      setJvNarration('');
      setJvLines([
        { id: (Date.now() + 1).toString(), accountCode: '', type: 'DEBIT', amount: '' },
        { id: (Date.now() + 2).toString(), accountCode: '', type: 'CREDIT', amount: '' },
      ]);
      await loadData();
    } catch (err: any) {
      setJvNotice({
        type: 'error',
        text: err?.message || 'Failed to save journal voucher',
      });
    } finally {
      setJvActionLoading(false);
    }
  };

  // Delete & Reverse Voucher
  const handleDeleteVoucher = async (item: VoucherItem & { type: 'RECEIPT' | 'PAYMENT' }) => {
    if (
      !confirm(
        `Voucher "${item.voucherNumber}" (${item.type === 'RECEIPT' ? 'Wasooli' : 'Adaigi'} Rs. ${fmt(
          item.amount
        )}) delete aur reverse karein?\n\nIs se cash/bank balance aur GL entries mukammal reverse ho jayengi.`
      )
    )
      return;
    try {
      setLoading(true);
      await api.delete(item.type === 'RECEIPT' ? `/vouchers/receipts/${item.id}` : `/vouchers/payments/${item.id}`);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Voucher delete nahi ho saka');
    } finally {
      setLoading(false);
    }
  };

  // ─── General Ledger Drill-Down Handler ───
  const handleOpenDrilldown = async (code: string, name?: string, category?: string) => {
    if (!code) return;
    setDrilldownAccount({
      code,
      name: name || code,
      category: category || '',
      loading: true,
      data: null,
    });
    try {
      const res: any = await api.get(`/accounting/accounts/ledger/${code}`);
      if (res?.data) {
        setDrilldownAccount((prev) =>
          prev ? { ...prev, loading: false, data: res.data } : null
        );
      } else {
        setDrilldownAccount((prev) => (prev ? { ...prev, loading: false } : null));
      }
    } catch (err) {
      console.error('Error fetching account ledger:', err);
      setDrilldownAccount((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  // ─── Day-End Rokar (Galla Closing) Calculations ───
  const rokarStats = React.useMemo(() => {
    const list = [...receipts.map((r) => ({ ...r, type: 'RECEIPT' })), ...payments.map((p) => ({ ...p, type: 'PAYMENT' }))];
    const todayItems = list.filter((v) => v.voucherDate?.split('T')[0] === rokarDate);
    
    let todayIn = 0;
    let todayOut = 0;
    todayItems.forEach((it) => {
      const amt = parseFloat(String(it.amount || 0));
      if (it.type === 'RECEIPT') todayIn += amt;
      else todayOut += amt;
    });

    const cashAcc = chartAccounts.find((a) => a.accountCode === '1010');
    const systemTillBalance = parseFloat(cashAcc?.balance || '0');
    const physical = parseFloat(physicalCashCounted) || 0;
    const diff = physicalCashCounted !== '' ? physical - systemTillBalance : 0;

    return {
      todayIn,
      todayOut,
      todayNet: todayIn - todayOut,
      systemTillBalance,
      physical,
      diff,
      isTally: Math.abs(diff) < 0.01 && physicalCashCounted !== '',
    };
  }, [receipts, payments, rokarDate, chartAccounts, physicalCashCounted]);

  // ─── Year-End Closing Handler ───
  const handleExecuteYearEndClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pnl || parseFloat(pnl.netProfit) === 0) {
      setClosingNotice({ type: 'error', text: 'Net Profit Rs. 0.00 hai. Closing entry ki zaroorat nahi.' });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Year-End Financial Closing',
      message: `Kya aap waqai is saal ka Net Profit (Rs. ${pnl.netProfit}) Owner Capital/Retained Earnings mein shift karna chahtay hain?`,
      confirmLabel: 'Yes, Execute Closing',
      isDestructive: false,
      onConfirm: async () => {
        setClosingLoading(true);
        setClosingNotice(null);
        try {
          const res: any = await api.post('/accounting/year-end-closing', {
            closingDate,
            targetAccountCode: closingTargetCode,
            notes: closingNotes || `Year-end financial closing: Net profit transfer`,
          });

          setClosingNotice({
            type: 'success',
            text: res?.message || 'Year-end financial closing successful!',
          });
          await loadData();
        } catch (err: any) {
          setClosingNotice({
            type: 'error',
            text: err?.message || 'Year-end closing failed.',
          });
        } finally {
          setClosingLoading(false);
        }
      },
    });
  };

  /* ── Helper: check if a Journal Entry belongs to Commission / Amanat ── */
  const isCommissionJournal = React.useCallback((j: any) => {
    const commTypes = [
      'CONSIGNMENT_RECEIPT',
      'CONSIGNMENT_RETURN',
      'SUPPLIER_SETTLEMENT',
      'SUPPLIER_ADVANCE',
      'COMMISSION_EXPENSE',
    ];
    const nar = (j.narration || '').toLowerCase();
    const hasCommLine = (j.lines || []).some((l: any) =>
      isCommissionAccount(l.account || { accountCode: l.accountCode, accountName: l.accountName })
    );
    return (
      commTypes.includes(j.referenceType) ||
      nar.includes('commission') ||
      nar.includes('consignment') ||
      nar.includes('amanat') ||
      nar.includes('settlement') ||
      hasCommLine
    );
  }, []);

  /* ── Segment Counts for Buttons ── */
  const segmentCounts = React.useMemo(() => {
    const allVouchers = [...receipts, ...payments];
    const commVouchers = allVouchers.filter(isCommissionVoucher).length;
    const ownVouchers = allVouchers.length - commVouchers;

    const commJournals = journals.filter(isCommissionJournal).length;
    const ownJournals = journals.length - commJournals;

    const comm = commVouchers + commJournals;
    const own = ownVouchers + ownJournals;
    return { all: allVouchers.length + journals.length, own, comm };
  }, [receipts, payments, journals, suppliers, isCommissionJournal]);

  /* ── Combined Cash Book Data ── */
  const combinedCashBook = React.useMemo(() => {
    let list: (VoucherItem & { type: 'RECEIPT' | 'PAYMENT' })[] = [
      ...receipts.map((r) => ({ ...r, type: 'RECEIPT' as const })),
      ...payments.map((p) => ({ ...p, type: 'PAYMENT' as const })),
    ];

    if (businessSegment === 'OWN') {
      list = list.filter((v) => !isCommissionVoucher(v));
    } else if (businessSegment === 'CONSIGNMENT') {
      list = list.filter((v) => isCommissionVoucher(v));
    }

    return list
      .filter((v) => {
        const d = v.voucherDate?.split('T')[0];
        const inDate = (!dateFilter.start || d >= dateFilter.start) && (!dateFilter.end || d <= dateFilter.end);
        if (!inDate) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const party = getPartyName(v.partyType, v.partyId).toLowerCase();
        return (
          v.voucherNumber.toLowerCase().includes(q) ||
          v.narration.toLowerCase().includes(q) ||
          party.includes(q) ||
          (v.cashBankAccount?.accountName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.voucherDate).getTime() - new Date(a.voucherDate).getTime());
  }, [receipts, payments, dateFilter, searchQuery, customers, suppliers, businessSegment]);

  // Cash Book Totals
  const cashBookTotals = React.useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    combinedCashBook.forEach((item) => {
      const amt = parseFloat(String(item.amount || 0));
      if (item.type === 'RECEIPT') totalIn += amt;
      else totalOut += amt;
    });
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [combinedCashBook]);

  // Filtered Journals
  const filteredJournals = React.useMemo(() => {
    const ownTypes = [
      'SALE_INVOICE',
      'SALE_RETURN',
      'PURCHASE_INVOICE',
      'PURCHASE_RETURN',
      'OPENING_STOCK',
      'STOCK_ADJUSTMENT',
    ];
    const commTypes = [
      'CONSIGNMENT_RECEIPT',
      'CONSIGNMENT_RETURN',
      'SUPPLIER_SETTLEMENT',
      'SUPPLIER_ADVANCE',
      'COMMISSION_EXPENSE',
    ];

    return journals.filter((j) => {
      const d = j.entryDate?.split('T')[0];
      const inDate = (!dateFilter.start || d >= dateFilter.start) && (!dateFilter.end || d <= dateFilter.end);
      if (!inDate) return false;

      const isCommEntry = isCommissionJournal(j);

      if (businessSegment === 'CONSIGNMENT' && !isCommEntry) return false;
      if (businessSegment === 'OWN' && isCommEntry) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        j.entryNumber.toLowerCase().includes(q) ||
        (j.narration || '').toLowerCase().includes(q) ||
        (j.referenceNumber || '').toLowerCase().includes(q)
      );
    });
  }, [journals, dateFilter, searchQuery, businessSegment, isCommissionJournal]);

  /* ── Trial Balance 2-Column Split Data ── */
  const tbDataFiltered = React.useMemo(() => {
    if (!tb?.accounts) {
      return {
        assets: [],
        expenses: [],
        equity: [],
        liabilities: [],
        revenue: [],
        totalDebit: 0,
        totalCredit: 0,
        variance: 0,
        isBalanced: true,
      };
    }

    let accounts = tb.accounts;

    if (businessSegment === 'OWN') {
      accounts = accounts.filter((acc) => {
        const d = parseFloat(acc.totalDebit || '0');
        const c = parseFloat(acc.totalCredit || '0');
        return isOwnAccount(acc) || d > 0.001 || c > 0.001;
      });
    } else if (businessSegment === 'CONSIGNMENT') {
      accounts = accounts.filter((acc) => {
        const d = parseFloat(acc.totalDebit || '0');
        const c = parseFloat(acc.totalCredit || '0');
        return isCommissionAccount(acc) || d > 0.001 || c > 0.001;
      });
    }

    const assets: { accountName: string; accountCode: string; amount: number }[] = [];
    const expenses: { accountName: string; accountCode: string; amount: number }[] = [];
    const equity: { accountName: string; accountCode: string; amount: number }[] = [];
    const liabilities: { accountName: string; accountCode: string; amount: number }[] = [];
    const revenue: { accountName: string; accountCode: string; amount: number }[] = [];

    let totalDebitSum = 0;
    let totalCreditSum = 0;

    accounts.forEach((acc) => {
      const d = parseFloat(acc.totalDebit || '0');
      const c = parseFloat(acc.totalCredit || '0');

      // Left Column (Debit Nature): Assets & Expenses => Debit - Credit
      if (acc.category === 'ASSET') {
        const amt = d - c;
        if (showZeroBalanceAccounts || Math.abs(amt) > 0.001 || d > 0 || c > 0) {
          assets.push({ accountName: acc.accountName, accountCode: acc.accountCode, amount: amt });
          totalDebitSum += amt;
        }
      } else if (acc.category === 'EXPENSE') {
        const amt = d - c;
        if (showZeroBalanceAccounts || Math.abs(amt) > 0.001 || d > 0 || c > 0) {
          expenses.push({ accountName: acc.accountName, accountCode: acc.accountCode, amount: amt });
          totalDebitSum += amt;
        }
      } 
      // Right Column (Credit Nature): Equity, Liabilities & Revenue => Credit - Debit
      else if (acc.category === 'EQUITY') {
        const amt = c - d;
        if (showZeroBalanceAccounts || Math.abs(amt) > 0.001 || d > 0 || c > 0) {
          equity.push({ accountName: acc.accountName, accountCode: acc.accountCode, amount: amt });
          totalCreditSum += amt;
        }
      } else if (acc.category === 'LIABILITY') {
        const amt = c - d;
        if (showZeroBalanceAccounts || Math.abs(amt) > 0.001 || d > 0 || c > 0) {
          liabilities.push({ accountName: acc.accountName, accountCode: acc.accountCode, amount: amt });
          totalCreditSum += amt;
        }
      } else if (acc.category === 'INCOME' || acc.category === 'REVENUE') {
        const amt = c - d;
        if (showZeroBalanceAccounts || Math.abs(amt) > 0.001 || d > 0 || c > 0) {
          revenue.push({ accountName: acc.accountName, accountCode: acc.accountCode, amount: amt });
          totalCreditSum += amt;
        }
      }
    });

    // ── Professional Inter-Stream / Inter-Segment Balancing ──
    // Jab cash/bank till shared ho, to Apna Maal aur Commission stream ke darmiyan
    // balance barabar rakhne ke liye clearing head shamil hota hai taakay Debit = Credit hamesha 100% equal rahay
    if (businessSegment === 'OWN') {
      const diff = totalDebitSum - totalCreditSum;
      if (Math.abs(diff) > 0.001) {
        if (diff > 0) {
          liabilities.push({
            accountName: 'Inter-Stream Clearing (Commission Funds in Shop Till)',
            accountCode: '2099',
            amount: diff,
          });
          totalCreditSum += diff;
        } else {
          assets.push({
            accountName: 'Inter-Stream Clearing (Due from Commission Stream)',
            accountCode: '1099',
            amount: Math.abs(diff),
          });
          totalDebitSum += Math.abs(diff);
        }
      }
    } else if (businessSegment === 'CONSIGNMENT') {
      const diff = totalCreditSum - totalDebitSum;
      if (Math.abs(diff) > 0.001) {
        if (diff > 0) {
          assets.push({
            accountName: 'Inter-Stream Clearing (Commission Cash Held in Shop Till)',
            accountCode: '1099',
            amount: diff,
          });
          totalDebitSum += diff;
        } else {
          liabilities.push({
            accountName: 'Inter-Stream Clearing (Due to Shop Till)',
            accountCode: '2099',
            amount: Math.abs(diff),
          });
          totalCreditSum += Math.abs(diff);
        }
      }
    }

    const variance = Math.abs(totalDebitSum - totalCreditSum);

    return {
      assets,
      expenses,
      equity,
      liabilities,
      revenue,
      totalDebit: totalDebitSum,
      totalCredit: totalCreditSum,
      variance,
      isBalanced: variance < 0.01,
    };
  }, [tb, businessSegment, showZeroBalanceAccounts]);

  /* ── Module content renderer ── */
  const renderModuleContent = () => {
    /* ── 1. CASH BOOK ── */
    if (activeModule === 'cash_book') {
      return (
        <div className="space-y-4 animate-fade-in">
          {/* KPI Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4 bg-emerald-50 border-emerald-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">⬇ Kul Aamad (Cash In)</span>
              <div className="text-xl font-bold font-mono text-emerald-800 mt-1">Rs. {fmt(cashBookTotals.totalIn)}</div>
              <span className="text-[10px] text-emerald-600">Wasooli &amp; Receipts</span>
            </div>
            <div className="card p-4 bg-rose-50 border-rose-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">⬆ Kul Kharach (Cash Out)</span>
              <div className="text-xl font-bold font-mono text-rose-800 mt-1">Rs. {fmt(cashBookTotals.totalOut)}</div>
              <span className="text-[10px] text-rose-600">Adaigi &amp; Payments</span>
            </div>
            <div className={`card p-4 ${cashBookTotals.net >= 0 ? 'bg-brand-50 border-brand-200' : 'bg-red-50 border-red-200'}`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${cashBookTotals.net >= 0 ? 'text-brand-700' : 'text-red-700'}`}>
                💵 Net Cash In Hand
              </span>
              <div className={`text-xl font-bold font-mono mt-1 ${cashBookTotals.net >= 0 ? 'text-brand-800' : 'text-red-800'}`}>
                Rs. {fmt(cashBookTotals.net)}
              </div>
              <span className="text-[10px] text-gray-500">Period Closing Balance</span>
            </div>
          </div>

          {/* Day-End Rokar (Galla Closing) Banner */}
          <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-lg shadow-xs">
                🌙
              </div>
              <div>
                <div className="text-xs font-bold text-gray-900 flex items-center gap-2">
                  <span>Day-End Rokar (Galla Closing &amp; Cash Match)</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Daily Audit
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">
                  Shaam ko dukan ka asal naqad galla count karein aur system ke cash balance se milayein
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRokarModal(true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>🌙 Start Galla Closing</span>
            </button>
          </div>

          {/* Ledger Table */}
          <div className="card overflow-hidden">
            <div className="card-header flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <h3 className="section-title">Cash &amp; Bank Register Ledger</h3>
                <span className="text-xs text-gray-400">({combinedCashBook.length} entries)</span>
              </div>
              {/* Business Segment Toggle */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => setBusinessSegment('ALL')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${businessSegment === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Tamam{' '}
                  <span className="ml-1 text-[10px] bg-gray-200 text-gray-700 px-1.5 rounded-full">{segmentCounts.all}</span>
                </button>
                <button
                  onClick={() => setBusinessSegment('OWN')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${businessSegment === 'OWN' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-emerald-600'}`}
                >
                  Apna Maal{' '}
                  <span className={`ml-1 text-[10px] px-1.5 rounded-full ${businessSegment === 'OWN' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{segmentCounts.own}</span>
                </button>
                <button
                  onClick={() => setBusinessSegment('CONSIGNMENT')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${businessSegment === 'CONSIGNMENT' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:text-violet-600'}`}
                >
                  Commission{' '}
                  <span className={`ml-1 text-[10px] px-1.5 rounded-full ${businessSegment === 'CONSIGNMENT' ? 'bg-violet-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{segmentCounts.comm}</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search voucher, party, detail..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input pl-8 py-1 text-xs w-48"
                  />
                </div>
                <input
                  type="date"
                  value={dateFilter.start}
                  onChange={(e) => setDateFilter((d) => ({ ...d, start: e.target.value }))}
                  className="form-input py-1 text-xs w-32"
                />
                <span className="text-gray-400 text-xs">→</span>
                <input
                  type="date"
                  value={dateFilter.end}
                  onChange={(e) => setDateFilter((d) => ({ ...d, end: e.target.value }))}
                  className="form-input py-1 text-xs w-32"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="table-base">
                <thead className="table-head sticky top-0">
                  <tr>
                    <th className="table-th">Taareekh (Date)</th>
                    <th className="table-th">Qisam (Type)</th>
                    <th className="table-th">Voucher #</th>
                    <th className="table-th">Party Name</th>
                    <th className="table-th">Register / Account</th>
                    <th className="table-th">Tafseel (Narration)</th>
                    <th className="table-th text-right text-emerald-600">Aamad (Inflow)</th>
                    <th className="table-th text-right text-rose-600">Kharach (Outflow)</th>
                    <th className="table-th text-center">Del</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedCashBook.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="table-td text-center text-gray-400 italic py-10">
                        Is date range mein koi cash record nahi mila.
                      </td>
                    </tr>
                  ) : (
                    combinedCashBook.map((item) => (
                      <tr key={`${item.type}-${item.id}`} className="table-row">
                        <td className="table-td text-gray-600 text-xs">{new Date(item.voucherDate).toLocaleDateString()}</td>
                        <td className="table-td">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.type === 'RECEIPT' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {item.type === 'RECEIPT' ? '⬇ Wasooli (In)' : '⬆ Adaigi (Out)'}
                          </span>
                        </td>
                        <td className="table-td font-mono font-bold text-gray-800 text-xs">{item.voucherNumber}</td>
                        <td className="table-td font-medium text-gray-900 text-xs">{getPartyName(item.partyType, item.partyId)}</td>
                        <td className="table-td text-gray-600 text-xs">{item.cashBankAccount?.accountName || 'Cash Register'}</td>
                        <td className="table-td text-gray-500 text-xs max-w-xs truncate">{item.narration}</td>
                        <td className="table-td text-right font-mono font-bold text-emerald-700">
                          {item.type === 'RECEIPT' ? `+ Rs. ${fmt(item.amount)}` : '—'}
                        </td>
                        <td className="table-td text-right font-mono font-bold text-rose-700">
                          {item.type === 'PAYMENT' ? `- Rs. ${fmt(item.amount)}` : '—'}
                        </td>
                        <td className="table-td text-center">
                          <button
                            onClick={() => handleDeleteVoucher(item)}
                            title="Voucher delete karein"
                            className="p-1 rounded text-gray-300 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    /* ── 2. PROFIT & LOSS ── */
    if (activeModule === 'profit_loss') {
      return (
        <div className="animate-fade-in max-w-3xl space-y-4">
          <div className="card p-6 space-y-4">
            <div className="border-b border-gray-200 pb-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">
                    Formal Statement of Profit or Loss
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    businessSegment === 'ALL'
                      ? 'bg-slate-100 text-slate-700'
                      : businessSegment === 'OWN'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-violet-100 text-violet-800 border border-violet-300'
                  }`}>
                    {businessSegment === 'ALL' ? 'Tamam (Consolidated)' : businessSegment === 'OWN' ? '🛒 Apna Maal (Trading)' : '📋 Commission Agency'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">Double-entry General Ledger se automatic calculation</span>
                  {(dateFilter.start || dateFilter.end) && (
                    <span className="text-[11px] font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                      📅 Muddat: {dateFilter.start || 'Start'} se {dateFilter.end || 'Today'}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => loadData()} className="btn-secondary text-xs">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {pnl ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-700 font-medium">Own Stock Sales Revenue (Farokht Raqam)</span>
                  <span className="font-mono font-bold text-gray-900">Rs. {pnl.ownSalesRevenue}</span>
                </div>
                <div className="flex justify-between items-center py-2 text-rose-600 border-b border-gray-100">
                  <span>Minus: Cost of Goods Sold (Maal Ki Asal Khareed / FIFO)</span>
                  <span className="font-mono font-bold">− Rs. {pnl.costOfGoodsSold}</span>
                </div>
                <div className="flex justify-between items-center py-2.5 bg-emerald-50 rounded-lg px-3 font-bold text-emerald-800 border border-emerald-200">
                  <span>Gross Trading Margin (Kacha Nafa)</span>
                  <span className="font-mono text-base">Rs. {pnl.grossTradingProfit}</span>
                </div>
                <div className="flex justify-between items-center py-2 text-brand-700 border-b border-gray-100">
                  <span className="font-medium">Plus: Realized Consignment Commission Income</span>
                  <span className="font-mono font-bold">+ Rs. {pnl.commissionIncome}</span>
                </div>
                <div className="flex justify-between items-center py-2 text-rose-600 border-b border-gray-100">
                  <span>Minus: Dukan Ke Tamam Operating Kharche</span>
                  <span className="font-mono font-bold">− Rs. {pnl.operatingExpenses}</span>
                </div>
                <div
                  className={`flex justify-between items-center py-3.5 rounded-xl px-4 border text-base font-bold ${
                    parseFloat(pnl.netProfit) >= 0
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-rose-50 border-rose-300 text-rose-800'
                  }`}
                >
                  <span className="uppercase tracking-wide">
                    {parseFloat(pnl.netProfit) >= 0 ? '✅ Net Operating Profit (Pura Nafa)' : '⚠️ Net Operating Loss (Nuqsan)'}
                  </span>
                  <span className="font-mono text-xl">Rs. {pnl.netProfit}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">Loading Profit &amp; Loss data...</div>
            )}
          </div>
        </div>
      );
    }

    /* ── 3. TRIAL BALANCE (TWO-COLUMN FORMAT AS PER SPEC) ── */
    if (activeModule === 'trial_balance') {
      const renderAmount = (amount: number, isDark = false) => {
        const isNeg = amount < 0;
        const color = isNeg ? (isDark ? 'text-rose-400' : 'text-rose-600') : (isDark ? 'text-white' : 'text-slate-800');
        return (
          <span className={`font-mono font-bold pr-2 ${color}`}>
            {isNeg
              ? `-${Math.abs(amount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      };

      return (
        <div className="space-y-4 animate-fade-in">
          {/* Top Control Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Tareekh:</span>
                <input
                  type="date"
                  value={dateFilter.start}
                  onChange={(e) => setDateFilter((d) => ({ ...d, start: e.target.value }))}
                  className="border border-slate-300 rounded px-2 py-1 text-xs font-mono font-medium focus:ring-1 focus:ring-brand-500 outline-none"
                />
                <span className="text-xs text-slate-400 font-bold">se</span>
                <input
                  type="date"
                  value={dateFilter.end}
                  onChange={(e) => {
                    setDateFilter((d) => ({ ...d, end: e.target.value }));
                    setTbAsOfDate(e.target.value);
                  }}
                  className="border border-slate-300 rounded px-2 py-1 text-xs font-mono font-medium focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateTB(tbAsOfDate)}
                  disabled={loading}
                  className="px-3.5 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Generate
                </button>

                <button
                  type="button"
                  onClick={printDocument}
                  className="px-3.5 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>

                <button
                  type="button"
                  onClick={handleCheckTB}
                  disabled={tbChecking}
                  className="px-3.5 py-1.5 bg-sky-500 text-white rounded text-xs font-bold hover:bg-sky-600 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <CheckCircle className={`w-3.5 h-3.5 ${tbChecking ? 'animate-spin' : ''}`} />
                  Check
                </button>

                <button
                  type="button"
                  onClick={handleRepairTB}
                  disabled={tbRepairing}
                  className="px-3.5 py-1.5 bg-amber-500 text-white rounded text-xs font-bold hover:bg-amber-600 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Recalculate balances and repair double-entry ledger"
                >
                  <Wrench className={`w-3.5 h-3.5 ${tbRepairing ? 'animate-spin' : ''}`} />
                  Repair
                </button>
              </div>
            </div>

            {/* Zero balance toggle & Stream badge */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showZeroBalanceAccounts}
                  onChange={(e) => setShowZeroBalanceAccounts(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5"
                />
                <span>Zero Balances Dikhayein</span>
              </label>

              <div className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                Mode:{' '}
                {businessSegment === 'ALL'
                  ? 'Tamam (Consolidated)'
                  : businessSegment === 'OWN'
                  ? 'Apna Maal (Trading)'
                  : 'Commission / Amanat'}
              </div>
            </div>
          </div>

          {/* Validation Status Banner */}
          {tbCheckStatus && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                tbCheckStatus.isBalanced
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {tbCheckStatus.isBalanced ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                )}
                <span>{tbCheckStatus.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setTbCheckStatus(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Two-Column Split Layout */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-300 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-300">
              
              {/* ── LEFT COLUMN: DEBITS (Assets + Expenses) ── */}
              <div className="flex flex-col justify-between">
                <div>
                  <div className="bg-[#242f3e] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold tracking-wider uppercase">
                    <span>PARTICULARS</span>
                    <span>DEBIT (Rs)</span>
                  </div>

                  <div className="p-4 space-y-6">
                    {/* ASSETS */}
                    <div>
                      <div className="text-xs font-black text-slate-800 border-b border-slate-300 pb-1 mb-2 tracking-wide uppercase flex justify-between items-center">
                        <span>ASSETS</span>
                        <span className="text-[10px] text-gray-400 font-normal">({tbDataFiltered.assets.length})</span>
                      </div>
                      <div className="space-y-0.5 text-xs">
                        {tbDataFiltered.assets.length === 0 ? (
                          <div className="text-[11px] text-gray-400 italic pl-4 py-1.5">Is category mein koi asset nahi mila</div>
                        ) : (
                          tbDataFiltered.assets.map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <button
                                type="button"
                                onClick={() => handleOpenDrilldown(item.accountCode, item.accountName, 'ASSET')}
                                className="text-slate-700 hover:text-brand-600 pl-4 font-medium flex items-center gap-1.5 text-left group transition-colors cursor-pointer"
                                title="Click to view detailed ledger transactions"
                              >
                                <span>{item.accountName}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-brand-500 transition-opacity" />
                              </button>
                              {renderAmount(item.amount)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* EXPENSES */}
                    <div>
                      <div className="text-xs font-black text-slate-800 border-b border-slate-300 pb-1 mb-2 tracking-wide uppercase flex justify-between items-center">
                        <span>EXPENSES</span>
                        <span className="text-[10px] text-gray-400 font-normal">({tbDataFiltered.expenses.length})</span>
                      </div>
                      <div className="space-y-0.5 text-xs">
                        {tbDataFiltered.expenses.length === 0 ? (
                          <div className="text-[11px] text-gray-400 italic pl-4 py-1.5">Is category mein koi kharcha nahi mila</div>
                        ) : (
                          tbDataFiltered.expenses.map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <button
                                type="button"
                                onClick={() => handleOpenDrilldown(item.accountCode, item.accountName, 'EXPENSE')}
                                className="text-slate-700 hover:text-brand-600 pl-4 font-medium flex items-center gap-1.5 text-left group transition-colors cursor-pointer"
                                title="Click to view detailed ledger transactions"
                              >
                                <span>{item.accountName}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-brand-500 transition-opacity" />
                              </button>
                              {renderAmount(item.amount)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Left Total Footer */}
                <div className="bg-[#1f2937] text-white p-3 flex justify-between items-center font-bold text-xs border-t border-slate-700">
                  <span className="uppercase tracking-wider">TOTAL</span>
                  <span className="font-mono text-sm tracking-wide">
                    {renderAmount(tbDataFiltered.totalDebit, true)}
                  </span>
                </div>
              </div>

              {/* ── RIGHT COLUMN: CREDITS (Equity + Liabilities + Revenue) ── */}
              <div className="flex flex-col justify-between">
                <div>
                  <div className="bg-[#242f3e] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold tracking-wider uppercase">
                    <span>PARTICULARS</span>
                    <span>CREDIT (Rs)</span>
                  </div>

                  <div className="p-4 space-y-6">
                    {/* EQUITY */}
                    <div>
                      <div className="text-xs font-black text-slate-800 border-b border-slate-300 pb-1 mb-2 tracking-wide uppercase flex justify-between items-center">
                        <span>EQUITY</span>
                        <span className="text-[10px] text-gray-400 font-normal">({tbDataFiltered.equity.length})</span>
                      </div>
                      <div className="space-y-0.5 text-xs">
                        {tbDataFiltered.equity.length === 0 ? (
                          <div className="text-[11px] text-gray-400 italic pl-4 py-1.5">Is category mein koi equity nahi mili</div>
                        ) : (
                          tbDataFiltered.equity.map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <button
                                type="button"
                                onClick={() => handleOpenDrilldown(item.accountCode, item.accountName, 'EQUITY')}
                                className="text-slate-700 hover:text-brand-600 pl-4 font-medium flex items-center gap-1.5 text-left group transition-colors cursor-pointer"
                                title="Click to view detailed ledger transactions"
                              >
                                <span>{item.accountName}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-brand-500 transition-opacity" />
                              </button>
                              {renderAmount(item.amount)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* LIABILITIES */}
                    <div>
                      <div className="text-xs font-black text-slate-800 border-b border-slate-300 pb-1 mb-2 tracking-wide uppercase flex justify-between items-center">
                        <span>LIABILITIES</span>
                        <span className="text-[10px] text-gray-400 font-normal">({tbDataFiltered.liabilities.length})</span>
                      </div>
                      <div className="space-y-0.5 text-xs">
                        {tbDataFiltered.liabilities.length === 0 ? (
                          <div className="text-[11px] text-gray-400 italic pl-4 py-1.5">Is category mein koi liability nahi mili</div>
                        ) : (
                          tbDataFiltered.liabilities.map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <button
                                type="button"
                                onClick={() => handleOpenDrilldown(item.accountCode, item.accountName, 'LIABILITY')}
                                className="text-slate-700 hover:text-brand-600 pl-4 font-medium flex items-center gap-1.5 text-left group transition-colors cursor-pointer"
                                title="Click to view detailed ledger transactions"
                              >
                                <span>{item.accountName}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-brand-500 transition-opacity" />
                              </button>
                              {renderAmount(item.amount)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* REVENUE */}
                    <div>
                      <div className="text-xs font-black text-slate-800 border-b border-slate-300 pb-1 mb-2 tracking-wide uppercase flex justify-between items-center">
                        <span>REVENUE</span>
                        <span className="text-[10px] text-gray-400 font-normal">({tbDataFiltered.revenue.length})</span>
                      </div>
                      <div className="space-y-0.5 text-xs">
                        {tbDataFiltered.revenue.length === 0 ? (
                          <div className="text-[11px] text-gray-400 italic pl-4 py-1.5">Is category mein koi revenue nahi mila</div>
                        ) : (
                          tbDataFiltered.revenue.map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <button
                                type="button"
                                onClick={() => handleOpenDrilldown(item.accountCode, item.accountName, 'INCOME')}
                                className="text-slate-700 hover:text-brand-600 pl-4 font-medium flex items-center gap-1.5 text-left group transition-colors cursor-pointer"
                                title="Click to view detailed ledger transactions"
                              >
                                <span>{item.accountName}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-brand-500 transition-opacity" />
                              </button>
                              {renderAmount(item.amount)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Total Footer */}
                <div className="bg-[#1f2937] text-white p-3 flex justify-between items-center font-bold text-xs border-t border-slate-700">
                  <span className="uppercase tracking-wider">TOTAL</span>
                  <span className="font-mono text-sm tracking-wide">
                    {renderAmount(tbDataFiltered.totalCredit, true)}
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* Variance Summary Footer Bar */}
          <div className="flex items-center justify-between text-xs text-gray-500 px-2">
            <span>
              Left (Debit): <strong className="font-mono text-gray-800">Rs. {tbDataFiltered.totalDebit.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</strong> • Right (Credit): <strong className="font-mono text-gray-800">Rs. {tbDataFiltered.totalCredit.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</strong>
            </span>
            <span>
              Farq (Variance):{' '}
              <strong className={`font-mono font-bold ${tbDataFiltered.variance > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>
                Rs. {tbDataFiltered.variance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>
        </div>
      );
    }

    /* ── 4. BALANCE SHEET ── */
    if (activeModule === 'balance_sheet') {
      return (
        <div className="animate-fade-in max-w-4xl space-y-4">
          <div className="card p-6 space-y-5">
            <div className="border-b border-gray-200 pb-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">Balance Sheet Statement</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    businessSegment === 'ALL'
                      ? 'bg-slate-100 text-slate-700'
                      : businessSegment === 'OWN'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-violet-100 text-violet-800 border border-violet-300'
                  }`}>
                    {businessSegment === 'ALL' ? 'Tamam (Consolidated)' : businessSegment === 'OWN' ? '🛒 Apna Maal (Trading)' : '📋 Commission Agency'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-gray-500">Fundamental Equation: Assets = Liabilities + Equity</span>
                  {dateFilter.end && (
                    <span className="text-[11px] font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                      📅 As of: {dateFilter.end}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => loadData()} className="btn-secondary text-xs">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            {bs && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Total Assets (Jaidaad)', value: bs.totalAssets, color: 'text-brand-600' },
                    { label: 'Total Liabilities (Zimmadari/Dena)', value: bs.totalLiabilities, color: 'text-rose-600' },
                    { label: 'Total Equity (Sarmaya)', value: bs.totalEquity, color: 'text-sky-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4 text-center">
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{label}</div>
                      <div className={`font-mono font-bold text-lg mt-1 ${color}`}>Rs. {value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {[
                    { title: 'Assets (Asasay)', items: bs.assets, color: 'text-brand-600' },
                    { title: 'Liabilities (Wajib-ul-Ada)', items: bs.liabilities, color: 'text-rose-600' },
                    { title: 'Equity (Hissa-Daari)', items: bs.equity, color: 'text-sky-600' },
                  ].map(({ title, items, color }) => (
                    <div key={title} className="card p-3">
                      <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 pb-1 border-b">
                        {title}
                      </div>
                      <div className="space-y-1">
                        {items.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No entries</p>
                        ) : (
                          items.map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-1 border-b border-gray-100">
                              <span className="text-gray-700 text-xs">{item.name}</span>
                              <span className={`font-mono font-bold text-xs ${color}`}>Rs. {item.balance}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    /* ── 5. CHART OF ACCOUNTS (COMPLETE MANDI GENERAL LEDGER MASTER) ── */
    if (activeModule === 'chart_of_accounts') {
      const filteredCOA = chartAccounts.filter((a) => {
        const matchesCategory = coaCategoryFilter === 'ALL' || a.category === coaCategoryFilter;
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          a.accountCode.toLowerCase().includes(q) ||
          a.accountName.toLowerCase().includes(q) ||
          (a.parentCategory && a.parentCategory.toLowerCase().includes(q));
        return matchesCategory && matchesSearch;
      });

      const countByType = (t: string) => chartAccounts.filter((a) => a.category === t).length;

      return (
        <div className="space-y-4 animate-fade-in">
          {/* Header Card with Add & Regenerate buttons */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookMarked className="w-6 h-6 text-brand-600" />
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Chart of Accounts</h3>
                  <p className="text-xs text-gray-500">
                    5 Pillar Double-Entry Structure (Assets, Liabilities, Capital, Revenue, Expenses)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAccountForm(!showAddAccountForm)}
                  className={`btn text-xs font-semibold px-3 py-2 ${
                    showAddAccountForm ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'btn-brand text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 mr-1 inline" />
                  {showAddAccountForm ? 'Hide Add Form' : 'Add Account'}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateCOA}
                  disabled={coaActionLoading}
                  className="btn bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-2 shadow-sm"
                  title="Restore / Seed standard Wholesale Mandi general ledger accounts"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 inline ${coaActionLoading ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
              </div>
            </div>

            {/* Notification message */}
            {coaNotice && (
              <div
                className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${
                  coaNotice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <span>{coaNotice.text}</span>
                <button type="button" onClick={() => setCoaNotice(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Add New Account Form */}
          {showAddAccountForm && (
            <div className="card p-5 border border-gray-200 shadow-sm bg-white">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-600"></div>
                  <h4 className="font-bold text-gray-900 text-sm">Add New Account</h4>
                  <span className="text-xs text-gray-500 font-normal">
                    (Naya account banayein, code auto-generate ho ga)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddAccountForm(false)}
                  className="btn-ghost"
                  title="Close Form"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Account Type (5 Core Heads) */}
                  <div>
                    <label className="form-label">
                      Account Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={newAccType}
                      onChange={(e) => handleTypeChange(e.target.value as any)}
                      className="form-select font-medium"
                    >
                      <option value="ASSET">Assets (Asasay)</option>
                      <option value="LIABILITY">Liabilities (Wajib-ul-Ada / Dena)</option>
                      <option value="INCOME">Revenue (Aamdani)</option>
                      <option value="EQUITY">Capital (Sarmaya)</option>
                      <option value="EXPENSE">Expenses (Kharchay)</option>
                    </select>
                  </div>

                  {/* Parent Account / Category */}
                  <div>
                    <label className="form-label">
                      Parent Account / Category
                    </label>
                    <select
                      value={newAccParent}
                      onChange={(e) => setNewAccParent(e.target.value)}
                      className="form-select font-medium"
                    >
                      {(ACCOUNT_TYPE_CONFIG[newAccType]?.parents || ['General']).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Account Name */}
                  <div>
                    <label className="form-label">
                      Account Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      list="coa-account-suggestions"
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                      placeholder="e.g. Meezan Bank, Chai Pani, Godown Rent"
                      className="form-input"
                      required
                    />
                    <datalist id="coa-account-suggestions">
                      {(ACCOUNT_TYPE_CONFIG[newAccType]?.suggestions || []).map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  {/* Account Code (Auto-generated with Copy button) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="form-label mb-0">Account Code</label>
                      <span className="text-[10px] text-brand-600 font-mono font-semibold">Auto-generated</span>
                    </div>
                    <div className="flex rounded-lg shadow-sm">
                      <input
                        type="text"
                        value={newAccCode}
                        onChange={(e) => setNewAccCode(e.target.value)}
                        placeholder="Auto-generated"
                        className="form-input rounded-r-none font-mono font-bold text-brand-700 tracking-wide"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyCode(newAccCode)}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-r-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm shrink-0 cursor-pointer"
                        title="Copy Account Code"
                      >
                        {copyCodeFeedback === newAccCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[11px] text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Second Row: Opening Balance & Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-100 items-end">
                  {/* Opening Balance Amount */}
                  <div>
                    <label className="form-label">
                      Opening Balance (Ibtidai Baqaya)
                    </label>
                    <div className="relative rounded-lg shadow-sm">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-sm font-bold text-gray-400 pointer-events-none">
                        Rs.
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newAccOpBal}
                        onChange={(e) => setNewAccOpBal(e.target.value)}
                        placeholder="0.00"
                        className="form-input pl-11 font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Balance Nature: Debit or Credit */}
                  <div>
                    <label className="form-label">
                      Balance Nature (Dr / Cr)
                    </label>
                    <select
                      value={newAccOpType}
                      onChange={(e) => setNewAccOpType(e.target.value as any)}
                      className="form-select font-medium"
                    >
                      <option value="DEBIT">Debit (Dr) - Normal for Assets & Expenses</option>
                      <option value="CREDIT">Credit (Cr) - Normal for Liabilities, Capital & Revenue</option>
                    </select>
                  </div>

                  {/* Submit / Clear Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={coaActionLoading}
                      className="btn-primary flex-1 justify-center py-2.5 text-sm"
                    >
                      <Plus className="w-4 h-4 mr-1 inline" />
                      {coaActionLoading ? 'Saving...' : 'Add Account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewAccName('');
                        setNewAccOpBal('0.00');
                        handleTypeChange(newAccType);
                      }}
                      className="btn-secondary py-2.5 px-4 text-sm"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Main Chart of Accounts Hierarchy Table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
            {/* Dark Stylish Table Banner (Matching User's Screenshot) */}
            <div className="bg-slate-900 text-white py-3.5 px-6 text-center select-none">
              <h3 className="text-sm font-extrabold tracking-widest uppercase">CHART OF ACCOUNTS</h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">Complete Account Hierarchy & General Ledger Master</p>
            </div>

            {/* Filter Pills & Search */}
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'ALL', label: 'All Accounts', count: chartAccounts.length },
                  { key: 'ASSET', label: 'Assets', count: countByType('ASSET'), badge: 'bg-emerald-100 text-emerald-800' },
                  { key: 'LIABILITY', label: 'Liabilities', count: countByType('LIABILITY'), badge: 'bg-rose-100 text-rose-800' },
                  { key: 'INCOME', label: 'Revenue', count: countByType('INCOME'), badge: 'bg-teal-100 text-teal-800' },
                  { key: 'EQUITY', label: 'Capital', count: countByType('EQUITY'), badge: 'bg-blue-100 text-blue-800' },
                  { key: 'EXPENSE', label: 'Expenses', count: countByType('EXPENSE'), badge: 'bg-amber-100 text-amber-800' },
                ].map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setCoaCategoryFilter(pill.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                      coaCategoryFilter === pill.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        coaCategoryFilter === pill.key ? 'bg-white/20 text-white' : pill.badge || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {pill.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input pl-9 py-2 text-xs w-full"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead className="table-head bg-gray-100 text-gray-700">
                  <tr>
                    <th className="table-th text-xs">Account Code</th>
                    <th className="table-th text-xs">Account Name</th>
                    <th className="table-th text-xs">Type</th>
                    <th className="table-th text-xs">Category / Hierarchy</th>
                    <th className="table-th text-xs text-right">Balance</th>
                    <th className="table-th text-xs text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCOA.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400 text-xs italic">
                        No accounts match your search or filter. Click "Regenerate" to seed standard accounts.
                      </td>
                    </tr>
                  ) : (
                    filteredCOA.map((acc) => {
                      const isNegative = (acc.rawBalance ?? 0) < 0;
                      return (
                        <tr key={acc.id} className="table-row hover:bg-slate-50 transition-colors">
                          {/* Code */}
                          <td className="table-td whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="font-bold text-slate-800 text-xs">{acc.accountCode}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(acc.accountCode)}
                                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                                title="Copy code"
                              >
                                {copyCodeFeedback === acc.accountCode ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Name */}
                          <td className="table-td">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenDrilldown(acc.accountCode, acc.accountName, acc.category)}
                                className="text-gray-900 font-semibold text-xs hover:text-brand-600 flex items-center gap-1 group text-left transition-colors cursor-pointer"
                                title="Click to view full ledger transactions & running balance"
                              >
                                <span>{acc.accountName}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-brand-500 transition-opacity" />
                              </button>
                              {acc.isSystem && (
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-medium" title="Core system account required for automatic postings">
                                  System
                                </span>
                              )}
                              {!acc.isActive && (
                                <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-mono">
                                  Inactive
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Type */}
                          <td className="table-td whitespace-nowrap">
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full lowercase ${
                                acc.category === 'ASSET'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : acc.category === 'LIABILITY'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : acc.category === 'INCOME'
                                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                  : acc.category === 'EQUITY'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {acc.category === 'ASSET'
                                ? 'assets'
                                : acc.category === 'LIABILITY'
                                ? 'liabilities'
                                : acc.category === 'INCOME'
                                ? 'revenue'
                                : acc.category === 'EQUITY'
                                ? 'capital'
                                : 'expenses'}
                            </span>
                          </td>

                          {/* Category / Parent Hierarchy */}
                          <td className="table-td text-xs text-gray-600 whitespace-nowrap">
                            {acc.parentCategory || acc.parent?.accountName || 'General'}
                          </td>

                          {/* Balance */}
                          <td className="table-td text-right whitespace-nowrap font-mono text-xs font-bold">
                            <span className={isNegative ? 'text-rose-600' : 'text-slate-800'}>
                              Rs. {acc.balance || '0.00'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="table-td text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDrilldown(acc.accountCode, acc.accountName, acc.category)}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                                title="View full account ledger & running balance"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Ledger
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingAccount(acc)}
                                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors shadow-xs cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAccount(acc)}
                                disabled={acc.isSystem || (acc.transactionCount ?? 0) > 0}
                                className={`text-[11px] font-semibold py-1 px-2.5 rounded shadow-xs transition-colors ${
                                  acc.isSystem || (acc.transactionCount ?? 0) > 0
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-rose-500 hover:bg-rose-600 text-white cursor-pointer'
                                }`}
                                title={
                                  acc.isSystem
                                    ? 'System accounts cannot be deleted'
                                    : (acc.transactionCount ?? 0) > 0
                                    ? 'Account has active transactions and cannot be deleted'
                                    : 'Delete custom account'
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit Account Modal */}
          {editingAccount && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-gray-100">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-brand-600" />
                    <h3 className="font-bold text-gray-900 text-sm">
                      Edit Account ({editingAccount.accountCode})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingAccount(null)}
                    className="btn-ghost"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleUpdateAccount} className="space-y-4">
                  <div>
                    <label className="form-label">Account Code</label>
                    <input
                      type="text"
                      value={editingAccount.accountCode}
                      disabled
                      className="form-input bg-gray-50 text-gray-500 font-mono text-xs cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      Account Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingAccount.accountName}
                      onChange={(e) =>
                        setEditingAccount({ ...editingAccount, accountName: e.target.value })
                      }
                      className="form-input text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label">Account Type</label>
                    <input
                      type="text"
                      value={editingAccount.category}
                      disabled
                      className="form-input bg-gray-50 text-gray-500 font-mono text-xs uppercase cursor-not-allowed"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="account-active-check"
                      checked={editingAccount.isActive ?? true}
                      onChange={(e) =>
                        setEditingAccount({ ...editingAccount, isActive: e.target.checked })
                      }
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                    />
                    <label htmlFor="account-active-check" className="text-xs font-medium text-gray-700">
                      Active Account (Visible in transactions &amp; dropdowns)
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setEditingAccount(null)}
                      className="btn-secondary text-xs py-2 px-3.5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={coaActionLoading}
                      className="btn-primary text-xs py-2 px-4"
                    >
                      {coaActionLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── 6. JOURNAL VOUCHERS / DAILY TRANSACTIONS ── */
    if (activeModule === 'journal_voucher' || activeModule === 'daily_transactions') {
      return (
        <div className="space-y-5 animate-fade-in">
          {/* ── NEW JOURNAL VOUCHER CREATION FORM CARD (AS PER SPEC SCREENSHOT) ── */}
          <div className="card p-5 border-t-4 border-t-emerald-500 shadow-sm bg-white rounded-xl space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">New Journal Voucher</h3>
                <span className="text-[11px] text-slate-500">
                  Roznamcha (Non-cash transactions, error adjustments, opening balances &amp; end-of-period entries)
                </span>
              </div>
            </div>

            {/* Notification message */}
            {jvNotice && (
              <div
                className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between ${
                  jvNotice.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <span>{jvNotice.text}</span>
                <button type="button" onClick={() => setJvNotice(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Top Form Controls: Date & Memo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Voucher Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={jvDate}
                    onChange={(e) => setJvDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">General Description</label>
                <input
                  type="text"
                  value={jvNarration}
                  onChange={(e) => setJvNarration(e.target.value)}
                  placeholder="Write overall voucher memo here..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Dynamic Account Lines */}
            <div className="space-y-3 pt-2">
              {jvLines.map((line) => {
                const isDebit = line.type === 'DEBIT';
                return (
                  <div
                    key={line.id}
                    className={`rounded-xl p-3 border transition-all ${
                      isDebit
                        ? 'border-amber-300 bg-amber-50/30'
                        : 'border-blue-300 bg-blue-50/30'
                    }`}
                  >
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
                      {/* Account Selector */}
                      <div className="flex-1 min-w-[240px]">
                        <select
                          value={line.accountCode}
                          onChange={(e) => updateJvLine(line.id, 'accountCode', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                        >
                          <option value="">Select Account</option>
                          {chartAccounts.map((acc) => (
                            <option key={acc.id} value={acc.accountCode}>
                              {acc.accountCode} - {acc.accountName} ({acc.category})
                            </option>
                          ))}
                        </select>
                        <div className="text-[11px] text-slate-500 mt-1 pl-1 font-mono font-medium">
                          Balance: {getAccountBalanceDisplay(line.accountCode)}
                        </div>
                      </div>

                      {/* Type Badge Button (Clickable to switch between DEBIT and CREDIT) */}
                      <button
                        type="button"
                        onClick={() => toggleJvLineType(line.id)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition shadow-sm select-none ${
                          isDebit
                            ? 'bg-[#b45309] hover:bg-[#9a3412] text-white'
                            : 'bg-[#1d4ed8] hover:bg-[#1e40af] text-white'
                        }`}
                        title="Click to toggle between Debit and Credit"
                      >
                        {line.type}
                      </button>

                      {/* Amount Input */}
                      <div className="w-36">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.amount}
                          onChange={(e) => updateJvLine(line.id, 'amount', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none text-right focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => removeJvLine(line.id)}
                        disabled={jvLines.length <= 2}
                        className="p-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white rounded-lg transition shadow-sm flex items-center justify-center"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Row / Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => addJvLine()}
                className="px-4 py-2.5 bg-[#334155] hover:bg-[#1e293b] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Account Line
              </button>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block tracking-wider uppercase">
                    VOUCHER EQUILIBRIUM
                  </span>
                  <div className="font-mono text-xs font-bold mt-0.5">
                    <span className="text-[#b45309]">
                      Dr {totalJvDebit.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-slate-300 mx-1.5">|</span>
                    <span className="text-[#1d4ed8]">
                      Cr {totalJvCredit.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveJv}
                  disabled={jvActionLoading || !isJvEquilibrium}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm transition ${
                    isJvEquilibrium
                      ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${jvActionLoading ? 'animate-spin' : ''}`} />
                  {jvActionLoading ? 'Saving...' : 'Save Voucher'}
                </button>
              </div>
            </div>
          </div>

          {/* ── DOUBLE-ENTRY JOURNAL ENTRIES LEDGER ── */}
          <div className="card overflow-hidden shadow-sm bg-white rounded-xl">
            <div className="card-header flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" />
                <h3 className="section-title">Double-Entry Journal Entries Ledger</h3>
                <span className="text-xs text-gray-400">({filteredJournals.length} entries)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search entry #, narration..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input py-1 text-xs w-48"
                />
                <button onClick={() => loadData()} className="btn-secondary text-xs px-2.5 py-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
            </div>
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">Entry #</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Reference</th>
                  <th className="table-th">Narration</th>
                  <th className="table-th text-right">Debit</th>
                  <th className="table-th text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {filteredJournals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-td text-center text-gray-400 py-8 italic">
                      Koi Journal Entry nahi mili.
                    </td>
                  </tr>
                ) : (
                  filteredJournals.map((j) => (
                    <tr key={j.id} className="table-row">
                      <td className="table-td font-mono font-bold text-brand-600">{j.entryNumber}</td>
                      <td className="table-td text-gray-500 text-xs">{new Date(j.entryDate).toLocaleDateString()}</td>
                      <td className="table-td text-gray-500 font-mono text-xs">{j.referenceNumber || '—'}</td>
                      <td className="table-td text-gray-700 font-medium text-xs">{j.narration}</td>
                      <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {j.totalDebit}</td>
                      <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {j.totalCredit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="page-wrapper">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">
            <BookOpen className="w-5 h-5 text-brand-600" />
            Complete Accounting System
          </h1>
          <p className="page-subtitle">
            Cash Book • Profit &amp; Loss • Trial Balance • Balance Sheet • Double-entry General Ledger
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowYearEndModal(true)}
            className="btn-secondary text-xs flex items-center gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 cursor-pointer"
            title="Year-End Closing: Net Profit ko Owner Capital ya Retained Earnings mein shift karein"
          >
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            Year-End Closing
          </button>
          <button onClick={handleExportCsv} className="btn-secondary">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button onClick={printDocument} className="btn-secondary">
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          <button onClick={() => loadData()} className="btn-primary">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Business Stream Master Switcher (Own Trading vs Commission Agency vs Consolidated) ── */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Khaata &amp; Accounting Stream</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                businessSegment === 'ALL'
                  ? 'bg-slate-100 text-slate-700'
                  : businessSegment === 'OWN'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-violet-100 text-violet-800'
              }`}>
                {businessSegment === 'ALL' ? 'Consolidated (Mukammal)' : businessSegment === 'OWN' ? 'Apna Maal (Own Trading)' : 'Commission Agency (Amanat)'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Apna Maal (Dukan/Own Stock) aur Commission/Amanat Maal ka hisaab alag alag ya ikatha control karein
            </p>
          </div>
        </div>

        {/* The 3-way toggle switch */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setBusinessSegment('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              businessSegment === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
            }`}
          >
            <span>Tamam Accounts</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${businessSegment === 'ALL' ? 'bg-slate-700 text-slate-200' : 'bg-gray-200 text-gray-700'}`}>
              {segmentCounts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBusinessSegment('OWN')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              businessSegment === 'OWN'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span>🛒 Apna Maal</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${businessSegment === 'OWN' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {segmentCounts.own}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBusinessSegment('CONSIGNMENT')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              businessSegment === 'CONSIGNMENT'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'
            }`}
          >
            <span>📋 Commission / Amanat</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${businessSegment === 'CONSIGNMENT' ? 'bg-violet-500 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {segmentCounts.comm}
            </span>
          </button>
        </div>
      </div>

      {/* ── Global Date-to-Date Accounting Period Filter Bar ── */}
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" />
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
            Tareekh Ka Intekhab (Date Range):
          </span>
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-[11px] text-gray-400 font-medium">Kab Se:</span>
            <input
              type="date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter((d) => ({ ...d, start: e.target.value }))}
              className="border border-gray-300 rounded px-2.5 py-1 text-xs font-mono font-medium focus:ring-1 focus:ring-brand-500 outline-none"
            />
            <span className="text-[11px] text-gray-400 font-medium">Kab Tak:</span>
            <input
              type="date"
              value={dateFilter.end}
              onChange={(e) => {
                setDateFilter((d) => ({ ...d, end: e.target.value }));
                setTbAsOfDate(e.target.value);
              }}
              className="border border-gray-300 rounded px-2.5 py-1 text-xs font-mono font-medium focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>

        {/* Quick Date Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setDateFilter({ start: today, end: today });
              setTbAsOfDate(today);
            }}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
          >
            Aaj (Today)
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
              const today = now.toISOString().split('T')[0];
              setDateFilter({ start: firstDay, end: today });
              setTbAsOfDate(today);
            }}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
          >
            Is Mahine (This Month)
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
              const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
              setDateFilter({ start: firstDayPrev, end: lastDayPrev });
              setTbAsOfDate(lastDayPrev);
            }}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
          >
            Pichla Mahina (Last Month)
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setDateFilter({ start: '', end: today });
              setTbAsOfDate(today);
            }}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold transition"
          >
            Mukammal (All Time)
          </button>
          <button
            type="button"
            onClick={() => loadData()}
            className="px-2.5 py-1 rounded text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition flex items-center gap-1 ml-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh All
          </button>
        </div>
      </div>

      {/* ── Accounting Modules Grid (6 Core Financial Pillars) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {ACCOUNT_MODULES.map((mod) => {
          const Icon = mod.icon;
          const isActive = activeModule === mod.id;
          return (
            <button
              key={mod.id}
              onClick={() => handleModuleClick(mod.id)}
              className={`module-card bg-gradient-to-br ${mod.bgClass} ${
                isActive ? 'ring-2 ring-offset-2 ring-offset-white ring-gray-400 scale-[1.02]' : ''
              }`}
            >
              <div className="module-card-icon">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <span className="module-card-label">{mod.label}</span>
              <span className="text-[10px] text-white/80">{mod.urduLabel}</span>
              {isActive && (
                <span className="text-[9px] text-white font-bold uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-full mt-1">
                  Active ▲
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Detail Panel ── */}
      {activeModule && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <BookOpen className="w-3.5 h-3.5 text-brand-600" />
            <span>Accounting</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-bold">
              {ACCOUNT_MODULES.find((m) => m.id === activeModule)?.label}
            </span>
            <span className="text-gray-400">
              ({ACCOUNT_MODULES.find((m) => m.id === activeModule)?.urduLabel})
            </span>
          </div>
          {renderModuleContent()}
        </div>
      )}

      {/* ─── MODAL A: Day-End Rokar (Galla Closing & Reconciliation) ─── */}
      {showRokarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
                  🌙
                </div>
                <div>
                  <h3 className="text-base font-bold">Day-End Rokar (Galla Closing)</h3>
                  <p className="text-xs text-emerald-200">Shaam Ka Galla Count &amp; Reconciliation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRokarModal(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Date Selector */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-700">Rokar Date (Taareekh):</label>
                <input
                  type="date"
                  value={rokarDate}
                  onChange={(e) => setRokarDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* System Summary */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] uppercase font-bold text-emerald-700">Today's Inflow</div>
                  <div className="text-sm font-bold font-mono text-emerald-800 mt-0.5">Rs. {fmt(rokarStats.todayIn)}</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-[10px] uppercase font-bold text-rose-700">Today's Outflow</div>
                  <div className="text-sm font-bold font-mono text-rose-800 mt-0.5">Rs. {fmt(rokarStats.todayOut)}</div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="text-[10px] uppercase font-bold text-blue-700">System Till (1010)</div>
                  <div className="text-sm font-bold font-mono text-blue-800 mt-0.5">Rs. {fmt(rokarStats.systemTillBalance)}</div>
                </div>
              </div>

              {/* Physical Cash Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  Actual Cash Counted in Till / Galla (Asal Naqad Raqam) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-sm font-bold text-slate-400">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={physicalCashCounted}
                    onChange={(e) => setPhysicalCashCounted(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border-2 border-slate-300 focus:border-emerald-500 text-lg font-mono font-bold text-slate-900 outline-none"
                    autoFocus
                  />
                </div>
                <span className="text-[11px] text-slate-500">Galla mein majood kul currency notes aur coins ka total yahan darj karein.</span>
              </div>

              {/* Difference / Result Banner */}
              {physicalCashCounted !== '' && (
                <div
                  className={`p-4 rounded-xl border ${
                    rokarStats.isTally
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : rokarStats.diff > 0
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 font-bold text-sm">
                    {rokarStats.isTally ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>Zabardast! Galla 100% Tally Hai (Zero Variance)!</span>
                      </>
                    ) : rokarStats.diff > 0 ? (
                      <>
                        <TrendingUp className="w-5 h-5 text-sky-600" />
                        <span>Cash Surplus (Galla Ziyada Hai): +Rs. {rokarStats.diff.toFixed(2)}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                        <span>Cash Shortage (Galla Kam Hai): -Rs. {Math.abs(rokarStats.diff).toFixed(2)}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs mt-1 text-slate-600 font-mono">
                    Counted: Rs. {rokarStats.physical.toFixed(2)} vs System: Rs. {rokarStats.systemTillBalance.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRokarModal(false);
                  setPhysicalCashCounted('');
                }}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DRAWER B: General Ledger Drill-Down (Account Transaction History) ─── */}
      {drilldownAccount && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col border-l border-slate-200">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white">
                  <BookMarked className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      [{drilldownAccount.code}]
                    </span>
                    <h3 className="font-bold text-sm text-white">{drilldownAccount.name}</h3>
                    {drilldownAccount.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-white/20 text-white">
                        {drilldownAccount.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">Detailed Transaction Ledger &amp; Running Balance</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrilldownAccount(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary KPI Strip */}
            {drilldownAccount.data?.account && (
              <div className="bg-slate-100 p-3 border-b border-slate-200 grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Opening Balance</div>
                  <div className="font-mono font-bold text-slate-800 mt-0.5">Rs. {drilldownAccount.data.account.openingBalance}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Debit</div>
                  <div className="font-mono font-bold text-amber-700 mt-0.5">Rs. {drilldownAccount.data.account.totalDebit}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Credit</div>
                  <div className="font-mono font-bold text-blue-700 mt-0.5">Rs. {drilldownAccount.data.account.totalCredit}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Current Balance</div>
                  <div className="font-mono font-bold text-emerald-700 mt-0.5">Rs. {drilldownAccount.data.account.currentBalance}</div>
                </div>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4">
              {drilldownAccount.loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand-600" />
                  <span className="text-xs">Loading ledger entries...</span>
                </div>
              ) : !drilldownAccount.data?.lines || drilldownAccount.data.lines.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-xs italic">
                  Is account mein abhi tak koi journal transaction record nahi hui.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <table className="table-base w-full">
                    <thead className="table-head sticky top-0 bg-slate-800 text-white text-[11px]">
                      <tr>
                        <th className="table-th text-white">Date</th>
                        <th className="table-th text-white">Entry #</th>
                        <th className="table-th text-white">Ref</th>
                        <th className="table-th text-white">Narration</th>
                        <th className="table-th text-right text-amber-300">Debit (Dr)</th>
                        <th className="table-th text-right text-sky-300">Credit (Cr)</th>
                        <th className="table-th text-right text-emerald-300">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {drilldownAccount.data.lines.map((ln: any) => (
                        <tr key={ln.id} className="hover:bg-slate-50 transition">
                          <td className="table-td text-slate-600 whitespace-nowrap">
                            {new Date(ln.entryDate).toLocaleDateString()}
                          </td>
                          <td className="table-td font-mono font-bold text-brand-600 whitespace-nowrap">
                            {ln.entryNumber}
                          </td>
                          <td className="table-td text-slate-500 font-mono text-[11px] whitespace-nowrap">
                            {ln.referenceType || '—'}
                          </td>
                          <td className="table-td text-slate-700 max-w-[200px] truncate" title={ln.narration}>
                            {ln.narration}
                          </td>
                          <td className="table-td text-right font-mono font-bold text-amber-800">
                            {parseFloat(ln.debit) > 0 ? `Rs. ${ln.debit}` : '—'}
                          </td>
                          <td className="table-td text-right font-mono font-bold text-blue-800">
                            {parseFloat(ln.credit) > 0 ? `Rs. ${ln.credit}` : '—'}
                          </td>
                          <td className="table-td text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                            Rs. {ln.runningBalance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-500">
                Total {drilldownAccount.data?.lines?.length || 0} transactions
              </span>
              <button
                type="button"
                onClick={() => setDrilldownAccount(null)}
                className="btn-secondary text-xs cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL C: Year-End Financial Closing ─── */}
      {showYearEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-r from-amber-700 to-amber-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
                  <Lock className="w-6 h-6 text-amber-200" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Saalana Financial Closing</h3>
                  <p className="text-xs text-amber-200">Year-End Net Profit / Loss Transfer to Capital</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowYearEndModal(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteYearEndClosing} className="p-6 space-y-4">
              {/* Info Box */}
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2.5">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Mandi Double-Entry Rule:</strong> Saal ke ikhtitaam par Profit &amp; Loss ka mukammal balance (Net Profit) Equity / Capital mein muntaqil kia jata hai taakay naay maali saal mein aamad o kharch naye siray se shuru ho sakein.
                </div>
              </div>

              {/* Current Net Profit Highlight */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Current Period Net Profit</span>
                <div className={`text-2xl font-bold font-mono mt-1 ${parseFloat(pnl?.netProfit || '0') >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  Rs. {pnl?.netProfit || '0.00'}
                </div>
              </div>

              {/* Closing Date */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Closing Date (Taareekh):</label>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="form-input text-xs font-mono font-bold"
                  required
                />
              </div>

              {/* Target Account */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Transfer Target Account (Khatay Mein Muntaqil Karein):</label>
                <select
                  value={closingTargetCode}
                  onChange={(e) => setClosingTargetCode(e.target.value as any)}
                  className="form-select text-xs font-medium"
                >
                  <option value="3010">3010 - Owner Capital (Maalik Ka Sarmaya)</option>
                  <option value="3040">3040 - Retained Earnings (Prior Years' Profit / Bachat)</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Voucher Notes / Narration:</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="e.g. FY 2025-2026 Annual Closing Net Profit Transfer"
                  className="form-input text-xs"
                />
              </div>

              {/* Notice Message */}
              {closingNotice && (
                <div
                  className={`p-3 rounded-lg text-xs font-bold flex items-center gap-2 ${
                    closingNotice.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {closingNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{closingNotice.text}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowYearEndModal(false)}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closingLoading || !pnl || parseFloat(pnl.netProfit) === 0}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Lock className={`w-3.5 h-3.5 ${closingLoading ? 'animate-spin' : ''}`} />
                  {closingLoading ? 'Processing Closing...' : 'Execute Year-End Closing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal — avoids native window.confirm Electron input freeze */}
      <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
};
