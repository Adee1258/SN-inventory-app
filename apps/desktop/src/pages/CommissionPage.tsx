import React, { useEffect, useState, useCallback } from 'react';
import {
  Percent, CheckCircle, AlertCircle, Package,
  TrendingUp, Receipt, Trash2, Plus, RefreshCw,
  BadgeCheck, BarChart3, Wallet, ChevronDown,
  ChevronUp, User, Search, Filter, Phone, MapPin, Users, Edit2, DollarSign
} from 'lucide-react';
import { api } from '../api/client.js';

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
interface ExistingSupplier {
  id: number;
  name: string;
  code: string;
  phone?: string;
  address?: string;
  currentBalanceConsignment: string;
}

interface ExistingItem {
  id: number;
  name: string;
  code: string;
  baseUnit: { id: number; name: string; symbol?: string };
}

interface Unit {
  id: number;
  name: string;
  code: string;
  symbol: string;
  isBaseUnit: boolean;
}

interface CashAccount {
  id: number;
  accountName: string;
  accountType: string;
  currentBalance: string;
}

interface SupplierSection {
  supplierId: number;
  supplierName: string;
  supplierCode: string;
  supplierPhone?: string;
  supplierAddress?: string;
  commissionPercentage: string;
  currentBalanceConsignment: string;
  hasExhaustedItems: boolean;
  allItemsExhausted: boolean;
  totalReceivedQty?: string;
  totalSoldQty?: string;
  totalRemainingQty?: string;
  totalSoldAmount: string;
  totalCommissionEarned: string;
  totalSupplierPayable: string;
  totalSettled?: string;
  totalSupplierExpenses?: string;
  netCommissionFromSupplier?: string;
  totalReferenceValue?: string;
  receipts?: {
    id: number;
    receiptNumber: string;
    receiptDate: string;
    notes?: string;
    totalValue: string;
    items: {
      id: number;
      itemId: number;
      itemName: string;
      enteredQuantity: string;
      enteredUnitName: string;
      referenceRate: string;
      totalItemValue: string;
    }[];
  }[];
  items: {
    itemId: number;
    itemName: string;
    itemCode: string;
    totalReceived: string;
    totalSold: string;
    totalRemaining: string;
    unit: string;
    isExhausted: boolean;
    referenceRate?: string;
    totalReferenceValue?: string;
  }[];
}

interface Expense {
  id: number;
  expenseDate: string;
  description: string;
  amount: string;
  category: string;
  supplierId?: number | null;
  supplierName?: string | null;
}

interface FinalSummary {
  totalSoldAmount: string;
  totalCommissionEarned: string;
  totalSupplierPayable: string;
  totalExpenses: string;
  totalSettledToSuppliers: string;
  netCommission: string;
  pendingSupplierPayable: string;
}

interface ExpenseSlot {
  id: string;
  description: string;
  amount: string;
}

const blankExpenseSlot = (): ExpenseSlot => ({
  id: Math.random().toString(36).substring(2, 9),
  description: '',
  amount: '',
});

type View = 'intake' | 'sections' | 'suppliers' | 'expenses' | 'summary';

const EXPENSE_CATS = [
  { v: 'LOADING', l: 'Loading / Unloading' },
  { v: 'LABOUR', l: 'Labour (Mazdoori)' },
  { v: 'TRANSPORT', l: 'Transport / Bilti' },
  { v: 'RENT', l: 'Kiraya (Shop Rent)' },
  { v: 'ELECTRICITY', l: 'Bijli (Electricity)' },
  { v: 'REPAIR', l: 'Tameer / Repair' },
  { v: 'GENERAL', l: 'Aam Kharcha (General)' },
];

const rs = (n: string | number, d = 2) =>
  'Rs. ' + parseFloat(String(n || 0)).toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtQty = (n: string | number) =>
  parseFloat(String(n || 0)).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/* ═════════════════════════════════════════════════════════════
   COMPONENT
═════════════════════════════════════════════════════════════ */
export const CommissionPage: React.FC = () => {
  const [view, setView] = useState<View>('intake');
  const [suppliers, setSuppliers] = useState<ExistingSupplier[]>([]);
  const [items, setItems] = useState<ExistingItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sections, setSections] = useState<SupplierSection[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<FinalSummary | null>(null);
  const [expandedSup, setExpandedSup] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Supplier filter & search in Tab 2 & 3
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'BAQI' | 'EXHAUSTED'>('ALL');

  /* ── Intake form ── */
  const [supMode, setSupMode] = useState<'existing' | 'new'>('existing');
  const [supId, setSupId] = useState(0);
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddr, setSupAddr] = useState('');

  const [itmMode, setItmMode] = useState<'existing' | 'new'>('existing');
  const [itmId, setItmId] = useState(0);
  const [itmName, setItmName] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<number>(0);
  const [unitName, setUnitName] = useState('KG');
  const [qty_, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [extra, setExtra] = useState('');
  const [desc, setDesc] = useState('Bilti');
  const [comPct, setComPct] = useState('2');
  const [iDate, setIDate] = useState(new Date().toISOString().split('T')[0]);

  /* ── Edit Receipt Modal State ── */
  const [editReceipt, setEditReceipt] = useState<{
    id: number; receiptNumber: string; receiptDate: string; notes: string; referenceRate: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  /* ── Multi-slot Expense form ── */
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expSupplierId, setExpSupplierId] = useState<number>(0);
  const [expCategory, setExpCategory] = useState<string>('LOADING');
  const [expenseSlots, setExpenseSlots] = useState<ExpenseSlot[]>([blankExpenseSlot()]);
  const [expLoading, setExpLoading] = useState(false);

  /* ── Tab 4: Expense grouping & view mode ── */
  const [expenseViewMode, setExpenseViewMode] = useState<'grouped' | 'list'>('grouped');
  const [expandedExpGroup, setExpandedExpGroup] = useState<string | null>(null);

  /* ── Tab 5: Selected supplier for Hisaab ── */
  const [summarySupplierId, setSummarySupplierId] = useState<string>('all');

  /* ── Load base data ── */
  const loadBase = useCallback(async () => {
    try {
      const [s, i, u] = await Promise.all([
        api.get<ExistingSupplier[]>('/parties/suppliers'),
        api.get<ExistingItem[]>('/items'),
        api.get<Unit[]>('/items/units'),
      ]);
      setSuppliers(s);
      setItems(i);
      setUnits(u);

      if (s.length) setSupId(s[0].id);
      if (i.length) setItmId(i[0].id);
      if (u.length) {
        const base = u.find((x) => x.isBaseUnit) || u[0];
        setSelectedUnitId(base.id);
        setUnitName(base.name);
      }
    } catch { }
  }, []);

  const loadSections = useCallback(async () => {
    try {
      const data = await api.get<SupplierSection[]>('/commission/supplier-dashboard');
      setSections(data);
    } catch { }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      setExpenses(await api.get<Expense[]>('/commission/expenses'));
    } catch { }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.get<FinalSummary>('/commission/final-summary'));
    } catch { }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => {
    if (view === 'sections' || view === 'suppliers') loadSections();
    if (view === 'expenses') loadExpenses();
    if (view === 'summary') {
      loadSections();
      loadExpenses();
      loadSummary();
    }
  }, [view, loadSections, loadExpenses, loadSummary]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 6000);
  };

  /* Auto-computed total */
  const autoTotal = ((parseFloat(qty_) || 0) * (parseFloat(price) || 0) + (parseFloat(extra) || 0)).toFixed(2);

  /* ── Submit intake ── */
  const handleIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await api.post<{
        supplierName: string;
        itemName: string;
        receiptNumber: string;
        quantity: string;
        unit: string;
        commissionPercentage: string;
      }>('/commission/intake', {
        supplierMode: supMode,
        supplierId: supMode === 'existing' ? supId : undefined,
        supplierName: supMode === 'new' ? supName.trim() : undefined,
        supplierPhone: supMode === 'new' ? supPhone.trim() : undefined,
        supplierAddress: supMode === 'new' ? supAddr.trim() : undefined,
        itemMode: itmMode,
        itemId: itmMode === 'existing' ? itmId : undefined,
        itemName: itmMode === 'new' ? itmName.trim() : undefined,
        unitId: selectedUnitId > 0 ? selectedUnitId : undefined,
        unitName: unitName.trim() || undefined,
        quantity: qty_,
        pricePerUnit: price || undefined,
        extraCharges: extra || undefined,
        description: desc || undefined,
        commissionPercentage: comPct,
        intakeDate: iDate,
      });

      flash(true, `✅ Maal Daakhil Ho Gaya! Supplier: ${res.supplierName} | Item: ${res.itemName} (${res.quantity} ${res.unit}) | Receipt: ${res.receiptNumber}`);
      setItmName('');
      setQty('');
      setPrice('');
      setExtra('');
      setDesc('Bilti');
      if (supMode === 'new') {
        setSupName('');
        setSupPhone('');
        setSupAddr('');
      }
      await loadBase();
      await loadSections();
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Error aayi');
    } finally {
      setLoading(false);
    }
  };

  /* ── Edit Receipt: open modal ── */
  const openEditReceipt = (r: { id: number; receiptNumber: string; receiptDate: string; notes?: string; totalValue: string }) => {
    setEditReceipt({
      id: r.id,
      receiptNumber: r.receiptNumber,
      receiptDate: r.receiptDate,
      notes: r.notes || '',
      referenceRate: '',
    });
  };

  /* ── Edit Receipt: submit ── */
  const handleEditReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editReceipt) return;
    setEditLoading(true);
    try {
      await api.put(`/commission/receipts/${editReceipt.id}`, {
        receiptDate: editReceipt.receiptDate,
        notes: editReceipt.notes,
        referenceRate: editReceipt.referenceRate || undefined,
      });
      flash(true, `✅ Receipt ${editReceipt.receiptNumber} update ho gayi!`);
      setEditReceipt(null);
      await loadSections();
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Edit karne me error aayi');
    } finally {
      setEditLoading(false);
    }
  };

  /* ── Delete Receipt ── */
  const handleDeleteReceipt = async (id: number, receiptNumber: string) => {
    if (
      !confirm(
        `Receipt "${receiptNumber}" delete karein?\n\nIs se jura tamam maal, bilti aur kharche delete ho jayenge. Agar is supplier ka koi aur maal nahi hoga to supplier ka khata bhi saaf ho jayega.`
      )
    )
      return;
    try {
      await api.delete(`/commission/receipts/${id}`);
      flash(true, `✅ Receipt ${receiptNumber} aur iske kharche delete ho gaye!`);
      await loadSections();
      await loadExpenses();
      if (view === 'summary') await loadSummary();
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Delete nahi hua — shayad is maal mein se sale ho chuki hai');
    }
  };

  /* ── Delete Commission Supplier & All Linked Records ── */
  const handleDeleteSupplier = async (id: number, supplierName: string) => {
    if (
      !confirm(
        `Kya aap Commission Supplier "${supplierName}" ko mukammal delete karna chahte hain?\n\nIs se jura tamam maal, bilti, kharche aur agreements mukammal khatam ho jayenge.`
      )
    )
      return;
    try {
      await api.delete(`/commission/suppliers/${id}`);
      flash(true, `✅ Supplier "${supplierName}" aur iske tamam kharche/records delete ho gaye!`);
      await loadSections();
      await loadExpenses();
      if (view === 'summary') await loadSummary();
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Supplier delete nahi ho saka');
    }
  };

  /* ── Multi-slot Expense helpers ── */
  const addExpenseSlot = () => {
    setExpenseSlots((prev) => [...prev, blankExpenseSlot()]);
  };

  const removeExpenseSlot = (id: string) => {
    if (expenseSlots.length > 1) {
      setExpenseSlots((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const updateExpenseSlot = (id: string, patch: Partial<ExpenseSlot>) => {
    setExpenseSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const totalSlotsAmount = expenseSlots.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);

  /* ── Submit multi-slot expenses ── */
  const handleBatchExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validSlots = expenseSlots.filter((s) => s.description.trim() && parseFloat(s.amount) > 0);
    if (validSlots.length === 0) {
      flash(false, 'Kam az kam aik kharche ki tafseel aur amount likhein');
      return;
    }

    setExpLoading(true);
    setMsg(null);
    try {
      const selectedSup = sections.find((sup) => sup.supplierId === expSupplierId);
      const notesVal = expSupplierId > 0 && selectedSup
        ? `SUPPLIER_ID:${expSupplierId}|SUPPLIER_NAME:${selectedSup.supplierName}`
        : undefined;

      const payload = validSlots.map((s) => ({
        expenseDate: expDate,
        category: expCategory,
        description: s.description.trim(),
        amount: s.amount,
        notes: notesVal,
      }));

      await api.post('/commission/expenses', { expenses: payload });
      flash(true, `✅ ${validSlots.length} Kharche Kamyabi Se Save Ho Gaye (Total: Rs. ${totalSlotsAmount.toFixed(2)})!`);
      setExpenseSlots([blankExpenseSlot()]);
      await loadExpenses();
      if (view === 'summary') await loadSummary();
      await loadSections();
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Kharche save karne me error aayi');
    } finally {
      setExpLoading(false);
    }
  };

  const deleteExpense = async (id: number) => {
    if (!confirm('Kya aap waqai is kharche ko delete karna chahte hain?')) return;
    try {
      await api.delete(`/commission/expenses/${id}`);
      await loadExpenses();
      if (view === 'summary') await loadSummary();
      await loadSections();
    } catch (err) {
      flash(false, 'Delete karne me error aayi');
    }
  };

  /* ── Filtered sections for Tab 2 & 3 ── */
  const filteredSections = sections.filter((s) => {
    const matchSearch = searchQuery.trim() === '' ||
      s.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.supplierCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.supplierPhone && s.supplierPhone.includes(searchQuery)) ||
      s.items.some((i) => i.itemName.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchSearch) return false;
    if (statusFilter === 'EXHAUSTED') return s.allItemsExhausted;
    if (statusFilter === 'BAQI') return !s.allItemsExhausted;
    return true;
  });

  // Commission suppliers total metrics for small dashboard
  const totalCommissionSuppliersCount = sections.length;
  const totalPayableToAllSuppliers = sections.reduce((acc, s) => acc + (parseFloat(s.currentBalanceConsignment) || 0), 0);
  const totalSettledToAllSuppliers = sections.reduce((acc, s) => acc + (parseFloat(s.totalSettled || '0') || 0), 0);
  const totalMaalSoldValue = sections.reduce((acc, s) => acc + (parseFloat(s.totalSoldAmount) || 0), 0);

  /* ── Grouped Expenses for Tab 4 (Right Side) ── */
  const groupedExpenses = React.useMemo(() => {
    const map = new Map<string, {
      key: string;
      supplierId: number | null;
      supplierName: string;
      totalAmount: number;
      items: Expense[];
    }>();

    for (const exp of expenses) {
      const key = exp.supplierId ? `sup_${exp.supplierId}` : 'general';
      const name = exp.supplierName || 'Aam Dukan Kharcha (General)';
      if (!map.has(key)) {
        map.set(key, {
          key,
          supplierId: exp.supplierId || null,
          supplierName: name,
          totalAmount: 0,
          items: [],
        });
      }
      const g = map.get(key)!;
      g.totalAmount += parseFloat(exp.amount) || 0;
      g.items.push(exp);
    }

    return Array.from(map.values());
  }, [expenses]);

  /* ── Active Summary for Tab 5 (Per-Supplier vs Overall) ── */
  const activeSummary = React.useMemo(() => {
    if (summarySupplierId === 'all' || !sections.length) {
      return {
        isAll: true,
        title: 'Tamam Suppliers Ka Jama Hisaab',
        soldAmount: summary?.totalSoldAmount || '0.00',
        commissionEarned: summary?.totalCommissionEarned || '0.00',
        expenses: summary?.totalExpenses || '0.00',
        netCommission: summary?.netCommission || '0.00',
        grossPayable: summary?.totalSupplierPayable || '0.00',
        settled: summary?.totalSettledToSuppliers || '0.00',
        pendingPayable: summary?.pendingSupplierPayable || '0.00',
        commissionPercentage: null as string | null,
        supplierName: null as string | null,
        supplierCode: null as string | null,
        items: [] as SupplierSection['items'],
        taggedExpenses: [] as Expense[],
      };
    }

    const sup = sections.find((s) => String(s.supplierId) === summarySupplierId);
    if (!sup) {
      return {
        isAll: true,
        title: 'Tamam Suppliers Ka Jama Hisaab',
        soldAmount: summary?.totalSoldAmount || '0.00',
        commissionEarned: summary?.totalCommissionEarned || '0.00',
        expenses: summary?.totalExpenses || '0.00',
        netCommission: summary?.netCommission || '0.00',
        grossPayable: summary?.totalSupplierPayable || '0.00',
        settled: summary?.totalSettledToSuppliers || '0.00',
        pendingPayable: summary?.pendingSupplierPayable || '0.00',
        commissionPercentage: null as string | null,
        supplierName: null as string | null,
        supplierCode: null as string | null,
        items: [] as SupplierSection['items'],
        taggedExpenses: [] as Expense[],
      };
    }

    const supExpenses = expenses.filter((e) => e.supplierId === sup.supplierId);

    return {
      isAll: false,
      title: `${sup.supplierName} (${sup.supplierCode}) Ka Hisaab`,
      soldAmount: sup.totalSoldAmount,
      commissionEarned: sup.totalCommissionEarned,
      expenses: sup.totalSupplierExpenses || '0.00',
      netCommission: sup.netCommissionFromSupplier || '0.00',
      grossPayable: sup.totalSupplierPayable,
      settled: sup.totalSettled || '0.00',
      pendingPayable: sup.currentBalanceConsignment,
      commissionPercentage: sup.commissionPercentage,
      supplierName: sup.supplierName,
      supplierCode: sup.supplierCode,
      items: sup.items,
      taggedExpenses: supExpenses,
    };
  }, [summarySupplierId, summary, sections, expenses]);

  /* ── Nav tabs ── */
  const tabs: { key: View; icon: React.ReactNode; label: string; badge?: string }[] = [
    { key: 'intake', icon: <Plus className="w-4 h-4" />, label: '1. Maal Daakhil Karo' },
    { key: 'sections', icon: <Package className="w-4 h-4" />, label: '2. Supplier Sections', badge: sections.length > 0 ? String(sections.length) : undefined },
    { key: 'suppliers', icon: <Users className="w-4 h-4" />, label: '3. Commission Suppliers', badge: sections.length > 0 ? String(sections.length) : undefined },
    { key: 'expenses', icon: <Receipt className="w-4 h-4" />, label: '4. Expenses (Kharche)', badge: expenses.length > 0 ? String(expenses.length) : undefined },
    { key: 'summary', icon: <BarChart3 className="w-4 h-4" />, label: '5. Commission Hisaab' },
  ];

  /* ═════════════════════════════════════════════════════════════
     RENDER
  ═════════════════════════════════════════════════════════════ */
  return (
    <div className="page-wrapper max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="page-title flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Percent className="w-6 h-6 text-green-600" />
            Commission &amp; Consignment Section
          </h1>
          <p className="page-subtitle text-sm text-gray-500 mt-0.5">
            Har supplier ka maal alag rakhein • Sales se automatic hisaab • Net Commission aur Settlements
          </p>
        </div>

        {/* Global summary badge */}
        {summary && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-3.5 py-1.5 rounded-xl shadow-xs">
            <span className="text-xs text-green-800 font-medium">Total Commission:</span>
            <span className="text-sm font-mono font-bold text-green-700">{rs(summary.totalCommissionEarned)}</span>
          </div>
        )}
      </div>

      {/* Flash Message */}
      {msg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 transition-all ${
          msg.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {msg.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-600" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />}
          <span className="text-sm font-medium">{msg.text}</span>
        </div>
      )}

      {/* Navigation Tabs - Green Theme */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all cursor-pointer ${
              view === t.key
                ? 'border-green-600 text-green-700 bg-green-50 shadow-xs'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge && (
              <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                view === t.key ? 'bg-green-200 text-green-900' : 'bg-gray-200 text-gray-700'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═════════════════════════════════════════════════════════════
          TAB 1: MAAL DAAKHIL KARO
      ═════════════════════════════════════════════════════════════ */}
      {view === 'intake' && (
        <form onSubmit={handleIntake} className="max-w-3xl space-y-5 animate-fade-in">
          
          <div className="bg-green-50/80 border border-green-200 rounded-xl p-4 text-xs text-green-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5 text-sm">
              <Package className="w-4 h-4 text-green-600" />
              Consignment Maal Entry (Purchase me nahi jata!)
            </p>
            <p>
              Yahan se daakhil kiya hua maal seedha Sale Section me Consignment ke tor par jata hai.
              Jab ye maal sale hoga to commission khud ba khud count hoga aur supplier ka stock kam hota rahega.
            </p>
          </div>

          {/* Supplier Section */}
          <div className="card p-5 space-y-4 border border-gray-200 rounded-xl shadow-xs bg-white">
            <div className="flex items-center justify-between">
              <h3 className="section-title text-base font-bold text-gray-800 flex items-center gap-2">
                <User className="w-4 h-4 text-green-600" /> Supplier Chunain ya Naya Banayein
              </h3>
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setSupMode('existing')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    supMode === 'existing'
                      ? 'bg-green-600 text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Existing Supplier
                </button>
                <button
                  type="button"
                  onClick={() => setSupMode('new')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    supMode === 'new'
                      ? 'bg-green-600 text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  + Naya Supplier
                </button>
              </div>
            </div>

            {supMode === 'existing' ? (
              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Supplier *</label>
                <select
                  required
                  value={supId}
                  onChange={(e) => setSupId(Number(e.target.value))}
                  className="form-select w-full mt-1"
                >
                  <option value={0} disabled>— Supplier Select Karein —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Supplier Ka Naam *</label>
                  <input
                    required
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    placeholder="e.g. Haji Ahmad"
                    className="form-input w-full mt-1"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Phone Number</label>
                  <input
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    placeholder="03xx-xxxxxxx"
                    className="form-input w-full mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label text-xs font-semibold text-gray-700">Address / Shehar</label>
                  <input
                    value={supAddr}
                    onChange={(e) => setSupAddr(e.target.value)}
                    placeholder="e.g. Grain Market, Faisalabad"
                    className="form-input w-full mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Item & Quantity Section */}
          <div className="card p-5 space-y-4 border border-gray-200 rounded-xl shadow-xs bg-white">
            <div className="flex items-center justify-between">
              <h3 className="section-title text-base font-bold text-gray-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-green-600" /> Item aur Maal ki Tafseel
              </h3>
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setItmMode('existing')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    itmMode === 'existing'
                      ? 'bg-green-600 text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Existing Item
                </button>
                <button
                  type="button"
                  onClick={() => setItmMode('new')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    itmMode === 'new'
                      ? 'bg-green-600 text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  + Naya Item
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {itmMode === 'new' ? (
                <>
                  <div>
                    <label className="form-label text-xs font-semibold text-gray-700">Item ka Naam *</label>
                    <input
                      required
                      value={itmName}
                      onChange={(e) => setItmName(e.target.value)}
                      placeholder="e.g. Darbar Chili / Basmati Chawal"
                      className="form-input w-full mt-1"
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs font-semibold text-gray-700">Quantity Type (Unit) *</label>
                    <select
                      required
                      value={selectedUnitId}
                      onChange={(e) => {
                        const uid = Number(e.target.value);
                        setSelectedUnitId(uid);
                        const found = units.find((u) => u.id === uid);
                        if (found) setUnitName(found.name);
                      }}
                      className="form-select w-full mt-1 font-medium"
                    >
                      <option value={0} disabled>— Unit Select Karein —</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.symbol || u.code}){u.isBaseUnit ? ' — Base Unit' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="form-label text-xs font-semibold text-gray-700">Item Select Karein *</label>
                  <select
                    required
                    value={itmId}
                    onChange={(e) => {
                      const idVal = Number(e.target.value);
                      setItmId(idVal);
                      const found = items.find((i) => i.id === idVal);
                      if (found?.baseUnit) {
                        setSelectedUnitId(found.baseUnit.id);
                        setUnitName(found.baseUnit.name);
                      }
                    }}
                    className="form-select w-full mt-1"
                  >
                    <option value={0} disabled>— Item Chunain —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.baseUnit?.name || 'KG'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Quantity (Miqdaar) *</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0.001"
                  value={qty_}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="e.g. 500"
                  className="form-input w-full mt-1 font-mono font-bold"
                />
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-gray-700">
                  Rate (Rs./{units.find((u) => u.id === selectedUnitId)?.symbol || unitName || 'Unit'}) (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 150.00"
                  className="form-input w-full mt-1 font-mono"
                />
              </div>
            </div>

            {/* Extra charges */}
            <div className="border border-green-200 bg-green-50/50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-green-800 flex items-center gap-1.5 uppercase tracking-wide">
                📦 Extra Charges (Bilti, Freight, Mazdoori)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Extra Amount (Rs.)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    placeholder="e.g. 500.00"
                    className="form-input w-full mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Tafseel (Description)</label>
                  <input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="e.g. Bilti, Freight, Loading"
                    className="form-input w-full mt-1"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Estimated Total Value</label>
                  <div className="form-input w-full mt-1 bg-white font-mono font-bold text-green-700 select-none">
                    Rs. {autoTotal}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-green-700 italic">
                * Agar yahan extra charge likhenge to wo automatically Commission Expenses me is supplier ke hisaab me darj ho jayega.
              </p>
            </div>
          </div>

          {/* Commission & Date */}
          <div className="card p-5 space-y-4 border border-gray-200 rounded-xl shadow-xs bg-white">
            <h3 className="section-title text-base font-bold text-gray-800 flex items-center gap-2">
              <Percent className="w-4 h-4 text-green-600" /> Commission Agreement &amp; Taareekh
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Hamara Commission % *</label>
                <div className="relative mt-1">
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.01"
                    max="100"
                    value={comPct}
                    onChange={(e) => setComPct(e.target.value)}
                    placeholder="e.g. 2"
                    className="form-input w-full font-mono font-bold text-lg pr-9 text-green-700"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">%</span>
                </div>
              </div>
              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Receipt Date *</label>
                <input
                  type="date"
                  required
                  value={iDate}
                  onChange={(e) => setIDate(e.target.value)}
                  className="form-input w-full mt-1"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            {loading ? 'Maal Daakhil Ho Raha Hai...' : 'Maal Daakhil Karo (Consignment Receipt)'}
          </button>
        </form>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB 2: SUPPLIER SECTIONS (CARDS & HISAAB)
      ═════════════════════════════════════════════════════════════ */}
      {view === 'sections' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 border border-gray-200 rounded-xl shadow-xs">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Supplier ya Item ka naam dhoondein..."
                className="form-input pl-9 w-full text-sm"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    statusFilter === 'ALL' ? 'bg-white text-gray-900 font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Sab ({sections.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('BAQI')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    statusFilter === 'BAQI' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Maal Baqi Hai
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('EXHAUSTED')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    statusFilter === 'EXHAUSTED' ? 'bg-white text-green-700 font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Pura Bik Gaya
                </button>
              </div>

              <button
                onClick={loadSections}
                className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg ml-1 cursor-pointer"
                title="Refresh Karein"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          {/* Supplier Cards List */}
          {filteredSections.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 italic bg-white border border-gray-200 rounded-xl">
              {sections.length === 0
                ? 'Abhi tak koi consignment supplier nahi hai. Pehle "1. Maal Daakhil Karo" se entry karein.'
                : 'Diye gaye filter ke mutabiq koi supplier nahi mila.'}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSections.map((s) => {
                const isOpen = expandedSup === s.supplierId;
                const isAllSold = s.allItemsExhausted;

                return (
                  <div
                    key={s.supplierId}
                    className={`card overflow-hidden border-2 transition-all rounded-xl shadow-xs bg-white ${
                      isAllSold ? 'border-green-400 hover:border-green-500' : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    {/* Supplier Card Header */}
                    <div
                      onClick={() => setExpandedSup(isOpen ? null : s.supplierId)}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/70 transition-colors"
                    >
                      {/* Left: Supplier info & Badge */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-green-100 text-green-800">
                          {s.supplierName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-base">{s.supplierName}</span>
                            <span className="text-xs font-mono text-gray-400">({s.supplierCode})</span>
                            
                            {/* Prominent Badge */}
                            {isAllSold ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 border border-green-300 px-2.5 py-0.5 rounded-full">
                                <BadgeCheck className="w-3.5 h-3.5" /> ✅ Pura Maal Bik Gaya
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                                ● Maal Baqi Hai
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Items: {s.items.map((i) => i.itemName).join(', ') || 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Right: Key Figures & Toggle */}
                      <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                        <div className="bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                          <span className="text-green-800">Commission: </span>
                          <strong className="text-green-900 font-mono font-bold">{s.commissionPercentage}%</strong>
                        </div>

                        <div className="bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
                          <span className="text-red-700">Payable (Baqi Dena): </span>
                          <strong className="text-red-800 font-mono font-bold">{rs(s.currentBalanceConsignment)}</strong>
                        </div>

                        <div className="bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                          <span className="text-green-700">Hamara Commission: </span>
                          <strong className="text-green-800 font-mono font-bold">{rs(s.totalCommissionEarned)}</strong>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSupplier(s.supplierId, s.supplierName);
                          }}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title="Is supplier aur iske tamam kharche mukammal delete karein"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>

                        <div className="text-gray-400">
                          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isOpen && (
                      <div className="border-t border-gray-200 bg-gray-50/50 p-4 space-y-4 animate-fade-in">

                        {/* Consignment Receipts (Edit/Delete) */}
                        {s.receipts && s.receipts.length > 0 && (
                          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">📋 Consignment Receipts</span>
                              <span className="text-[11px] text-gray-400">{s.receipts.length} receipt(s)</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {s.receipts.map((r) => (
                                <div key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="text-xs">
                                    <span className="font-bold text-green-700 font-mono mr-2">{r.receiptNumber}</span>
                                    <span className="text-gray-500 mr-2">{r.receiptDate}</span>
                                    {r.items.map((it) => (
                                      <span key={it.id} className="text-gray-700 mr-2">
                                        {it.itemName}: <strong className="font-mono">{it.enteredQuantity} {it.enteredUnitName}</strong>
                                        {parseFloat(it.referenceRate) > 0 && (
                                          <span className="text-orange-600 ml-1">
                                            @ Rs. {parseFloat(it.referenceRate).toFixed(2)}/{it.enteredUnitName}
                                            <span className="text-orange-500 ml-1">(Deal: {rs(it.totalItemValue)})</span>
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                    {r.notes && <span className="text-gray-400 italic">{r.notes}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openEditReceipt(r); }}
                                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                    >
                                      <Edit2 className="w-3 h-3" /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteReceipt(r.id, r.receiptNumber); }}
                                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" /> Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Items Stock Table */}
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                          <table className="table-base w-full text-left text-sm">
                            <thead className="bg-gray-100 text-xs font-semibold text-gray-700 border-b border-gray-200">
                              <tr>
                                <th className="p-3">Item Name</th>
                                <th className="p-3 text-right">Received (Aaya)</th>
                                <th className="p-3 text-right">Sold (Bika)</th>
                                <th className="p-3 text-right">Remaining (Baqi)</th>
                                <th className="p-3 text-right">Deal Rate / Value</th>
                                <th className="p-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {s.items.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-4 text-center text-gray-400 italic">
                                    Koi item nahi hai
                                  </td>
                                </tr>
                              ) : (
                                s.items.map((it) => (
                                  <tr key={it.itemId} className="hover:bg-gray-50/70">
                                    <td className="p-3 font-semibold text-gray-800">
                                      {it.itemName}
                                      <span className="text-xs text-gray-400 font-mono ml-1.5">({it.itemCode})</span>
                                    </td>
                                    <td className="p-3 text-right font-mono text-gray-700">
                                      {fmtQty(it.totalReceived)} {it.unit}
                                    </td>
                                    <td className="p-3 text-right font-mono text-blue-600 font-semibold">
                                      {fmtQty(it.totalSold)} {it.unit}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold">
                                      <span className={parseFloat(it.totalRemaining) <= 0 ? 'text-green-600' : 'text-gray-900'}>
                                        {fmtQty(it.totalRemaining)} {it.unit}
                                      </span>
                                    </td>
                                    <td className="p-3 text-right text-xs">
                                      {it.referenceRate && parseFloat(it.referenceRate) > 0 ? (
                                        <div className="text-orange-700">
                                          <div className="font-semibold">Rs. {parseFloat(it.referenceRate).toFixed(2)}/{it.unit}</div>
                                          {it.totalReferenceValue && parseFloat(it.totalReferenceValue) > 0 && (
                                            <div className="text-orange-500 font-mono text-[11px]">(Deal: {rs(it.totalReferenceValue)})</div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 italic text-[11px]">Rate drj nahi</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      {it.isExhausted ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                          <CheckCircle className="w-3 h-3" /> Khatam
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                          ● Baqi
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Supplier End-of-Batch Hisaab Box */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center justify-between">
                            <span>📊 {s.supplierName} Ka Mukammal Hisaab Kitab</span>
                            {isAllSold && (
                              <span className="text-green-700 font-bold text-xs bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
                                ✅ Sab Maal Bik Chuka Hai
                              </span>
                            )}
                          </p>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
                            <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                              <p className="text-[11px] text-gray-500">Total Bika (Sold)</p>
                              <p className="text-sm font-bold text-gray-900 font-mono mt-0.5">{rs(s.totalSoldAmount)}</p>
                            </div>

                            <div className="p-2.5 rounded-lg bg-green-50 border border-green-100">
                              <p className="text-[11px] text-green-700">Commission ({s.commissionPercentage}%)</p>
                              <p className="text-sm font-bold text-green-800 font-mono mt-0.5">{rs(s.totalCommissionEarned)}</p>
                            </div>

                            <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-100">
                              <p className="text-[11px] text-orange-700">Minus: Kharche (Supplier)</p>
                              <p className="text-sm font-bold text-orange-800 font-mono mt-0.5">
                                {rs(s.totalSupplierExpenses || '0')}
                              </p>
                            </div>

                            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                              <p className="text-[11px] text-blue-700">Supplier Ka Haq (Gross)</p>
                              <p className="text-sm font-bold text-blue-900 font-mono mt-0.5">{rs(s.totalSupplierPayable)}</p>
                            </div>

                            <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-100">
                              <p className="text-[11px] text-purple-700">Diya Gaya (Settled)</p>
                              <p className="text-sm font-bold text-purple-900 font-mono mt-0.5">{rs(s.totalSettled || '0')}</p>
                            </div>

                            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                              <p className="text-[11px] text-red-700 font-semibold">Baqi Payable</p>
                              <p className="text-sm font-bold text-red-700 font-mono mt-0.5">{rs(s.currentBalanceConsignment)}</p>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Payment Reminder Banner (replaces settlement form) ── */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 mt-2">
            <Wallet className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-800">Supplier Ko Paise Dene Hain?</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Commission supplier ko payment karne ke liye <strong>Payment/Vouchers section</strong> mein jayen.
                Wahan "Commission Supplier" mode chunein aur supplier aur amount fill karein. Isse accounting journal automatically post ho jayega.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB 3: COMMISSION SUPPLIERS DIRECTORY & DASHBOARD
      ═════════════════════════════════════════════════════════════ */}
      {view === 'suppliers' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Small Suppliers Dashboard KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 border-l-4 border-l-blue-600 bg-white rounded-xl shadow-xs space-y-1">
              <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                <Users className="w-3.5 h-3.5 text-blue-600" /> Commission Suppliers
              </p>
              <p className="text-2xl font-bold font-mono text-blue-700">{totalCommissionSuppliersCount}</p>
              <p className="text-[11px] text-gray-400">Total active suppliers</p>
            </div>

            <div className="card p-4 border-l-4 border-l-green-600 bg-white rounded-xl shadow-xs space-y-1">
              <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" /> Total Bika Maal (Sale)
              </p>
              <p className="text-2xl font-bold font-mono text-green-700">{rs(totalMaalSoldValue)}</p>
              <p className="text-[11px] text-gray-400">Gross Consignment Sales</p>
            </div>

            <div className="card p-4 border-l-4 border-l-red-500 bg-white rounded-xl shadow-xs space-y-1">
              <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                <DollarSign className="w-3.5 h-3.5 text-red-500" /> Suppliers Ka Baqi Dena (Payable)
              </p>
              <p className="text-2xl font-bold font-mono text-red-600">{rs(totalPayableToAllSuppliers)}</p>
              <p className="text-[11px] text-gray-400">Total Unpaid Balance</p>
            </div>

            <div className="card p-4 border-l-4 border-l-purple-600 bg-white rounded-xl shadow-xs space-y-1">
              <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                <Wallet className="w-3.5 h-3.5 text-purple-600" /> Total Diya Gaya (Settled)
              </p>
              <p className="text-2xl font-bold font-mono text-purple-700">{rs(totalSettledToAllSuppliers)}</p>
              <p className="text-[11px] text-gray-400">Total Paid Out</p>
            </div>
          </div>

          {/* Suppliers Search and Table */}
          <div className="card overflow-hidden border border-gray-200 rounded-xl bg-white shadow-xs">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Supplier ka naam, phone ya code dhoondein..."
                  className="form-input pl-9 w-full text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSections}
                  className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh List
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table-base w-full text-left text-sm">
                <thead className="bg-gray-100 text-xs font-semibold text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="p-3.5">Supplier Profile</th>
                    <th className="p-3.5">Contact &amp; Address</th>
                    <th className="p-3.5 text-center">Comm. %</th>
                    <th className="p-3.5 text-right">Maal (Aaya / Bika / Baqi)</th>
                    <th className="p-3.5 text-right">Total Sale</th>
                    <th className="p-3.5 text-right font-bold text-red-700">Baqi Dena (Paise)</th>
                    <th className="p-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSections.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400 italic">
                        Koi commission supplier nahi mila.
                      </td>
                    </tr>
                  ) : (
                    filteredSections.map((s) => (
                      <tr key={s.supplierId} className="hover:bg-gray-50/80 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-green-100 text-green-800 font-bold flex items-center justify-center text-xs">
                              {s.supplierName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{s.supplierName}</p>
                              <p className="text-xs font-mono text-gray-400">{s.supplierCode}</p>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 text-xs text-gray-600">
                          {s.supplierPhone && (
                            <p className="flex items-center gap-1 font-mono text-gray-700">
                              <Phone className="w-3 h-3 text-gray-400" /> {s.supplierPhone}
                            </p>
                          )}
                          {s.supplierAddress ? (
                            <p className="flex items-center gap-1 text-gray-500 mt-0.5">
                              <MapPin className="w-3 h-3 text-gray-400" /> {s.supplierAddress}
                            </p>
                          ) : (
                            <span className="text-gray-400 italic">No address</span>
                          )}
                        </td>

                        <td className="p-3.5 text-center font-bold text-green-700 font-mono text-xs">
                          {s.commissionPercentage}%
                        </td>

                        <td className="p-3.5 text-right text-xs">
                          <p className="text-gray-600">Aaya: <strong className="text-gray-900 font-mono">{s.totalReceivedQty || '0'}</strong></p>
                          <p className="text-blue-600 font-semibold">Bika: <span className="font-mono">{s.totalSoldQty || '0'}</span></p>
                          <p className="text-green-700 font-bold">Baqi: <span className="font-mono">{s.totalRemainingQty || '0'}</span></p>
                        </td>

                        <td className="p-3.5 text-right font-mono font-semibold text-gray-800">
                          {rs(s.totalSoldAmount)}
                        </td>

                        <td className="p-3.5 text-right font-mono font-bold text-base text-red-600 whitespace-nowrap bg-red-50/40">
                          {rs(s.currentBalanceConsignment)}
                        </td>

                        <td className="p-3.5 text-center">
                          {s.allItemsExhausted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 border border-green-300 px-2 py-0.5 rounded-full">
                              <BadgeCheck className="w-3 h-3" /> Pura Bik Gaya
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              ● Maal Baqi Hai
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center whitespace-nowrap">
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); /* redirect to vouchers */ window.location.hash = '#vouchers'; }}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors"
                            title="Vouchers section mein jayen aur Commission Supplier mode chunein"
                          >
                            <Wallet className="w-3.5 h-3.5" /> Payment Karein
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB 4: EXPENSES (MULTI-SLOT KHARCHE)
      ═════════════════════════════════════════════════════════════ */}
      {view === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          
          {/* Multi-slot Expense Entry Form */}
          <form
            onSubmit={handleBatchExpenseSubmit}
            className="card p-5 border border-gray-200 rounded-xl bg-white shadow-xs space-y-4 lg:col-span-7"
          >
            <div className="border-b border-gray-100 pb-3">
              <h3 className="section-title text-base font-bold text-gray-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-green-600" /> Naye Kharche Darj Karein (Multi-Slots)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Commission supplier aur category select karein, phir neechay asani se slots me tafseel aur amount likhein
              </p>
            </div>

            {/* Top Selection Row: Date, Commission Supplier, Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-green-50/60 p-3.5 border border-green-200 rounded-xl">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Taareekh (Date) *</label>
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="form-input w-full text-xs py-1.5 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Commission Supplier (Optional)
                </label>
                <select
                  value={expSupplierId}
                  onChange={(e) => setExpSupplierId(Number(e.target.value))}
                  className="form-select w-full text-xs py-1.5 font-medium"
                >
                  <option value={0}>— Aam Dukan Kharcha (General) —</option>
                  {sections.map((s) => (
                    <option key={s.supplierId} value={s.supplierId}>
                      {s.supplierName} ({s.supplierCode})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-green-700 font-semibold mt-0.5 block">
                  ✓ Sirf Commission walay suppliers
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Kharcha Category *</label>
                <select
                  required
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="form-select w-full text-xs py-1.5"
                >
                  {EXPENSE_CATS.map((c) => (
                    <option key={c.v} value={c.v}>{c.l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Slots List — ONLY Tafseel aur Amount! */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-gray-700 block uppercase tracking-wide">
                Kharchon Ki List (Tafseel aur Amount)
              </label>

              {expenseSlots.map((slot, idx) => (
                <div
                  key={slot.id}
                  className="p-3 border border-gray-200 bg-gray-50/70 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 transition-all hover:border-green-300"
                >
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="w-6 h-6 rounded-full bg-green-200 text-green-900 flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-gray-700 sm:hidden">Slot #{idx + 1}</span>
                  </div>

                  <div className="flex-1">
                    <input
                      required
                      value={slot.description}
                      onChange={(e) => updateExpenseSlot(slot.id, { description: e.target.value })}
                      placeholder="Kharcha detail / tafseel (e.g. Loading, Mazdoori, Bilti, Chai)"
                      className="form-input w-full text-xs py-2"
                    />
                  </div>

                  <div className="w-full sm:w-36 flex-shrink-0">
                    <input
                      required
                      type="number"
                      step="any"
                      min="0.01"
                      value={slot.amount}
                      onChange={(e) => updateExpenseSlot(slot.id, { amount: e.target.value })}
                      placeholder="Amount (Rs.)"
                      className="form-input w-full text-xs py-2 font-mono font-bold text-red-600"
                    />
                  </div>

                  {expenseSlots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExpenseSlot(slot.id)}
                      className="p-2 text-red-400 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 cursor-pointer self-end sm:self-center"
                      title="Slot Hatayein"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add More Slot Button & Total */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={addExpenseSlot}
                className="px-4 py-2 border-2 border-dashed border-green-400 text-green-700 bg-green-50/50 hover:bg-green-100/60 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> + Aur Kharcha Slot Add Karein
              </button>

              <div className="bg-gray-100 px-4 py-2 rounded-xl text-right flex items-center justify-between sm:justify-end gap-3">
                <span className="text-xs text-gray-600">Slots Total:</span>
                <span className="text-base font-bold font-mono text-red-600">
                  {rs(totalSlotsAmount)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={expLoading}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-sm mt-3"
            >
              <Receipt className="w-4 h-4" />
              {expLoading ? 'Saving...' : `Tamam Kharche Save Karo (${expenseSlots.length} Slots)`}
            </button>
          </form>

          {/* Expenses View (Right Side) — Grouped by Supplier with accordion tap */}
          <div className="card overflow-hidden border border-gray-200 rounded-xl bg-white shadow-xs lg:col-span-5 flex flex-col">
            <div className="card-header p-3.5 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="section-title text-sm font-bold text-gray-800 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-green-600" /> Tamam Kharche
                </h3>
                {/* View toggle */}
                <div className="flex bg-gray-200/80 p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setExpenseViewMode('grouped')}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      expenseViewMode === 'grouped' ? 'bg-white text-green-800 shadow-xs' : 'text-gray-600'
                    }`}
                  >
                    Supplier-wise
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseViewMode('list')}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      expenseViewMode === 'list' ? 'bg-white text-green-800 shadow-xs' : 'text-gray-600'
                    }`}
                  >
                    List
                  </button>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-gray-500">Total: </span>
                <span className="text-sm font-bold font-mono text-red-600">
                  {rs(expenses.reduce((s, e) => s + parseFloat(e.amount), 0))}
                </span>
              </div>
            </div>

            {/* Content: Grouped by Supplier vs Flat List */}
            {expenses.length === 0 ? (
              <div className="p-8 text-center text-gray-400 italic text-sm">
                Abhi koi kharcha darj nahi hai.
              </div>
            ) : expenseViewMode === 'grouped' ? (
              <div className="p-3 space-y-2.5 overflow-y-auto max-h-[550px]">
                {groupedExpenses.map((g) => {
                  const isExp = expandedExpGroup === g.key;
                  return (
                    <div
                      key={g.key}
                      className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs transition-all hover:border-green-300"
                    >
                      {/* Supplier Group Header */}
                      <div
                        onClick={() => setExpandedExpGroup(isExp ? null : g.key)}
                        className="p-3 bg-gray-50/80 hover:bg-green-50/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-green-100 text-green-800 font-bold flex items-center justify-center text-xs flex-shrink-0">
                            {g.supplierName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                              {g.supplierName}
                              <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.2 rounded-full font-bold">
                                {g.items.length} {g.items.length === 1 ? 'Kharcha' : 'Kharche'}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400">Tap karein tafseel dekhne ke liye</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-red-600">
                            {rs(g.totalAmount)}
                          </span>
                          <div className="text-gray-400">
                            {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Expenses Table for this supplier */}
                      {isExp && (
                        <div className="border-t border-gray-200 bg-white animate-fade-in">
                          <table className="table-base w-full text-left text-xs">
                            <thead className="bg-gray-100/80 text-[11px] font-semibold text-gray-600 border-b border-gray-200">
                              <tr>
                                <th className="p-2">Date</th>
                                <th className="p-2">Tafseel (Detail)</th>
                                <th className="p-2">Category</th>
                                <th className="p-2 text-right">Amount</th>
                                <th className="p-2 text-center">Del</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {g.items.map((exp) => (
                                <tr key={exp.id} className="hover:bg-gray-50/70">
                                  <td className="p-2 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                                    {new Date(exp.expenseDate).toLocaleDateString('en-PK')}
                                  </td>
                                  <td className="p-2 font-medium text-gray-800">
                                    {exp.description}
                                  </td>
                                  <td className="p-2">
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                      {EXPENSE_CATS.find((c) => c.v === exp.category)?.l || exp.category}
                                    </span>
                                  </td>
                                  <td className="p-2 text-right font-mono font-bold text-red-600 whitespace-nowrap">
                                    {rs(exp.amount)}
                                  </td>
                                  <td className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteExpense(exp.id);
                                      }}
                                      className="p-1 text-red-400 hover:text-red-700 transition-colors cursor-pointer"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto flex-1 max-h-[550px] overflow-y-auto">
                <table className="table-base w-full text-left text-sm">
                  <thead className="bg-gray-100 text-xs font-semibold text-gray-700 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Detail</th>
                      <th className="p-2.5">Supplier</th>
                      <th className="p-2.5 text-right">Amount</th>
                      <th className="p-2.5 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/70 text-xs">
                        <td className="p-2.5 text-gray-500 whitespace-nowrap">
                          {new Date(exp.expenseDate).toLocaleDateString('en-PK')}
                        </td>
                        <td className="p-2.5 font-medium text-gray-800">
                          {exp.description}
                          <span className="block text-[10px] text-gray-400">
                            {EXPENSE_CATS.find((c) => c.v === exp.category)?.l || exp.category}
                          </span>
                        </td>
                        <td className="p-2.5">
                          {exp.supplierName ? (
                            <span className="text-green-800 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                              {exp.supplierName}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic text-[10px]">Aam</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-red-600 whitespace-nowrap">
                          {rs(exp.amount)}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => deleteExpense(exp.id)}
                            className="p-1 text-red-400 hover:text-red-700 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB 5: COMMISSION HISAAB
      ═════════════════════════════════════════════════════════════ */}
      {view === 'summary' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Supplier Selector Bar for Hisaab */}
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 max-w-lg">
              <label className="text-xs font-bold text-gray-700 whitespace-nowrap flex items-center gap-1.5">
                <Users className="w-4 h-4 text-green-600" /> Kis Supplier Ka Hisaab Dekhna Hai?
              </label>
              <select
                value={summarySupplierId}
                onChange={(e) => setSummarySupplierId(e.target.value)}
                className="form-select text-xs py-1.5 font-bold border-green-300 focus:border-green-600 focus:ring-green-600 flex-1"
              >
                <option value="all">📊 Tamam Suppliers (Overall Jama Hisaab)</option>
                {sections.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    👤 {s.supplierName} ({s.supplierCode}) — Commission: {s.commissionPercentage}%
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {summarySupplierId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSummarySupplierId('all')}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Sab Dekhein (Reset)
                </button>
              )}
              <button
                onClick={() => { loadSummary(); loadExpenses(); loadSections(); }}
                className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Hisaab
              </button>
            </div>
          </div>

          {/* Active Hisaab Heading Banner */}
          <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs ${
            activeSummary.isAll ? 'bg-blue-50/70 border-blue-200 text-blue-900' : 'bg-green-50 border-green-200 text-green-900'
          }`}>
            <div>
              <span className="font-bold text-sm block">{activeSummary.title}</span>
              <span className="text-[11px] text-gray-600">
                {activeSummary.isAll
                  ? 'Tamam consignment suppliers ke beche gaye maal, unke commission aur kharchon ka kul total hisaab'
                  : `Sirf ${activeSummary.supplierName} ka hisaab — is supplier ki sale, commission, aur iske kharche`}
              </span>
            </div>
            {activeSummary.commissionPercentage && (
              <span className="bg-green-200 text-green-900 px-2.5 py-1 rounded-lg font-bold font-mono text-xs">
                Agreement Commission: {activeSummary.commissionPercentage}%
              </span>
            )}
          </div>

          {summary ? (
            <>
              {/* Top 4 KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4 border-l-4 border-l-blue-500 bg-white rounded-xl shadow-xs space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" /> Total Becha Gaya Maal
                  </p>
                  <p className="text-xl font-bold font-mono text-blue-700">{rs(activeSummary.soldAmount)}</p>
                  <p className="text-[11px] text-gray-400">
                    {activeSummary.isAll ? 'Tamam suppliers ka bika maal' : `${activeSummary.supplierName} ka bika maal`}
                  </p>
                </div>

                <div className="card p-4 border-l-4 border-l-green-600 bg-white rounded-xl shadow-xs space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                    <Percent className="w-3.5 h-3.5 text-green-600" /> Total Commission Earned
                  </p>
                  <p className="text-xl font-bold font-mono text-green-700">{rs(activeSummary.commissionEarned)}</p>
                  <p className="text-[11px] text-gray-400">
                    {activeSummary.isAll ? 'Tamam suppliers se' : `${activeSummary.commissionPercentage}% agreement`}
                  </p>
                </div>

                <div className="card p-4 border-l-4 border-l-red-500 bg-white rounded-xl shadow-xs space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                    <Receipt className="w-3.5 h-3.5 text-red-500" /> Kharche (Minus)
                  </p>
                  <p className="text-xl font-bold font-mono text-red-600">{rs(activeSummary.expenses)}</p>
                  <p className="text-[11px] text-gray-400">
                    {activeSummary.isAll ? 'Tamam kharche' : `${activeSummary.supplierName} ke kharche`}
                  </p>
                </div>

                <div className="card p-4 border-l-4 border-l-purple-500 bg-white rounded-xl shadow-xs space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                    <DollarSign className="w-3.5 h-3.5 text-purple-500" /> Supplier Ko Baqi Dena
                  </p>
                  <p className="text-xl font-bold font-mono text-purple-700">{rs(activeSummary.pendingPayable)}</p>
                  <p className="text-[11px] text-gray-400">
                    {activeSummary.isAll ? 'Tamam suppliers ka baqi' : `${activeSummary.supplierName} ka baqi`}
                  </p>
                </div>
              </div>

              {/* The Hisaab Breakdown Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Net Commission Box */}
                <div className="card p-6 border-2 border-green-300 bg-white rounded-2xl shadow-sm space-y-4">
                  <h3 className="section-title text-lg font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                    <Wallet className="w-5 h-5 text-green-600" />
                    Apni Commission Calculation (Poori)
                  </h3>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Total Sale Amount:</span>
                      <span className="font-mono font-bold text-gray-800 text-base">
                        {rs(activeSummary.soldAmount)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">
                        Kharche ({activeSummary.isAll ? 'Tamam Suppliers' : activeSummary.supplierName} ke balance se katay):
                      </span>
                      <span className="font-mono font-bold text-orange-600 text-base">
                        {rs(activeSummary.expenses)} (Supplier Pay)
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-green-50/90 border border-green-300 rounded-xl mt-3">
                      <div>
                        <span className="font-bold text-gray-900 text-base block">Apni Poori Commission</span>
                        <span className="text-xs text-green-700">
                          Kharche supplier ke hisaab se kat&apos;te hain — aap ki commission poori hai
                        </span>
                      </div>
                      <span className="font-mono font-bold text-2xl text-green-700">
                        {rs(activeSummary.commissionEarned)} ✅
                      </span>
                    </div>
                  </div>
                </div>

                {/* Suppliers Settlement Overview */}
                <div className="card p-6 border border-gray-200 bg-white rounded-2xl shadow-sm space-y-4">
                  <h3 className="section-title text-lg font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                    <DollarSign className="w-5 h-5 text-purple-600" />
                    {activeSummary.isAll ? 'Suppliers Settlement Hisaab' : `${activeSummary.supplierName} Settlement Hisaab`}
                  </h3>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Supplier Ka Haq (Gross Payable):</span>
                      <span className="font-mono font-bold text-gray-900">{rs(activeSummary.grossPayable)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Minus: Kharche (Bilti / Labour wagera):</span>
                      <span className="font-mono font-bold text-red-600">− {rs(activeSummary.expenses)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Minus: Diya Gaya (Settled / Paid):</span>
                      <span className="font-mono font-bold text-purple-700">− {rs(activeSummary.settled)}</span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-purple-50 border border-purple-200 rounded-xl mt-3">
                      <div>
                        <span className="font-bold text-gray-900 text-base block">Abhi Tak Kitna Baqi Hai</span>
                        <span className="text-xs text-purple-700">Kharche aur adaigi kaat kar supplier ka baqi balance</span>
                      </div>
                      <span className="font-mono font-bold text-2xl text-purple-800">
                        {rs(activeSummary.pendingPayable)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* If Single Supplier Selected: Show their specific Tagged Expenses */}
              {!activeSummary.isAll && activeSummary.taggedExpenses && activeSummary.taggedExpenses.length > 0 && (
                <div className="card border border-orange-200 rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="p-3.5 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
                    <span className="font-bold text-xs text-orange-900 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-orange-600" />
                      {activeSummary.supplierName} Ke Kharchon Ki Tafseel ({activeSummary.taggedExpenses.length})
                    </span>
                    <span className="font-mono font-bold text-xs text-orange-900">
                      Total: {rs(activeSummary.expenses)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table-base w-full text-left text-xs">
                      <thead className="bg-gray-100 text-gray-700 border-b border-gray-200">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Tafseel (Detail)</th>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activeSummary.taggedExpenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-gray-50/70">
                            <td className="p-2.5 text-gray-600 font-mono">
                              {new Date(exp.expenseDate).toLocaleDateString('en-PK')}
                            </td>
                            <td className="p-2.5 font-semibold text-gray-800">{exp.description}</td>
                            <td className="p-2.5 text-gray-500">
                              <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px]">
                                {EXPENSE_CATS.find((c) => c.v === exp.category)?.l || exp.category}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-red-600">
                              {rs(exp.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-Supplier Final Breakdown Table */}
              <div className="card overflow-hidden border border-gray-200 rounded-xl bg-white shadow-xs">
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h3 className="section-title text-base font-bold text-gray-800">
                      Har Supplier Ka Alag Hisaab Summary
                    </h3>
                    <p className="text-xs text-gray-500">
                      Kisi bhi supplier par click karein to upar uska hisaab alag se khul jayega
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{sections.length} suppliers active</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="table-base w-full text-left text-sm">
                    <thead className="bg-gray-100 text-xs font-semibold text-gray-700 border-b border-gray-200">
                      <tr>
                        <th className="p-3">Supplier</th>
                        <th className="p-3 text-right">Maal Aaya</th>
                        <th className="p-3 text-right">Maal Bika</th>
                        <th className="p-3 text-right">Baqi Maal</th>
                        <th className="p-3 text-right">Total Sale</th>
                        <th className="p-3 text-right">Commission Earned</th>
                        <th className="p-3 text-right">Supplier Payable</th>
                        <th className="p-3 text-right">Diya Gaya</th>
                        <th className="p-3 text-right">Baqi Dena</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sections.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-gray-400 italic">
                            Koi supplier data nahi hai
                          </td>
                        </tr>
                      ) : (
                        sections.map((s) => {
                          const isSelected = String(s.supplierId) === summarySupplierId;
                          return (
                            <tr
                              key={s.supplierId}
                              onClick={() => setSummarySupplierId(String(s.supplierId))}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-green-100/70 border-l-4 border-l-green-600' : 'hover:bg-gray-50/80'
                              }`}
                              title="Click karke upar iska mukammal hisaab dekhein"
                            >
                              <td className="p-3 font-semibold text-gray-800">
                                <div className="flex items-center gap-1.5">
                                  <span>{s.supplierName}</span>
                                  {isSelected && (
                                    <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.2 rounded font-bold">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-mono text-gray-400">{s.supplierCode}</p>
                              </td>
                              <td className="p-3 text-right font-mono text-gray-700">{s.totalReceivedQty || '0'}</td>
                              <td className="p-3 text-right font-mono text-blue-600 font-semibold">{s.totalSoldQty || '0'}</td>
                              <td className="p-3 text-right font-mono font-bold text-gray-900">{s.totalRemainingQty || '0'}</td>
                              <td className="p-3 text-right font-mono text-gray-700">{rs(s.totalSoldAmount)}</td>
                              <td className="p-3 text-right font-mono font-bold text-green-700">{rs(s.totalCommissionEarned)}</td>
                              <td className="p-3 text-right font-mono text-gray-700">{rs(s.totalSupplierPayable)}</td>
                              <td className="p-3 text-right font-mono text-purple-700">{rs(s.totalSettled || '0')}</td>
                              <td className="p-3 text-right font-mono font-bold text-red-600">{rs(s.currentBalanceConsignment)}</td>
                              <td className="p-3 text-center">
                                {s.allItemsExhausted ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    <BadgeCheck className="w-3.5 h-3.5" /> Bik Gaya
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                    Baqi
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </>
          ) : (
            <div className="card p-12 text-center text-gray-400 bg-white border border-gray-200 rounded-xl">
              Hisaab load ho raha hai...
            </div>
          )}

        </div>
      )}

      {/* ══ Edit Receipt Modal ══ */}
      {editReceipt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditReceipt(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
                <Edit2 className="w-4 h-4 text-blue-600" />
                Receipt Edit Karein: <span className="text-green-700 font-mono">{editReceipt.receiptNumber}</span>
              </h3>
              <button onClick={() => setEditReceipt(null)} className="text-gray-400 hover:text-gray-700 cursor-pointer text-xl font-bold">×</button>
            </div>

            <form onSubmit={handleEditReceiptSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Receipt Date *</label>
                <input
                  type="date"
                  required
                  value={editReceipt.receiptDate}
                  onChange={(e) => setEditReceipt({ ...editReceipt, receiptDate: e.target.value })}
                  className="form-input w-full"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Rate Update (Rs./Unit) <span className="text-gray-400 font-normal">(Optional — sirf tab bharen agar rate change hua)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editReceipt.referenceRate}
                  onChange={(e) => setEditReceipt({ ...editReceipt, referenceRate: e.target.value })}
                  placeholder="e.g. 155.00 (Khali chodein agar rate nahi badla)"
                  className="form-input w-full font-mono"
                />
                <p className="text-[11px] text-orange-600 mt-1">⚠ Rate update karein to sab batches ki reference valuation update ho jayegi</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Notes</label>
                <input
                  value={editReceipt.notes}
                  onChange={(e) => setEditReceipt({ ...editReceipt, notes: e.target.value })}
                  placeholder="Koi note ya remarks..."
                  className="form-input w-full"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditReceipt(null)}
                  className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {editLoading ? 'Saving...' : '✓ Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
