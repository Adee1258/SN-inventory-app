import React, { useEffect, useState, useMemo } from 'react';
import {
  ShoppingCart,
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
  Building2,
  RefreshCw,
  History,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Layers,
  Search,
} from 'lucide-react';
import { api } from '../api/client.js';
import { InvoiceModal } from '../components/invoices/InvoiceModal.js';
import { ConfirmModal, type ConfirmDialogState } from '../components/common/ConfirmModal.js';

/* ─── Types ─── */
interface Item {
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
  totalStockRemaining?: string;
}

interface Unit {
  id: number;
  name: string;
  code: string;
  symbol: string;
  isBaseUnit: boolean;
}

interface Category {
  id: number;
  name: string;
}

interface Supplier {
  id: number;
  name: string;
  code: string;
  phone?: string;
  address?: string;
  currentBalanceOwn: string;
  currentBalanceConsignment: string;
}

interface PurchaseRecord {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  paymentMethod: string;
  netLandedAmount: string;
  paidAmount?: string;
  remainingBalance?: string;
  notes?: string;
  supplier?: { name: string; phone?: string };
  items?: Array<{
    id: number;
    enteredQuantity: string;
    enteredUnitName: string;
    ratePerEnteredUnit: string;
    grossAmount: string;
    discountAmount: string;
    netLandedAmount: string;
    freightAllocated?: string;
    loadingAllocated?: string;
    item?: { name: string; code: string };
  }>;
}

/* ─── Line item in the purchase form ─── */
interface PurchaseLine {
  itemName: string;
  selectedItemId: number;
  enteredQuantity: string;
  unitId: number;
  unitName: string;
  ratePerEnteredUnit: string;
  discountAmount: string;
  extraChargesAmount: string;
  extraChargesNote: string;
}

const blankLine = (defaultUnitId = 0, defaultUnitName = ''): PurchaseLine => ({
  itemName: '',
  selectedItemId: 0,
  enteredQuantity: '',
  unitId: defaultUnitId,
  unitName: defaultUnitName,
  ratePerEnteredUnit: '',
  discountAmount: '0',
  extraChargesAmount: '0',
  extraChargesNote: '',
});

type PaymentMethod = 'CREDIT' | 'CASH' | 'BANK' | 'PARTIAL';

const PAYMENT_META: Record<PaymentMethod, { label: string; icon: React.ReactNode; badge: string }> = {
  CREDIT: { label: 'Credit Purchase (AP)', icon: <CreditCard className="w-3.5 h-3.5" />, badge: 'badge-blue' },
  CASH: { label: 'Cash Purchase (Naqad)', icon: <Banknote className="w-3.5 h-3.5" />, badge: 'badge-green' },
  BANK: { label: 'Bank Transfer', icon: <ArrowLeftRight className="w-3.5 h-3.5" />, badge: 'badge-gray' },
  PARTIAL: { label: 'Partial Payment', icon: <Layers className="w-3.5 h-3.5" />, badge: 'badge-amber' },
};

/* ══════════════════════════════════════════
   Component
══════════════════════════════════════════ */
export const PurchasePage: React.FC = () => {
  /* ── master data ── */
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);

  /* ── UI state ── */
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string; invoiceNumber?: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<any | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  /* ── supplier section ── */
  const [supplierMode, setSupplierMode] = useState<'existing' | 'new'>('existing');
  const [supplierId, setSupplierId] = useState<number>(0);
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppPhone, setNewSuppPhone] = useState('');
  const [newSuppAddress, setNewSuppAddress] = useState('');
  const [newSuppBalance, setNewSuppBalance] = useState('0.00');
  const [creatingSupp, setCreatingSupp] = useState(false);

  /* ── invoice header ── */
  const [invoiceNumber, setInvoiceNumber] = useState(`PUR-${Date.now().toString().slice(-6)}`);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CREDIT');
  const [paidAmount, setPaidAmount] = useState('0.00');
  const [extraCharges, setExtraCharges] = useState('');
  const [extraChargesNote, setExtraChargesNote] = useState('');
  const [notes, setNotes] = useState('');

  /* ── line items ── */
  const [lines, setLines] = useState<PurchaseLine[]>([blankLine()]);

  /* ─────────────────── load ─────────────────── */
  const loadData = async () => {
    try {
      const [itemsData, unitsData, catsData, suppliersData, purchasesData] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<Unit[]>('/items/units'),
        api.get<Category[]>('/items/categories'),
        api.get<Supplier[]>('/parties/suppliers'),
        api.get<PurchaseRecord[]>('/purchases'),
      ]);
      setAllItems(itemsData);
      setUnits(unitsData);
      setCategories(catsData);
      setSuppliers(suppliersData);
      setPurchaseHistory(purchasesData);
      if (suppliersData.length > 0 && !supplierId) setSupplierId(suppliersData[0].id);

      const baseUnit = unitsData.find((u) => u.isBaseUnit) ?? unitsData[0];
      setLines((prev) =>
        prev.map((l) => ({
          ...l,
          unitId: l.unitId || (baseUnit?.id ?? 0),
          unitName: l.unitName || (baseUnit?.name ?? 'KG'),
        }))
      );
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); }, []);

  /* ─────────────────── supplier creation ─────────────────── */
  const handleCreateSupplier = async () => {
    if (!newSuppName.trim()) return;
    setCreatingSupp(true);
    try {
      const code = `SUPP-${newSuppName.toUpperCase().replace(/\s+/g, '-').slice(0, 8)}-${Date.now().toString().slice(-4)}`;
      const created = await api.post<{ id: number; name: string }>('/parties/suppliers', {
        code,
        name: newSuppName.trim(),
        phone: newSuppPhone.trim() || '0000-0000000',
        address: newSuppAddress.trim() || '',
        openingBalance: newSuppBalance || '0.00',
      });
      await loadData();
      setSupplierId(created.id);
      setSupplierMode('existing');
      setNewSuppName(''); setNewSuppPhone(''); setNewSuppAddress(''); setNewSuppBalance('0.00');
      setStatusMsg({ type: 'success', text: `Supplier "${created.name}" created and selected.` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create supplier' });
    } finally { setCreatingSupp(false); }
  };

  /* ─────────────────── line helpers ─────────────────── */
  const addLine = () => {
    const baseUnit = units.find((u) => u.isBaseUnit) ?? units[0];
    setLines((prev) => [...prev, blankLine(baseUnit?.id ?? 0, baseUnit?.name ?? 'KG')]);
  };

  const removeLine = (idx: number) => {
    if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<PurchaseLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const selectItem = (idx: number, item: Item) => {
    updateLine(idx, {
      itemName: item.name,
      selectedItemId: item.id,
      unitId: item.baseUnit.id,
      unitName: item.baseUnit.name,
    });
    setOpenDropdown(null);
  };

  const handleUnitChange = (idx: number, unitId: number) => {
    const line = lines[idx];
    const u = units.find((x) => x.id === unitId);
    let unitName = u?.name || '';
    if (line.selectedItemId > 0) {
      const item = allItems.find((i) => i.id === line.selectedItemId);
      if (item) {
        if (unitId === item.baseUnit.id) unitName = item.baseUnit.name;
        else {
          const conv = item.conversions?.find((c) => c.unitId === unitId);
          if (conv) unitName = conv.unit.name;
        }
      }
    }
    updateLine(idx, { unitId, unitName });
  };

  /* ─────────────────── totals ─────────────────── */
  const subtotal = lines.reduce((acc, l) =>
    acc +
    (parseFloat(l.enteredQuantity) || 0) * (parseFloat(l.ratePerEnteredUnit) || 0) -
    (parseFloat(l.discountAmount) || 0) +
    (parseFloat(l.extraChargesAmount) || 0),
    0
  );
  const extraChargesNum = parseFloat(extraCharges) || 0;
  const grandTotal = subtotal + extraChargesNum;

  /* ── Resolve item (Existing vs New on-the-fly) ── */
  const resolveItem = async (l: PurchaseLine): Promise<{ itemId: number; unitId: number }> => {
    const name = l.itemName.trim();
    if (!name) throw new Error('Har line pe item ka naam likhna zaroori hai.');

    // 1. Agar dropdown se select kiya tha
    if (l.selectedItemId > 0) {
      const item = allItems.find((it) => it.id === l.selectedItemId);
      const chosenUnitId = l.unitId || (item?.baseUnit.id ?? units[0]?.id ?? 1);

      // Agar user ne non-base unit (jaise Mann) select ki hai jo item ke conversions mein nahi hai to auto-add karo
      if (item && chosenUnitId !== item.baseUnit.id) {
        const hasConv = item.conversions?.some((c) => c.unitId === chosenUnitId);
        if (!hasConv) {
          let multiplier = '40.000000';
          for (const it of allItems) {
            const conv = it.conversions?.find((c) => c.unitId === chosenUnitId);
            if (conv) {
              multiplier = conv.multiplierToBase;
              break;
            }
          }
          await api.put(`/items/${item.id}`, {
            conversions: [{ unitId: chosenUnitId, multiplierToBase: multiplier }],
          });
        }
      }

      return { itemId: l.selectedItemId, unitId: chosenUnitId };
    }

    // 2. Agar naam manually likha hai lekin allItems mein exact match karta hai
    const existing = allItems.find((it) => it.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      const chosenUnitId = l.unitId || existing.baseUnit.id;
      if (chosenUnitId !== existing.baseUnit.id) {
        const hasConv = existing.conversions?.some((c) => c.unitId === chosenUnitId);
        if (!hasConv) {
          let multiplier = '40.000000';
          for (const it of allItems) {
            const conv = it.conversions?.find((c) => c.unitId === chosenUnitId);
            if (conv) {
              multiplier = conv.multiplierToBase;
              break;
            }
          }
          await api.put(`/items/${existing.id}`, {
            conversions: [{ unitId: chosenUnitId, multiplierToBase: multiplier }],
          });
        }
      }
      return { itemId: existing.id, unitId: chosenUnitId };
    }

    // 3. Naya Item create karo on-the-fly
    // Bug #1 Fix: Don't auto-select "Consignment Items" as default — pick first non-consignment category
    const defaultCategoryId = (
      categories.find(c => !c.name.toLowerCase().includes('consign') && !c.name.toLowerCase().includes('commis'))
      ?? categories[0]
    )?.id;
    if (!defaultCategoryId) throw new Error('Server par koi item category mojood nahi hai.');

    const kgUnit = units.find((u) => u.isBaseUnit);
    const trueBaseUnitId = kgUnit?.id || units[0]?.id;
    if (!trueBaseUnitId) throw new Error('Server par koi units mojood nahi hain.');

    const selectedUnitId = l.unitId || trueBaseUnitId;
    const isNonBaseUnit = selectedUnitId !== trueBaseUnitId;

    let conversions: Array<{ unitId: number; multiplierToBase: string }> = [];
    if (isNonBaseUnit) {
      let multiplier = '40.000000'; // Default Mann = 40 KG
      for (const it of allItems) {
        const conv = it.conversions?.find((c) => c.unitId === selectedUnitId);
        if (conv) {
          multiplier = conv.multiplierToBase;
          break;
        }
      }
      conversions = [{ unitId: selectedUnitId, multiplierToBase: multiplier }];
    }

    const code = `PUR-${name.toUpperCase().replace(/\s+/g, '-').slice(0, 10)}-${Date.now().toString().slice(-4)}`;
    const created = await api.post<{ id: number }>('/items', {
      code,
      name,
      categoryId: defaultCategoryId,
      baseUnitId: trueBaseUnitId, // HAMESHA KG
      minStockLevel: '0.000000',
      conversions: conversions.length > 0 ? conversions : undefined,
    });

    return { itemId: created.id, unitId: selectedUnitId };
  };

  /* ─────────────────── submit ─────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setLoading(true);
    try {
      let effectiveSupplierId = supplierId;
      if (supplierMode === 'new') {
        if (!newSuppName.trim()) throw new Error('Supplier ka poora naam likhein.');
        const code = `SUPP-${newSuppName.toUpperCase().replace(/\s+/g, '-').slice(0, 8)}-${Date.now().toString().slice(-4)}`;
        const created = await api.post<{ id: number; name: string }>('/parties/suppliers', {
          code,
          name: newSuppName.trim(),
          phone: newSuppPhone.trim() || '0000-0000000',
          address: newSuppAddress.trim() || '',
          openingBalanceOwn: newSuppBalance || '0.00',
          openingBalanceConsignment: '0.00',
        });
        effectiveSupplierId = created.id;
        setSupplierId(created.id);
        setSupplierMode('existing');
        setNewSuppName(''); setNewSuppPhone(''); setNewSuppAddress(''); setNewSuppBalance('0.00');
      }
      if (!effectiveSupplierId) throw new Error('Baraye meharbani supplier muntakhib ya create karein.');

      // Line items validation
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.itemName.trim()) {
          setStatusMsg({ type: 'error', text: `Item #${i + 1}: Item ka naam likhna zaroori hai.` });
          setLoading(false);
          return;
        }
        const qty = parseFloat(l.enteredQuantity);
        if (!(qty > 0)) {
          setStatusMsg({ type: 'error', text: `Item #${i + 1} (${l.itemName}): Quantity 0 se bari honi chahiye.` });
          setLoading(false);
          return;
        }
        const rate = parseFloat(l.ratePerEnteredUnit);
        if (!(rate > 0)) {
          setStatusMsg({ type: 'error', text: `Item #${i + 1} (${l.itemName}): Purchase rate 0 se bara hona chahiye.` });
          setLoading(false);
          return;
        }
      }

      const notesArr: string[] = [];
      if (notes.trim()) notesArr.push(notes.trim());
      // line-level extra charges descriptions
      lines.forEach((l, i) => {
        const amt = parseFloat(l.extraChargesAmount) || 0;
        if (amt > 0) {
          const desc = l.extraChargesNote.trim() ? l.extraChargesNote.trim() : 'Extra Charges';
          notesArr.push(`Item ${i + 1} (${l.itemName}) – ${desc}: Rs.${amt.toFixed(2)}`);
        }
      });
      if (extraChargesNum > 0)
        notesArr.push(`Extra Charges: Rs.${extraChargesNum.toFixed(2)}${extraChargesNote.trim() ? ` (${extraChargesNote.trim()})` : ''}`);
      const finalNotes = notesArr.join(' | ') || undefined;

      // Calculate total gross across lines to allocate header extra charges
      let totalGross = 0;
      lines.forEach((l) => {
        const qty = parseFloat(l.enteredQuantity) || 0;
        const rate = parseFloat(l.ratePerEnteredUnit) || 0;
        totalGross += qty * rate;
      });

      // Resolve items and prepare lines for backend
      const resolvedLines = await Promise.all(
        lines.map(async (l) => {
          const { itemId, unitId } = await resolveItem(l);
          const lineGross = (parseFloat(l.enteredQuantity) || 0) * (parseFloat(l.ratePerEnteredUnit) || 0);
          const lineExtra = parseFloat(l.extraChargesAmount) || 0;

          // Proportional share of header extra charges if entered
          let allocatedHeaderExtra = 0;
          if (extraChargesNum > 0 && totalGross > 0) {
            allocatedHeaderExtra = (lineGross / totalGross) * extraChargesNum;
          } else if (extraChargesNum > 0 && lines.length > 0) {
            allocatedHeaderExtra = extraChargesNum / lines.length;
          }

          const totalLineFreight = lineExtra + allocatedHeaderExtra;

          return {
            itemId,
            enteredQuantity: l.enteredQuantity,
            unitId,
            ratePerEnteredUnit: l.ratePerEnteredUnit,
            discountAmount: l.discountAmount || '0.00',
            freightAllocation: totalLineFreight > 0 ? totalLineFreight.toFixed(4) : '0.0000',
            loadingAllocation: '0.0000',
          };
        })
      );

      const res = await api.post<any>('/purchases', {
        supplierId: Number(effectiveSupplierId),
        invoiceNumber,
        invoiceDate,
        paymentMethod,
        paidAmount:
          paymentMethod === 'PARTIAL'
            ? paidAmount
            : paymentMethod === 'CASH' || paymentMethod === 'BANK'
              ? grandTotal.toFixed(2)
              : '0.00',
        notes: finalNotes,
        items: resolvedLines,
      });

      setStatusMsg({
        type: 'success',
        text: `Kharidari Invoice ${res.invoiceNumber ?? invoiceNumber} kamyabi se darj ho gaya! (${resolvedLines.length} item${resolvedLines.length > 1 ? 's' : ''})`,
        invoiceNumber: res.invoiceNumber ?? invoiceNumber,
      });
      setSelectedInvoiceForModal(res);
      setIsInvoiceModalOpen(true);
      const baseUnit = units.find((u) => u.isBaseUnit) ?? units[0];
      setLines([blankLine(baseUnit?.id ?? 0, baseUnit?.name ?? 'KG')]);
      setExtraCharges(''); setExtraChargesNote(''); setNotes('');
      setPaidAmount('0.00'); setPaymentMethod('CREDIT');
      setInvoiceNumber(`PUR-${Date.now().toString().slice(-6)}`);
      await loadData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Purchase invoice darj karne mein masla aya' });
    } finally { setLoading(false); }
  };

  /* ─────────────────── delete ─────────────────── */
  const handleDeletePurchase = (id: number, invoiceNum: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Purchase Invoice',
      message: `Delete purchase invoice "${invoiceNum}"?\n\nThis will reverse stock batches and restore supplier balances.`,
      confirmLabel: 'Yes, Delete Invoice',
      isDestructive: true,
      onConfirm: async () => {
        // Optimistic UI update: instantly remove from table
        const backup = [...purchaseHistory];
        setPurchaseHistory((prev) => prev.filter((p) => p.id !== id));
        try {
          const res = await api.delete<{ message: string; data?: { message: string } }>(`/purchases/${id}`);
          setStatusMsg({ type: 'success', text: res.message || res.data?.message || `Invoice ${invoiceNum} deleted.` });
          loadData();
        } catch (err) {
          setPurchaseHistory(backup); // Rollback on error
          setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
        }
      },
    });
  };

  /* ─────────────────── search filter for history ─────────────────── */
  const filteredPurchases = useMemo(() => {
    if (!historySearch.trim()) return purchaseHistory;
    const q = historySearch.toLowerCase().trim();
    return purchaseHistory.filter((p) => {
      const invMatch = (p.invoiceNumber || '').toLowerCase().includes(q);
      const suppMatch =
        (p.supplier?.name || '').toLowerCase().includes(q) ||
        (p.supplier?.phone || '').includes(q);
      const payMatch = (p.paymentMethod || '').toLowerCase().includes(q);
      const notesMatch = (p.notes || '').toLowerCase().includes(q);
      const dateMatch = (p.invoiceDate || '').includes(q);
      const itemsMatch = p.items?.some(
        (it) =>
          (it.item?.name || '').toLowerCase().includes(q) ||
          (it.item?.code || '').toLowerCase().includes(q)
      );
      return invMatch || suppMatch || payMatch || notesMatch || dateMatch || itemsMatch;
    });
  }, [purchaseHistory, historySearch]);

  const selectedSupplier = suppliers.find((s) => s.id === Number(supplierId));

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <div className="page-wrapper" onClick={() => setOpenDropdown(null)}>

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            <ShoppingCart className="w-5 h-5 text-brand-400" />
            Purchase Counter
          </h1>
          <p className="page-subtitle">Post purchase invoices with FIFO stock batches • Updates supplier AP ledger</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadData()} className="btn-secondary" type="button">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="btn-secondary">
            <History className="w-3.5 h-3.5" />
            History ({purchaseHistory.length})
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
          PURCHASE HISTORY (OPENS DIRECTLY UNDER BUTTON)
      ══════════════════════════════════════════ */}
      {showHistory && (
        <div id="purchase-history-section" className="card animate-fade-in overflow-hidden">
          <div className="card-header flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-sky-400" />
              <h3 className="section-title">Purchase History</h3>
              <span className="text-xs text-gray-400 font-medium">
                ({filteredPurchases.length}{filteredPurchases.length !== purchaseHistory.length ? ` of ${purchaseHistory.length}` : ''} records)
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
                  placeholder="Search invoice #, supplier, item, phone..."
                  className="form-input pl-8 pr-7 py-1 text-xs w-64 focus:ring-1 focus:ring-sky-500"
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

          {purchaseHistory.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-10 text-center">No purchases posted yet.</p>
          ) : filteredPurchases.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs italic">
              Koi purchase invoice "{historySearch}" se match nahi hui.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="table-base">
                <thead className="table-head sticky top-0 z-10 bg-gray-50 shadow-xs">
                  <tr>
                    <th className="table-th w-8"></th>
                    <th className="table-th">Invoice #</th>
                    <th className="table-th">Supplier</th>
                    <th className="table-th">Date</th>
                    <th className="table-th">Terms</th>
                    <th className="table-th text-right">Net Landed</th>
                    <th className="table-th text-right">Paid</th>
                    <th className="table-th text-right">Balance</th>
                    <th className="table-th text-center w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((p) => {
                  const isExpanded = expandedRecord === p.id;
                  return (
                    <React.Fragment key={p.id}>
                      <tr className="table-row cursor-pointer hover:bg-sky-500/5"
                        onClick={() => setExpandedRecord(isExpanded ? null : p.id)}>
                        <td className="table-td text-center">
                          {isExpanded
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400 mx-auto" />}
                        </td>
                        <td className="table-td font-mono font-bold text-sky-400 text-[11px]">{p.invoiceNumber}</td>
                        <td className="table-td text-gray-800 font-medium text-sm">
                          {p.supplier?.name || '—'}
                          {p.supplier?.phone && <span className="block text-[10px] text-gray-400">{p.supplier.phone}</span>}
                        </td>
                        <td className="table-td text-gray-500 text-xs">
                          {new Date(p.invoiceDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="table-td">
                          <span className={PAYMENT_META[p.paymentMethod as PaymentMethod]?.badge ?? 'badge-gray'}>
                            {PAYMENT_META[p.paymentMethod as PaymentMethod]?.label ?? p.paymentMethod}
                          </span>
                        </td>
                        <td className="table-td text-right font-mono font-bold text-gray-900">
                          Rs. {parseFloat(p.netLandedAmount).toFixed(2)}
                        </td>
                        <td className="table-td text-right font-mono text-green-600 font-semibold">
                          Rs. {parseFloat(p.paidAmount || '0').toFixed(2)}
                        </td>
                        <td className="table-td text-right font-mono font-bold">
                          <span className={parseFloat(p.remainingBalance || '0') > 0 ? 'text-rose-500' : 'text-green-600'}>
                            Rs. {parseFloat(p.remainingBalance || '0').toFixed(2)}
                          </span>
                        </td>
                        <td className="table-td text-center">
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={async () => {
                                const full = await api.get<any>(`/purchases/${p.id}`);
                                setSelectedInvoiceForModal(full);
                                setIsInvoiceModalOpen(true);
                              }}
                              className="btn-ghost" title="View Invoice">
                              <Eye className="w-3.5 h-3.5 text-gray-500 hover:text-sky-400" />
                            </button>
                            <button onClick={() => handleDeletePurchase(p.id, p.invoiceNumber)}
                              disabled={loading} className="btn-ghost disabled:opacity-30" title="Delete Purchase">
                              <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-400" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <tr className="bg-sky-500/[0.03] border-t border-sky-500/10">
                          <td />
                          <td colSpan={8} className="py-4 px-6">
                            {p.notes && (
                              <p className="text-xs text-gray-500 mb-3 italic">📝 {p.notes}</p>
                            )}
                            <div className="overflow-x-auto rounded-xl border border-gray-200 mb-3">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-gray-100 text-gray-500 font-semibold border-b border-gray-200">
                                  <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Item</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2">Unit</th>
                                    <th className="px-3 py-2 text-right">Rate</th>
                                    <th className="px-3 py-2 text-right">Discount</th>
                                    <th className="px-3 py-2 text-right">Extra</th>
                                    <th className="px-3 py-2 text-right">Net</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {(!p.items || p.items.length === 0) ? (
                                    <tr>
                                      <td colSpan={8} className="px-3 py-4 text-center text-gray-400 italic">
                                        No item lines recorded for this purchase invoice.
                                      </td>
                                    </tr>
                                  ) : (
                                    p.items.map((it, i) => (
                                      <tr key={it.id || i} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                                        <td className="px-3 py-2 font-semibold text-gray-800">{it.item?.name ?? '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono">{it.enteredQuantity}</td>
                                        <td className="px-3 py-2 text-gray-500">{it.enteredUnitName}</td>
                                        <td className="px-3 py-2 text-right font-mono">Rs. {parseFloat(it.ratePerEnteredUnit || '0').toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-rose-400">
                                          {parseFloat(it.discountAmount || '0') > 0 ? `Rs. ${parseFloat(it.discountAmount).toFixed(2)}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-amber-600">
                                          {parseFloat(it.freightAllocated || '0') > 0
                                            ? `Rs. ${parseFloat(it.freightAllocated!).toFixed(2)}`
                                            : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-800">
                                          Rs. {parseFloat(it.netLandedAmount || '0').toFixed(2)}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex justify-end">
                              <div className="text-xs space-y-1 w-56">
                                {p.notes && p.notes.includes('Extra Charges:') && (() => {
                                  const m = p.notes.match(/Extra Charges: Rs\.([\d.]+)(?:\s*\(([^)]+)\))?/);
                                  if (!m) return null;
                                  return (
                                    <div className="flex justify-between text-amber-600">
                                      <span>Extra{m[2] ? ` (${m[2]})` : ''}:</span>
                                      <span className="font-mono">+ Rs. {parseFloat(m[1]).toFixed(2)}</span>
                                    </div>
                                  );
                                })()}
                                <div className="flex justify-between font-black text-gray-900 border-t border-gray-200 pt-1">
                                  <span>Net Landed:</span>
                                  <span className="font-mono">Rs. {parseFloat(p.netLandedAmount).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-green-600 font-semibold">
                                  <span>Paid:</span>
                                  <span className="font-mono">Rs. {parseFloat(p.paidAmount || '0').toFixed(2)}</span>
                                </div>
                                <div className={`flex justify-between font-bold border-t border-gray-200 pt-1 ${parseFloat(p.remainingBalance || '0') > 0 ? 'text-rose-500' : 'text-green-600'}`}>
                                  <span>Balance (AP):</span>
                                  <span className="font-mono">Rs. {parseFloat(p.remainingBalance || '0').toFixed(2)}</span>
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
          PURCHASE FORM
      ══════════════════════════════════════════ */}
      <form onSubmit={handleSubmit} className="card p-5 space-y-5" onClick={(e) => e.stopPropagation()}>

        {/* form header */}
        <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
          <ShoppingCart className="w-4 h-4 text-brand-400" />
          <h3 className="section-title">New Purchase Invoice</h3>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400">Grand Total:</span>
            <span className="font-mono font-bold text-sky-400 text-sm bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-lg">
              Rs. {grandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Supplier ── */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Building2 className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Supplier / Vendor</span>
            <div className="ml-auto flex items-center gap-1 bg-gray-200 rounded-lg p-0.5">
              <button type="button" onClick={() => setSupplierMode('existing')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${supplierMode === 'existing' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Existing Supplier
              </button>
              <button type="button" onClick={() => setSupplierMode('new')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${supplierMode === 'new' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <UserPlus className="w-3 h-3" />New Supplier
              </button>
            </div>
          </div>

          {supplierMode === 'existing' ? (
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <label className="form-label">Select Supplier</label>
                <select required value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))} className="form-select">
                  <option value={0} disabled>— Select Supplier —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>
              {selectedSupplier && (
                <div className="flex flex-col text-xs pb-1">
                  <span className="text-gray-400">Outstanding Payable (AP)</span>
                  <span className={`font-mono font-bold text-sm ${parseFloat(selectedSupplier.currentBalanceOwn || '0') > 0 ? 'text-rose-500' : 'text-green-600'}`}>
                    Rs. {parseFloat(selectedSupplier.currentBalanceOwn || '0').toFixed(2)}
                  </span>
                  {selectedSupplier.phone && <span className="text-gray-400 text-[10px]">{selectedSupplier.phone}</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">Full Name *</label>
                  <input type="text" value={newSuppName} onChange={(e) => setNewSuppName(e.target.value)} placeholder="Supplier name" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input type="text" value={newSuppPhone} onChange={(e) => setNewSuppPhone(e.target.value)} placeholder="03xx-xxxxxxx" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Address</label>
                  <input type="text" value={newSuppAddress} onChange={(e) => setNewSuppAddress(e.target.value)} placeholder="City / area" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Opening Balance (Rs.)</label>
                  <input type="number" step="any" value={newSuppBalance} onChange={(e) => setNewSuppBalance(e.target.value)} className="form-input font-mono" />
                </div>
              </div>
              <button type="button" onClick={handleCreateSupplier} disabled={!newSuppName.trim() || creatingSupp} className="btn-primary">
                <UserPlus className="w-3.5 h-3.5" />
                {creatingSupp ? 'Creating…' : 'Create & Select Supplier'}
              </button>
            </div>
          )}
        </div>

        {/* ── Invoice Header ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="form-label">Invoice #</label>
            <input type="text" required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="form-input font-mono" />
          </div>
          <div>
            <label className="form-label">Purchase Date</label>
            <input type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label">Payment Terms</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="form-select">
              <option value="CREDIT">Full Credit (AP — Pay Later)</option>
              <option value="CASH">Cash (Naqad — Pay Now)</option>
              <option value="BANK">Bank Transfer / Cheque</option>
              <option value="PARTIAL">Partial Payment (Down + AP)</option>
            </select>
          </div>
          {paymentMethod === 'PARTIAL' ? (
            <div>
              <label className="form-label">Down Payment Paid (Rs.)</label>
              <input type="number" step="any" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="form-input font-mono" placeholder="0.00" />
            </div>
          ) : (
            <div>
              <label className="form-label">Notes (Optional)</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remarks…" className="form-input" />
            </div>
          )}
        </div>
        {paymentMethod === 'PARTIAL' && (
          <div className="max-w-sm">
            <label className="form-label">Notes (Optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remarks…" className="form-input" />
          </div>
        )}

        {/* ══ Line Items ══ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Kharidari Maal (Purchase Line Items)
              </span>
              <span className="text-xs font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold">
                {lines.length} item{lines.length > 1 ? 's' : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={addLine}
              className="btn-secondary py-1 px-3 text-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-brand-500" />
              + Aur Item Shamil Karein
            </button>
          </div>

          {lines.map((line, idx) => {
            // Bug #4 Fix: Purchase should ONLY show own-stock items — exclude commission/consignment items
            const ownStockItems = allItems.filter((i: any) => {
              const catName = (i.category?.name || '').toLowerCase();
              return !catName.includes('consign') && !catName.includes('commis');
            });
            const filteredPool = line.itemName
              ? ownStockItems.filter((i) => i.name.toLowerCase().includes(line.itemName.toLowerCase()))
              : ownStockItems;

            const selectedItem = line.selectedItemId
              ? ownStockItems.find((i) => i.id === line.selectedItemId) ?? null
              : null;

            const lineTotal =
              (parseFloat(line.enteredQuantity) || 0) * (parseFloat(line.ratePerEnteredUnit) || 0) -
              (parseFloat(line.discountAmount) || 0) +
              (parseFloat(line.extraChargesAmount) || 0);

            return (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-3 relative bg-gray-50">

                {/* ─ row header ─ */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-200 rounded px-2 py-0.5">
                    Item #{idx + 1}
                  </span>
                  {line.selectedItemId > 0 && selectedItem ? (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      Mojooda Item (In-Stock: {parseFloat((selectedItem as Item).ownStockRemaining || '0').toFixed(1)} {selectedItem.baseUnit.name})
                    </span>
                  ) : line.itemName.trim() ? (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 flex items-center gap-1">
                      <Plus className="w-3 h-3 text-amber-600" />
                      Naya Item (Auto Create Hoga)
                    </span>
                  ) : null}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-sky-600">Rs. {lineTotal.toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-500 disabled:opacity-20 transition"
                      title="Line delete karein"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* ─ main fields ─ */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">

                  {/* Item search with autocomplete */}
                  <div className="md:col-span-2 relative">
                    <label className="form-label">Item / Commodity Name *</label>
                    <input
                      type="text"
                      required
                      value={line.itemName}
                      onChange={(e) => {
                        updateLine(idx, { itemName: e.target.value, selectedItemId: 0 });
                        setOpenDropdown(idx);
                      }}
                      onFocus={() => setOpenDropdown(idx)}
                      placeholder="Item ka naam likhein ya chunein…"
                      className={`form-input ${line.selectedItemId ? 'border-green-400 ring-1 ring-green-400/30' : line.itemName ? 'border-amber-400' : ''}`}
                      autoComplete="off"
                    />

                    {/* dropdown */}
                    {openDropdown === idx && (
                      <div
                        className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {filteredPool.slice(0, 25).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-brand-600/10 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                            onClick={() => selectItem(idx, item)}
                          >
                            <span className="font-semibold text-gray-800">{item.name}</span>
                            <span className="text-gray-400 font-mono text-[10px] shrink-0 flex items-center gap-1">
                              {item.ownStockRemaining !== undefined && (
                                <span className="text-sky-600 font-bold">
                                  {parseFloat(item.ownStockRemaining).toFixed(1)} {item.baseUnit.name}
                                </span>
                              )}
                              {item.ownStockRemaining === undefined && item.baseUnit.name}
                              {item.conversions.length > 0 && (
                                <span className="text-gray-400 ml-1">
                                  / {item.conversions.map((c) => c.unit.name).join(' / ')}
                                </span>
                              )}
                            </span>
                          </button>
                        ))}

                        {/* Manual / Naya Item create button in dropdown */}
                        {line.itemName.trim() && (
                          <div className="p-2 border-t border-gray-100 bg-sky-50/50">
                            <button
                              type="button"
                              className="w-full text-left px-2.5 py-1.5 text-xs text-sky-700 font-bold hover:bg-sky-100/60 rounded flex items-center gap-1.5"
                              onClick={() => {
                                const baseUnit = units.find((u) => u.isBaseUnit) ?? units[0];
                                updateLine(idx, {
                                  selectedItemId: 0,
                                  unitId: line.unitId || (baseUnit?.id ?? 0),
                                  unitName: line.unitName || (baseUnit?.name ?? 'KG'),
                                });
                                setOpenDropdown(null);
                              }}
                            >
                              <Plus className="w-3.5 h-3.5 text-sky-600" />
                              Naya Item banayein: <span className="underline">"{line.itemName}"</span>
                            </button>
                          </div>
                        )}

                        {filteredPool.length === 0 && !line.itemName.trim() && (
                          <p className="p-3 text-xs text-gray-400 italic">No matching items found.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Unit */}
                  <div>
                    <label className="form-label">Unit *</label>
                    {line.selectedItemId > 0 && selectedItem ? (
                      <select
                        value={line.unitId || selectedItem.baseUnit.id}
                        onChange={(e) => handleUnitChange(idx, Number(e.target.value))}
                        className="form-select"
                      >
                        <option value={selectedItem.baseUnit.id}>{selectedItem.baseUnit.name} (Base)</option>
                        {selectedItem.conversions?.map((c) => (
                          <option key={c.unitId} value={c.unitId}>
                            {c.unit.name} ({parseFloat(c.multiplierToBase)} KG)
                          </option>
                        ))}
                        {units
                          .filter((u) => u.id !== selectedItem.baseUnit.id && !selectedItem.conversions?.some((c) => c.unitId === u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} (Auto-Convert)
                            </option>
                          ))}
                      </select>
                    ) : (
                      <select
                        value={line.unitId || (units.find((u) => u.isBaseUnit)?.id ?? 0)}
                        onChange={(e) => handleUnitChange(idx, Number(e.target.value))}
                        className="form-select"
                      >
                        <option value={0} disabled>— Unit Chunein —</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} {u.isBaseUnit ? '(Base KG)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="form-label">Quantity *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.001"
                      value={line.enteredQuantity}
                      onChange={(e) => updateLine(idx, { enteredQuantity: e.target.value })}
                      className="form-input font-mono"
                      placeholder="0"
                    />
                  </div>

                  {/* Rate */}
                  <div>
                    <label className="form-label">
                      Purchase Rate (Rs. / {line.unitName || units.find((u) => u.id === line.unitId)?.symbol || 'unit'}) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.0001"
                      value={line.ratePerEnteredUnit}
                      onChange={(e) => updateLine(idx, { ratePerEnteredUnit: e.target.value })}
                      className="form-input font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* ─ second row: discount + extra charges ─ */}
                <div className="flex items-end gap-4 flex-wrap">
                  <div className="w-36">
                    <label className="form-label">Discount (Rs.)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={line.discountAmount}
                      onChange={(e) => updateLine(idx, { discountAmount: e.target.value })}
                      className="form-input font-mono text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="w-36">
                    <label className="form-label">Extra Charges (Rs.)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={line.extraChargesAmount}
                      onChange={(e) => updateLine(idx, { extraChargesAmount: e.target.value })}
                      className="form-input font-mono text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px] max-w-xs">
                    <label className="form-label">Extra Charges Description</label>
                    <input
                      type="text"
                      value={line.extraChargesNote}
                      onChange={(e) => updateLine(idx, { extraChargesNote: e.target.value })}
                      className="form-input text-sm"
                      placeholder="Freight, loading, etc."
                    />
                  </div>
                  <div className="pb-2.5 text-xs text-gray-400">
                    Line Total = Qty × Rate − Disc + Extra =&nbsp;
                    <span className="font-mono font-bold text-gray-700">Rs. {lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addLine}
            className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-brand-500 rounded-xl text-sm font-semibold text-gray-600 hover:text-brand-600 hover:bg-brand-50/50 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4 text-brand-500" />
            + Aur Item Shamil Karein (Add Another Item)
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
              <label className="form-label">Note (e.g. Customs, Misc)</label>
              <input type="text" value={extraChargesNote} onChange={(e) => setExtraChargesNote(e.target.value)}
                className="form-input" placeholder="Customs duty, misc charges, etc." />
            </div>
          </div>
        </div>

        {/* ── Totals Summary ── */}
        <div className="flex justify-end">
          <div className="w-72 space-y-2 text-sm border-t-2 border-gray-200 pt-3">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal ({lines.length} Items):</span>
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
              <span className="font-mono text-sky-500">Rs. {grandTotal.toFixed(2)}</span>
            </div>
            {paymentMethod === 'PARTIAL' && (
              <>
                <div className="flex justify-between text-green-600 font-semibold">
                  <span>Paid Now:</span>
                  <span className="font-mono">Rs. {(parseFloat(paidAmount) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-500 font-semibold">
                  <span>Remaining (AP):</span>
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
                <span>Added to AP:</span>
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
            disabled={
              loading ||
              (supplierMode === 'existing' && !supplierId) ||
              (supplierMode === 'new' && !newSuppName.trim()) ||
              lines.some(
                (l) =>
                  !l.itemName.trim() ||
                  !(parseFloat(l.enteredQuantity) > 0) ||
                  !(parseFloat(l.ratePerEnteredUnit) > 0)
              )
            }
            className="btn-primary px-6 py-2.5"
          >
            <ShoppingCart className="w-4 h-4" />
            {loading ? 'Posting Invoice…' : `Post Purchase Invoice (${lines.length} Items)`}
          </button>
        </div>
      </form>

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        type="purchase"
        invoice={selectedInvoiceForModal}
      />

      {/* Confirmation Modal — avoids native window.confirm Electron input freeze */}
      <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
};
