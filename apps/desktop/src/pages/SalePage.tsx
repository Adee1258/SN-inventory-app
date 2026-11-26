import React, { useEffect, useState, useMemo } from 'react';
import {
  Receipt,
  Plus,
  CheckCircle,
  ShieldAlert,
  Printer,
  Trash2,
  Eye,
  UserPlus,
  X,
  ChevronDown,
  ChevronUp,
  User,
  RefreshCw,
  History,
  Package,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Layers,
  AlertCircle,
  Search,
} from 'lucide-react';
import { api } from '../api/client.js';
import { InvoiceModal } from '../components/invoices/InvoiceModal.js';
import { ConfirmModal, type ConfirmDialogState } from '../components/common/ConfirmModal.js';

/* ─── Types ─── */
interface ItemBase {
  id: number;
  name: string;
  code: string;
  baseUnit: { id: number; name: string };
  conversions: Array<{
    unitId: number;
    unit: { id: number; name: string };
    multiplierToBase: string;
  }>;
  ownStockRemaining?: string;
  consignmentStockRemaining?: string;
  totalStockRemaining?: string;
}

// Item returned from /inventory/consignment-stock?supplierId=X
interface CommissionStockItem extends ItemBase {
  totalRemainingBaseQty: string; // formatted e.g. "120.000000"
}

interface Customer {
  id: number;
  name: string;
  code: string;
  phone?: string;
  address?: string;
  currentBalance: string;
}

interface Supplier {
  id: number;
  name: string;
  code: string;
}

interface RecentSaleRecord {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  paymentMethod: string;
  grossAmount: string;
  discountAmount: string;
  netInvoiceAmount: string;
  paidAmount: string;
  remainingBalance: string;
  notes?: string;
  customer?: { name: string; phone?: string };
  items?: Array<{
    id: number;
    enteredQuantity: string;
    enteredUnitName: string;
    ratePerEnteredUnit: string;
    grossAmount: string;
    discountAmount: string;
    netAmount: string;
    ownershipType: string;
    item?: { name: string; code: string };
  }>;
}

/* ─── Line item in the sale form ─── */
interface SaleLine {
  itemName: string;
  selectedItemId: number;          // 0 = nothing selected yet
  ownershipType: 'OWN' | 'CONSIGNMENT';
  supplierId: number;              // only used for CONSIGNMENT
  enteredQuantity: string;
  unitId: number;
  unitName: string;
  ratePerEnteredUnit: string;
  discountAmount: string;
}

const blankLine = (): SaleLine => ({
  itemName: '',
  selectedItemId: 0,
  ownershipType: 'OWN',
  supplierId: 0,
  enteredQuantity: '',
  unitId: 0,
  unitName: '',
  ratePerEnteredUnit: '',
  discountAmount: '0',
});

type PaymentMethod = 'CREDIT' | 'CASH' | 'BANK' | 'PARTIAL';

const PAYMENT_META: Record<PaymentMethod, { label: string; icon: React.ReactNode; badge: string }> = {
  CREDIT: { label: 'Credit Sale (Udhar)', icon: <CreditCard className="w-3.5 h-3.5" />, badge: 'badge-blue' },
  CASH: { label: 'Cash Sale (Naqad)', icon: <Banknote className="w-3.5 h-3.5" />, badge: 'badge-green' },
  BANK: { label: 'Bank Transfer', icon: <ArrowLeftRight className="w-3.5 h-3.5" />, badge: 'badge-gray' },
  PARTIAL: { label: 'Partial Payment', icon: <Layers className="w-3.5 h-3.5" />, badge: 'badge-amber' },
};

/* ══════════════════════════════════════════
   Component
══════════════════════════════════════════ */
export const SalePage: React.FC = () => {
  /* ── master data ── */
  const [allItems, setAllItems] = useState<ItemBase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSaleRecord[]>([]);

  // commission stock cache: supplierId → items list
  const [commissionStock, setCommissionStock] = useState<Record<number, CommissionStockItem[]>>({});
  const [commissionLoading, setCommissionLoading] = useState<Record<number, boolean>>({});

  /* ── UI state ── */
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string; invoiceNumber?: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [expandedSale, setExpandedSale] = useState<number | null>(null);
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<any | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  /* ── customer section ── */
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [customerId, setCustomerId] = useState<number>(0);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustBalance, setNewCustBalance] = useState('0.00');
  const [creatingCust, setCreatingCust] = useState(false);

  /* ── invoice header ── */
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CREDIT');
  const [paidAmount, setPaidAmount] = useState('0.00');
  const [extraCharges, setExtraCharges] = useState('');
  const [extraChargesNote, setExtraChargesNote] = useState('');
  const [notes, setNotes] = useState('');

  /* ── line items ── */
  const [lines, setLines] = useState<SaleLine[]>([blankLine()]);

  /* ─────────────────── load ─────────────────── */
  const loadData = async () => {
    try {
      const [itemsData, customersData, suppliersData, salesData] = await Promise.all([
        api.get<ItemBase[]>('/items'),
        api.get<Customer[]>('/parties/customers'),
        api.get<Supplier[]>('/parties/suppliers'),
        api.get<RecentSaleRecord[]>('/sales'),
      ]);
      setAllItems(itemsData);
      setCustomers(customersData);
      setSuppliers(suppliersData);
      setRecentSales(salesData);
      if (customersData.length > 0 && !customerId) setCustomerId(customersData[0].id);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); }, []);

  /* ─────────────────── fetch commission stock for a supplier ─────────────────── */
  const fetchCommissionStock = async (supplierId: number) => {
    if (!supplierId || commissionStock[supplierId] !== undefined) return; // already cached
    setCommissionLoading((prev) => ({ ...prev, [supplierId]: true }));
    try {
      const data = await api.get<CommissionStockItem[]>(`/inventory/consignment-stock?supplierId=${supplierId}`);
      setCommissionStock((prev) => ({ ...prev, [supplierId]: data }));
    } catch (err) {
      console.error('Failed to fetch commission stock:', err);
      setCommissionStock((prev) => ({ ...prev, [supplierId]: [] }));
    } finally {
      setCommissionLoading((prev) => ({ ...prev, [supplierId]: false }));
    }
  };

  /* ─────────────────── customer creation ─────────────────── */
  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) return;
    setCreatingCust(true);
    try {
      const code = `CUST-${newCustName.toUpperCase().replace(/\s+/g, '-').slice(0, 8)}-${Date.now().toString().slice(-4)}`;
      const created = await api.post<{ id: number; name: string }>('/parties/customers', {
        code,
        name: newCustName.trim(),
        phone: newCustPhone.trim() || '0000-0000000',
        address: newCustAddress.trim() || '',
        openingBalance: newCustBalance || '0.00',
      });
      await loadData();
      setCustomerId(created.id);
      setCustomerMode('existing');
      setNewCustName(''); setNewCustPhone(''); setNewCustAddress(''); setNewCustBalance('0.00');
      setStatusMsg({ type: 'success', text: `Customer "${created.name}" created and selected.` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create customer' });
    } finally { setCreatingCust(false); }
  };

  /* ─────────────────── line helpers ─────────────────── */
  const addLine = () => setLines((prev) => [...prev, blankLine()]);
  const removeLine = (idx: number) => {
    if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateLine = (idx: number, patch: Partial<SaleLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  /* pick item from dropdown */
  const selectItem = (idx: number, item: ItemBase | CommissionStockItem) => {
    updateLine(idx, {
      itemName: item.name,
      selectedItemId: item.id,
      unitId: item.baseUnit.id,
      unitName: item.baseUnit.name,
    });
    setOpenDropdown(null);
  };

  /* when ownership type changes on a line */
  const handleOwnershipChange = (idx: number, value: 'OWN' | 'CONSIGNMENT') => {
    // reset item selection when switching type so the wrong pool isn't used
    updateLine(idx, {
      ownershipType: value,
      supplierId: 0,
      itemName: '',
      selectedItemId: 0,
      unitId: 0,
      unitName: '',
    });
  };

  /* when supplier changes on a Commission line */
  const handleSupplierChange = (idx: number, supplierId: number) => {
    // reset item — must re-pick from the new supplier's pool
    updateLine(idx, {
      supplierId,
      itemName: '',
      selectedItemId: 0,
      unitId: 0,
      unitName: '',
    });
    if (supplierId) fetchCommissionStock(supplierId);
  };

  /* unit change */
  const handleUnitChange = (idx: number, unitId: number) => {
    const line = lines[idx];
    // find item from the right pool
    const pool = line.ownershipType === 'CONSIGNMENT' && line.supplierId
      ? (commissionStock[line.supplierId] ?? [])
      : allItems;
    const item = pool.find((i) => i.id === line.selectedItemId);
    if (!item) return;
    let unitName = item.baseUnit.name;
    if (unitId !== item.baseUnit.id) {
      const conv = item.conversions.find((c) => c.unitId === unitId);
      if (conv) unitName = conv.unit.name;
    }
    updateLine(idx, { unitId, unitName });
  };

  /* ─────────────────── totals ─────────────────── */
  const subtotal = lines.reduce((acc, l) =>
    acc + (parseFloat(l.enteredQuantity) || 0) * (parseFloat(l.ratePerEnteredUnit) || 0) - (parseFloat(l.discountAmount) || 0), 0);
  const extraChargesNum = parseFloat(extraCharges) || 0;
  const grandTotal = subtotal + extraChargesNum;

  /* ─────────────────── submit ─────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setLoading(true);
    try {
      let effectiveCustomerId = customerId;
      if (customerMode === 'new') {
        if (!newCustName.trim()) throw new Error('Please enter customer full name.');
        const code = `CUST-${newCustName.toUpperCase().replace(/\s+/g, '-').slice(0, 8)}-${Date.now().toString().slice(-4)}`;
        const created = await api.post<{ id: number; name: string }>('/parties/customers', {
          code,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || '0000-0000000',
          address: newCustAddress.trim() || '',
          openingBalance: newCustBalance || '0.00',
        });
        effectiveCustomerId = created.id;
        setCustomerId(created.id);
        setCustomerMode('existing');
        setNewCustName(''); setNewCustPhone(''); setNewCustAddress(''); setNewCustBalance('0.00');
      }
      if (!effectiveCustomerId) throw new Error('Please select or create a customer.');

      const notesArr: string[] = [];
      if (notes.trim()) notesArr.push(notes.trim());
      if (extraChargesNum > 0)
        notesArr.push(`Extra Charges: Rs.${extraChargesNum.toFixed(2)}${extraChargesNote.trim() ? ` (${extraChargesNote.trim()})` : ''}`);
      const finalNotes = notesArr.join(' | ') || undefined;

      const res = await api.post<any>('/sales', {
        customerId: effectiveCustomerId,
        invoiceDate,
        paymentMethod,
        paidAmount: paymentMethod === 'PARTIAL'
          ? paidAmount
          : paymentMethod === 'CASH' || paymentMethod === 'BANK'
            ? grandTotal.toFixed(2)
            : '0.00',
        notes: finalNotes,
        items: lines.map((l) => ({
          itemId: Number(l.selectedItemId),
          ownershipType: l.ownershipType,
          supplierId: l.ownershipType === 'CONSIGNMENT' ? Number(l.supplierId) : undefined,
          enteredQuantity: l.enteredQuantity,
          unitId: Number(l.unitId),
          ratePerEnteredUnit: l.ratePerEnteredUnit,
          discountAmount: l.discountAmount || '0.00',
        })),
      });

      setStatusMsg({ type: 'success', text: `Invoice ${res.invoiceNumber} posted successfully!`, invoiceNumber: res.invoiceNumber });
      setSelectedInvoiceForModal(res);
      setIsInvoiceModalOpen(true);
      setLines([blankLine()]);
      setExtraCharges(''); setExtraChargesNote(''); setNotes('');
      setPaidAmount('0.00'); setPaymentMethod('CREDIT');
      // clear commission cache so fresh stock is fetched next time
      setCommissionStock({});
      await loadData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Sale posting failed' });
    } finally { setLoading(false); }
  };

  /* ─────────────────── delete ─────────────────── */
  const handleDeleteSale = (id: number, invoiceNum: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Cancel & Delete Sale Invoice',
      message: `Cancel and delete sale invoice "${invoiceNum}"?\n\nThis will restore all deducted stock and reverse the customer receivable.`,
      confirmLabel: 'Yes, Delete Sale',
      isDestructive: true,
      onConfirm: async () => {
        // Optimistic UI update: instantly remove from table
        const backup = [...recentSales];
        setRecentSales((prev) => prev.filter((s) => s.id !== id));
        try {
          const res = await api.delete<{ message: string }>(`/sales/${id}`);
          setStatusMsg({ type: 'success', text: res.message || `Invoice ${invoiceNum} deleted.` });
          setCommissionStock({});
          loadData();
        } catch (err) {
          setRecentSales(backup); // Rollback on error
          setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
        }
      },
    });
  };

  /* ─────────────────── search filter for history ─────────────────── */
  const filteredSales = useMemo(() => {
    if (!historySearch.trim()) return recentSales;
    const q = historySearch.toLowerCase().trim();
    return recentSales.filter((s) => {
      const invMatch = (s.invoiceNumber || '').toLowerCase().includes(q);
      const custMatch =
        (s.customer?.name || '').toLowerCase().includes(q) ||
        (s.customer?.phone || '').includes(q);
      const payMatch = (s.paymentMethod || '').toLowerCase().includes(q);
      const notesMatch = (s.notes || '').toLowerCase().includes(q);
      const dateMatch = (s.invoiceDate || '').includes(q);
      const itemsMatch = s.items?.some(
        (it) =>
          (it.item?.name || '').toLowerCase().includes(q) ||
          (it.item?.code || '').toLowerCase().includes(q)
      );
      return invMatch || custMatch || payMatch || notesMatch || dateMatch || itemsMatch;
    });
  }, [recentSales, historySearch]);

  const selectedCustomer = customers.find((c) => c.id === Number(customerId));

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <div className="page-wrapper" onClick={() => setOpenDropdown(null)}>

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            <Receipt className="w-5 h-5 text-brand-400" />
            Sale Counter
          </h1>
          <p className="page-subtitle">Post sale invoices with FIFO stock allocation • Own Stock &amp; Commission</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadData()} className="btn-secondary" type="button">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="btn-secondary">
            <History className="w-3.5 h-3.5" />
            History ({recentSales.length})
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {statusMsg?.invoiceNumber && (
            <button onClick={() => window.print()} className="btn-secondary" type="button">
              <Printer className="w-3.5 h-3.5 text-brand-400" />
              Print #{statusMsg.invoiceNumber}
            </button>
          )}
        </div>
      </div>

      {/* ── Status ── */}
      {statusMsg && (
        <div className={statusMsg.type === 'success' ? 'alert-success' : 'alert-error'}>
          {statusMsg.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <ShieldAlert className="w-4 h-4 flex-shrink-0" />}
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="ml-auto p-0.5 rounded hover:bg-black/10">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          SALES HISTORY (OPENS DIRECTLY UNDER BUTTON)
      ══════════════════════════════════════════ */}
      {showHistory && (
        <div className="card animate-fade-in overflow-hidden">
          <div className="card-header flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-brand-400" />
              <h3 className="section-title">Sales History</h3>
              <span className="text-xs text-gray-400 font-medium">
                ({filteredSales.length}{filteredSales.length !== recentSales.length ? ` of ${recentSales.length}` : ''} records)
              </span>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search invoice #, customer, item, phone..."
                  className="form-input pl-8 pr-7 py-1 text-xs w-64 focus:ring-1 focus:ring-brand-500"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {recentSales.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-10 text-center">No sales posted yet.</p>
          ) : filteredSales.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs italic">
              Koi sale invoice "{historySearch}" se match nahi hui.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="table-base">
                <thead className="table-head sticky top-0 z-10 bg-gray-50 shadow-xs">
                  <tr>
                    <th className="table-th w-8"></th>
                    <th className="table-th">Invoice #</th>
                    <th className="table-th">Customer</th>
                    <th className="table-th">Date</th>
                    <th className="table-th">Type</th>
                    <th className="table-th text-right">Net Amount</th>
                    <th className="table-th text-right">Paid</th>
                    <th className="table-th text-right">Balance</th>
                    <th className="table-th text-center w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((s) => {
                    const isExpanded = expandedSale === s.id;
                    return (
                      <React.Fragment key={s.id}>
                        <tr className="table-row cursor-pointer hover:bg-brand-600/5"
                          onClick={() => setExpandedSale(isExpanded ? null : s.id)}>
                          <td className="table-td text-center">
                            {isExpanded
                              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                              : <ChevronDown className="w-3.5 h-3.5 text-gray-400 mx-auto" />}
                          </td>
                          <td className="table-td font-mono font-bold text-brand-400 text-[11px]">{s.invoiceNumber}</td>
                          <td className="table-td text-gray-800 font-medium text-sm">
                            {s.customer?.name || '—'}
                            {s.customer?.phone && <span className="block text-[10px] text-gray-400">{s.customer.phone}</span>}
                          </td>
                          <td className="table-td text-gray-500 text-xs">
                            {new Date(s.invoiceDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="table-td">
                            <span className={PAYMENT_META[s.paymentMethod as PaymentMethod]?.badge ?? 'badge-gray'}>
                              {PAYMENT_META[s.paymentMethod as PaymentMethod]?.label ?? s.paymentMethod}
                            </span>
                          </td>
                          <td className="table-td text-right font-mono font-bold text-gray-900">
                            Rs. {parseFloat(s.netInvoiceAmount).toFixed(2)}
                          </td>
                          <td className="table-td text-right font-mono text-green-600 font-semibold">
                            Rs. {parseFloat(s.paidAmount || '0').toFixed(2)}
                          </td>
                          <td className="table-td text-right font-mono font-bold">
                            <span className={parseFloat(s.remainingBalance || '0') > 0 ? 'text-rose-500' : 'text-green-600'}>
                              Rs. {parseFloat(s.remainingBalance || '0').toFixed(2)}
                            </span>
                          </td>
                          <td className="table-td text-center">
                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={async () => {
                                  const full = await api.get<any>(`/sales`);
                                  const inv = Array.isArray(full) ? full.find((x: any) => x.id === s.id) : null;
                                  setSelectedInvoiceForModal(inv || s);
                                  setIsInvoiceModalOpen(true);
                                }}
                                className="btn-ghost" title="View Invoice">
                                <Eye className="w-3.5 h-3.5 text-gray-500 hover:text-brand-400" />
                              </button>
                              <button onClick={() => handleDeleteSale(s.id, s.invoiceNumber)}
                                disabled={loading} className="btn-ghost disabled:opacity-30" title="Delete Sale">
                                <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-400" />
                              </button>
                            </div>
                          </td>
                        </tr>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <tr className="bg-brand-500/[0.03] border-t border-brand-500/10">
                          <td />
                          <td colSpan={8} className="py-4 px-6">
                            {s.notes && (
                              <p className="text-xs text-gray-500 mb-3 italic">📝 {s.notes}</p>
                            )}
                            <div className="overflow-x-auto rounded-xl border border-gray-200 mb-3">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-gray-100 text-gray-500 font-semibold border-b border-gray-200">
                                  <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Item</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2">Unit</th>
                                    <th className="px-3 py-2 text-right">Rate</th>
                                    <th className="px-3 py-2 text-right">Discount</th>
                                    <th className="px-3 py-2 text-right">Net</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {(s.items || []).map((it, i) => (
                                    <tr key={it.id || i} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                                      <td className="px-3 py-2 font-semibold text-gray-800">{it.item?.name ?? '—'}</td>
                                      <td className="px-3 py-2">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${it.ownershipType === 'CONSIGNMENT' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                          {it.ownershipType === 'CONSIGNMENT' ? 'Commission' : 'Own Stock'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono">{it.enteredQuantity}</td>
                                      <td className="px-3 py-2 text-gray-500">{it.enteredUnitName}</td>
                                      <td className="px-3 py-2 text-right font-mono">Rs. {parseFloat(it.ratePerEnteredUnit || '0').toFixed(2)}</td>
                                      <td className="px-3 py-2 text-right font-mono text-rose-400">
                                        {parseFloat(it.discountAmount || '0') > 0 ? `Rs. ${parseFloat(it.discountAmount).toFixed(2)}` : '—'}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-800">
                                        Rs. {parseFloat(it.netAmount || '0').toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex justify-end">
                              <div className="text-xs space-y-1 w-56">
                                {s.notes && s.notes.includes('Extra Charges:') && (() => {
                                  const m = s.notes.match(/Extra Charges: Rs\.([\d.]+)(?:\s*\(([^)]+)\))?/);
                                  if (!m) return null;
                                  return (
                                    <div className="flex justify-between text-amber-600">
                                      <span>Extra{m[2] ? ` (${m[2]})` : ''}:</span>
                                      <span className="font-mono">+ Rs. {parseFloat(m[1]).toFixed(2)}</span>
                                    </div>
                                  );
                                })()}
                                <div className="flex justify-between font-black text-gray-900 border-t border-gray-200 pt-1">
                                  <span>Net Total:</span>
                                  <span className="font-mono">Rs. {parseFloat(s.netInvoiceAmount).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-green-600 font-semibold">
                                  <span>Paid:</span>
                                  <span className="font-mono">Rs. {parseFloat(s.paidAmount || '0').toFixed(2)}</span>
                                </div>
                                <div className={`flex justify-between font-bold border-t border-gray-200 pt-1 ${parseFloat(s.remainingBalance || '0') > 0 ? 'text-rose-500' : 'text-green-600'}`}>
                                  <span>Balance:</span>
                                  <span className="font-mono">Rs. {parseFloat(s.remainingBalance || '0').toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          SALE FORM
      ══════════════════════════════════════════ */}
      <form onSubmit={handleSubmit} className="card p-5 space-y-5" onClick={(e) => e.stopPropagation()}>

        {/* form header */}
        <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
          <Receipt className="w-4 h-4 text-brand-400" />
          <h3 className="section-title">New Sale Invoice</h3>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400">Grand Total:</span>
            <span className="font-mono font-bold text-brand-400 text-sm bg-brand-600/10 border border-brand-600/20 px-3 py-1 rounded-lg">
              Rs. {grandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Customer ── */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Customer</span>
            <div className="ml-auto flex items-center gap-1 bg-gray-200 rounded-lg p-0.5">
              <button type="button" onClick={() => setCustomerMode('existing')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${customerMode === 'existing' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Existing Customer
              </button>
              <button type="button" onClick={() => setCustomerMode('new')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${customerMode === 'new' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <UserPlus className="w-3 h-3" />New Customer
              </button>
            </div>
          </div>

          {customerMode === 'existing' ? (
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <label className="form-label">Select Customer</label>
                <select required value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))} className="form-select">
                  <option value={0} disabled>— Select Customer —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {selectedCustomer && (
                <div className="flex flex-col text-xs pb-1">
                  <span className="text-gray-400">Outstanding Balance</span>
                  <span className={`font-mono font-bold text-sm ${parseFloat(selectedCustomer.currentBalance) > 0 ? 'text-rose-500' : 'text-green-600'}`}>
                    Rs. {parseFloat(selectedCustomer.currentBalance).toFixed(2)}
                  </span>
                  {selectedCustomer.phone && <span className="text-gray-400 text-[10px]">{selectedCustomer.phone}</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">Full Name *</label>
                  <input type="text" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Customer name" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input type="text" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="03xx-xxxxxxx" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Address</label>
                  <input type="text" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} placeholder="City / area" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Opening Balance (Rs.)</label>
                  <input type="number" step="any" value={newCustBalance} onChange={(e) => setNewCustBalance(e.target.value)} className="form-input font-mono" />
                </div>
              </div>
              <button type="button" onClick={handleCreateCustomer} disabled={!newCustName.trim() || creatingCust} className="btn-primary">
                <UserPlus className="w-3.5 h-3.5" />
                {creatingCust ? 'Creating…' : 'Create & Select Customer'}
              </button>
            </div>
          )}
        </div>

        {/* ── Invoice Header ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="form-label">Sale Date</label>
            <input type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label">Sale Type</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="form-select">
              <option value="CREDIT">Credit Sale (Udhar — Receive Later)</option>
              <option value="CASH">Cash Sale (Naqad — Pay Now)</option>
              <option value="BANK">Bank Transfer</option>
              <option value="PARTIAL">Partial Payment (Down + Udhar)</option>
            </select>
          </div>
          {paymentMethod === 'PARTIAL' && (
            <div>
              <label className="form-label">Down Payment Received (Rs.)</label>
              <input type="number" step="any" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="form-input font-mono" placeholder="0.00" />
            </div>
          )}
          <div>
            <label className="form-label">Notes (Optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remarks…" className="form-input" />
          </div>
        </div>

        {/* ── Info banner ── */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <Package className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Own Stock:</strong> Select any available item. &nbsp;|&nbsp;
            <strong>Commission:</strong> First select the supplier — only items that supplier has deposited with us will appear in the list.
          </span>
        </div>

        {/* ══ Line Items ══ */}
        <div className="space-y-3">
          {lines.map((line, idx) => {
            const isCommission = line.ownershipType === 'CONSIGNMENT';

            /* ── item pool for this line ── */
            let itemPool: (ItemBase | CommissionStockItem)[] = [];
            let poolLoading = false;
            let noStockWarning = false;

            if (isCommission) {
              if (line.supplierId) {
                poolLoading = !!commissionLoading[line.supplierId];
                itemPool = commissionStock[line.supplierId] ?? [];
                noStockWarning = !poolLoading && commissionStock[line.supplierId] !== undefined && itemPool.length === 0;
              }
            } else {
              // Bug #3 Fix: Own Stock tab should ONLY show own-stock items (not pure commission/consignment items)
              itemPool = allItems.filter((i: any) => {
                const catName = (i.category?.name || '').toLowerCase();
                const hasOwnStock = parseFloat(i.ownStockRemaining || '0') > 0;
                return hasOwnStock || (!catName.includes('consign') && !catName.includes('commis'));
              });
            }

            /* filter by typed text */
            const filteredPool = line.itemName
              ? itemPool.filter((i) => i.name.toLowerCase().includes(line.itemName.toLowerCase()))
              : itemPool;

            /* find the currently selected item from pool */
            const selectedItem = line.selectedItemId
              ? itemPool.find((i) => i.id === line.selectedItemId) ?? null
              : null;

            /* commission stock shows qty in base unit */
            const commissionQty = isCommission && selectedItem
              ? (selectedItem as CommissionStockItem).totalRemainingBaseQty
              : null;

            const lineTotal =
              (parseFloat(line.enteredQuantity) || 0) * (parseFloat(line.ratePerEnteredUnit) || 0) -
              (parseFloat(line.discountAmount) || 0);

            return (
              <div key={idx} className={`border rounded-xl p-3 space-y-3 relative ${isCommission ? 'bg-amber-50/60 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>

                {/* ─ row header ─ */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-200 rounded px-1.5 py-0.5">
                    Item {idx + 1}
                  </span>

                  {/* Ownership type toggle */}
                  <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-0.5">
                    <button type="button"
                      onClick={() => handleOwnershipChange(idx, 'OWN')}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${!isCommission ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      Own Stock
                    </button>
                    <button type="button"
                      onClick={() => handleOwnershipChange(idx, 'CONSIGNMENT')}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${isCommission ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      Commission
                    </button>
                  </div>

                  {/* Supplier picker — shown only for Commission lines */}
                  {isCommission && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={line.supplierId || ''}
                        onChange={(e) => handleSupplierChange(idx, Number(e.target.value))}
                        className="form-select w-44 py-1 text-xs"
                        required={isCommission}
                      >
                        <option value="">— Select Supplier —</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      {poolLoading && (
                        <span className="text-[10px] text-amber-600 animate-pulse">Loading stock…</span>
                      )}
                    </div>
                  )}

                  {/* no stock warning */}
                  {noStockWarning && (
                    <span className="flex items-center gap-1 text-[10px] text-rose-500 font-semibold">
                      <AlertCircle className="w-3 h-3" />
                      No commission stock from this supplier
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-brand-400">Rs. {lineTotal.toFixed(2)}</span>
                    <button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1}
                      className="p-1 rounded hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 disabled:opacity-20 transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ─ main fields ─ */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">

                  {/* Item search with autocomplete */}
                  <div className="md:col-span-2 relative">
                    <label className="form-label">
                      {isCommission ? 'Commission Item' : 'Item / Product'}
                      {isCommission && !line.supplierId && (
                        <span className="ml-1 text-amber-500 normal-case font-normal">(select supplier first)</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      value={line.itemName}
                      disabled={isCommission && !line.supplierId}
                      onChange={(e) => {
                        updateLine(idx, { itemName: e.target.value, selectedItemId: 0, unitId: 0, unitName: '' });
                        setOpenDropdown(idx);
                      }}
                      onFocus={() => setOpenDropdown(idx)}
                      placeholder={isCommission && !line.supplierId ? 'Select supplier first…' : 'Type to search…'}
                      className={`form-input ${line.selectedItemId ? 'border-green-400 ring-1 ring-green-400/30' : ''} ${isCommission && !line.supplierId ? 'opacity-50 cursor-not-allowed' : ''}`}
                      autoComplete="off"
                    />

                    {/* dropdown */}
                    {openDropdown === idx && (!isCommission || line.supplierId > 0) && (
                      <div
                        className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {poolLoading ? (
                          <p className="p-3 text-xs text-amber-500 italic">Loading supplier's stock…</p>
                        ) : filteredPool.length === 0 ? (
                          <p className="p-3 text-xs text-gray-400 italic">
                            {isCommission ? 'No commission stock from this supplier.' : 'No matching items found.'}
                          </p>
                        ) : (
                          filteredPool.slice(0, 25).map((item) => {
                            const qty = isCommission
                              ? (item as CommissionStockItem).totalRemainingBaseQty
                              : (item as ItemBase).ownStockRemaining;
                            return (
                              <button key={item.id} type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-brand-600/10 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                                onClick={() => selectItem(idx, item)}>
                                <span className="font-semibold text-gray-800">{item.name}</span>
                                <span className="text-gray-400 font-mono text-[10px] shrink-0 flex items-center gap-1">
                                  {qty !== undefined && (
                                    <span className={`font-bold ${parseFloat(qty) <= 0 ? 'text-rose-500' : 'text-green-600'}`}>
                                      {parseFloat(qty).toFixed(1)} {item.baseUnit.name} avail.
                                    </span>
                                  )}
                                  {qty === undefined && item.baseUnit.name}
                                  {item.conversions.length > 0 && (
                                    <span className="text-gray-300 ml-1">
                                      / {item.conversions.map((c) => c.unit.name).join(' / ')}
                                    </span>
                                  )}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* selected item qty info */}
                    {isCommission && commissionQty && line.selectedItemId > 0 && (
                      <span className="text-[10px] text-green-600 font-semibold mt-0.5 block">
                        Available (Commission): {parseFloat(commissionQty).toFixed(2)} {selectedItem?.baseUnit.name}
                      </span>
                    )}
                    {!isCommission && line.selectedItemId > 0 && selectedItem && (
                      <span className={`text-[10px] font-semibold mt-0.5 block ${
                        parseFloat((selectedItem as ItemBase).ownStockRemaining || '0') <= 0 ? 'text-rose-500' : 'text-green-600'
                      }`}>
                        Available Own Stock: {parseFloat((selectedItem as ItemBase).ownStockRemaining || '0').toFixed(2)} {selectedItem.baseUnit.name}
                      </span>
                    )}
                  </div>

                  {/* Unit */}
                  <div>
                    <label className="form-label">Unit</label>
                    {selectedItem && selectedItem.conversions.length > 0 ? (
                      <select value={line.unitId} onChange={(e) => handleUnitChange(idx, Number(e.target.value))} className="form-select">
                        <option value={selectedItem.baseUnit.id}>{selectedItem.baseUnit.name} (Base)</option>
                        {selectedItem.conversions.map((c) => (
                          <option key={c.unitId} value={c.unitId}>
                            {c.unit.name} ({parseFloat(c.multiplierToBase)} KG)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" value={line.unitName || '—'} readOnly
                        className="form-input bg-gray-50 text-gray-500 cursor-not-allowed" />
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="form-label">Quantity</label>
                    <input type="number" step="any" required min="0.001"
                      value={line.enteredQuantity}
                      onChange={(e) => updateLine(idx, { enteredQuantity: e.target.value })}
                      className="form-input font-mono" placeholder="0" />
                  </div>

                  {/* Rate */}
                  <div>
                    <label className="form-label">
                      Sale Rate (Rs.{line.unitName ? ` / ${line.unitName}` : ''})
                    </label>
                    <input type="number" step="any" required min="0"
                      value={line.ratePerEnteredUnit}
                      onChange={(e) => updateLine(idx, { ratePerEnteredUnit: e.target.value })}
                      className="form-input font-mono" placeholder="0.00" />
                  </div>
                </div>

                {/* Discount + line total */}
                <div className="flex items-end gap-4">
                  <div className="w-40">
                    <label className="form-label">Discount (Rs.)</label>
                    <input type="number" step="any" min="0"
                      value={line.discountAmount}
                      onChange={(e) => updateLine(idx, { discountAmount: e.target.value })}
                      className="form-input font-mono text-sm" placeholder="0.00" />
                  </div>
                  <div className="pb-2.5 text-xs text-gray-400">
                    Line Total = Qty × Rate − Discount =&nbsp;
                    <span className="font-mono font-bold text-gray-700">Rs. {lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          <button type="button" onClick={addLine} className="btn-secondary w-fit">
            <Plus className="w-3.5 h-3.5" />Add Product
          </button>
        </div>

        {/* ── Extra Charges ── */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Extra Charges (Optional)</p>
          <div className="flex items-end gap-4">
            <div className="w-44">
              <label className="form-label">Amount (Rs.)</label>
              <input type="number" step="any" min="0" value={extraCharges}
                onChange={(e) => setExtraCharges(e.target.value)} className="form-input font-mono" placeholder="0.00" />
            </div>
            <div className="flex-1 max-w-sm">
              <label className="form-label">Note (e.g. Freight, Carriage)</label>
              <input type="text" value={extraChargesNote} onChange={(e) => setExtraChargesNote(e.target.value)}
                className="form-input" placeholder="Freight, loading, etc." />
            </div>
          </div>
        </div>

        {/* ── Totals Summary ── */}
        <div className="flex justify-end">
          <div className="w-72 space-y-2 text-sm border-t-2 border-gray-200 pt-3">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (Items):</span>
              <span className="font-mono">Rs. {subtotal.toFixed(2)}</span>
            </div>
            {extraChargesNum > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>+ Extra{extraChargesNote ? ` (${extraChargesNote})` : ''}:</span>
                <span className="font-mono">Rs. {extraChargesNum.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-gray-900 border-t border-gray-300 pt-2 text-base">
              <span>Grand Total:</span>
              <span className="font-mono text-brand-500">Rs. {grandTotal.toFixed(2)}</span>
            </div>
            {paymentMethod === 'PARTIAL' && (
              <>
                <div className="flex justify-between text-green-600 font-semibold">
                  <span>Paid Now:</span>
                  <span className="font-mono">Rs. {(parseFloat(paidAmount) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-500 font-semibold">
                  <span>Remaining (Udhar):</span>
                  <span className="font-mono">Rs. {(grandTotal - (parseFloat(paidAmount) || 0)).toFixed(2)}</span>
                </div>
              </>
            )}
            {(paymentMethod === 'CASH' || paymentMethod === 'BANK') && (
              <div className="flex justify-between text-green-600 font-semibold">
                <span>Paid in Full:</span>
                <span className="font-mono">Rs. {grandTotal.toFixed(2)}</span>
              </div>
            )}
            {paymentMethod === 'CREDIT' && (
              <div className="flex justify-between text-rose-500 font-semibold">
                <span>Added to Udhar:</span>
                <span className="font-mono">Rs. {grandTotal.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <span className={`${PAYMENT_META[paymentMethod].badge} flex items-center gap-1`}>
            {PAYMENT_META[paymentMethod].icon}
            {PAYMENT_META[paymentMethod].label}
          </span>
          <button
            type="submit"
            disabled={loading || !customerId || lines.some((l) => !l.selectedItemId)}
            className="btn-primary px-6 py-2.5"
          >
            <Receipt className="w-4 h-4" />
            {loading ? 'Posting Invoice…' : 'Post Sale Invoice'}
          </button>
        </div>
      </form>

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        type="sale"
        invoice={selectedInvoiceForModal}
      />

      {/* Confirmation Modal — avoids native window.confirm Electron input freeze */}
      <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
};
