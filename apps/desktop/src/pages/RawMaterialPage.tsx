import React, { useEffect, useState, useMemo } from 'react';
import {
  Boxes, Plus, CheckCircle, AlertCircle, Package, History,
  Trash2, ChevronDown, ChevronUp, User, X, RefreshCw, Truck, Pencil, Save, Search,
} from 'lucide-react';
import { api } from '../api/client.js';

/* ─── Types ─── */
interface Item {
  id: number; name: string; code: string;
  baseUnit: { id: number; name: string };
  conversions: Array<{ unitId: number; unit: { id: number; name: string }; multiplierToBase: string }>;
  ownStockRemaining?: string;
  totalStockRemaining?: string;
}
interface Unit { id: number; name: string; code: string; symbol: string; isBaseUnit: boolean; }
interface Category { id: number; name: string; }
interface Supplier { id: number; name: string; code: string; phone?: string; currentBalanceOwn?: string; }

interface OpeningEntryItem {
  id: number;
  ownershipType: string;
  enteredQuantity: string;
  enteredUnitName: string;
  unitCost: string;
  batchNumber: string;
  notes: string | null;
  item: { id: number; name: string; code: string };
  supplier?: { id: number; name: string; code: string } | null;
  remainingQuantity?: string;
  soldQuantity?: string;
  batchStatus?: string;
}
interface OpeningEntry {
  id: number;
  entryNumber: string;
  entryDate: string;
  notes: string | null;
  items: OpeningEntryItem[];
}

type PaymentType = 'CREDIT' | 'DEBIT' | 'OPENING_STOCK';
type SupplierMode = 'existing' | 'new';

/* ─── New-entry form ─── */
interface RawForm {
  materialName: string;
  selectedItemId: number;
  quantity: string;
  selectedUnitId: number;
  purchaseRate: string;
  extraCharges: string;
  extraChargesNote: string;
  paymentType: PaymentType;
  supplierMode: SupplierMode;
  existingSupplierId: string;
  newSupplierName: string;
  newSupplierPhone: string;
  newSupplierAddress: string;
  batchNumber: string;
}

const blankForm = (): RawForm => ({
  materialName: '', selectedItemId: 0,
  quantity: '', selectedUnitId: 0,
  purchaseRate: '', extraCharges: '', extraChargesNote: '',
  paymentType: 'DEBIT',
  supplierMode: 'existing', existingSupplierId: '',
  newSupplierName: '', newSupplierPhone: '', newSupplierAddress: '',
  batchNumber: `RM-${Date.now().toString().slice(-5)}`,
});

/* ─── Edit form (per item line) ─── */
interface EditLineForm {
  itemLineId: number;
  itemName: string;
  quantity: string;
  unitName: string;
  purchaseRate: string;
  extraCharges: string;
  extraChargesNote: string;
  paymentType: string;
  supplierId: string;
  userNote: string;
}

/* ─── Helpers ─── */
const parseNotes = (notes: string | null) => {
  if (!notes) return { paymentType: '', extraCharges: '', extraChargesNote: '', userNote: '' };
  const parts = notes.split(' | ');
  let paymentType = '', extraCharges = '', extraChargesNote = '';
  const remaining: string[] = [];
  for (const p of parts) {
    if (p.startsWith('Payment: ')) {
      paymentType = p.replace('Payment: ', '');
    } else if (p.startsWith('Extra Charges: ')) {
      const m = p.match(/Extra Charges: Rs\.([\d.]+)(?:\s+\((.+)\))?/);
      if (m) { extraCharges = m[1]; extraChargesNote = m[2] ?? ''; }
    } else {
      remaining.push(p);
    }
  }
  return { paymentType, extraCharges, extraChargesNote, userNote: remaining.join(' | ') };
};

const PAYMENT_BADGE: Record<string, string> = {
  CREDIT: 'bg-sky-100 text-sky-700 border border-sky-200',
  DEBIT: 'bg-brand-600/10 text-brand-700 border border-brand-600/20',
  OPENING_STOCK: 'bg-amber-100 text-amber-700 border border-amber-200',
};
const PAYMENT_LABEL: Record<string, string> = {
  CREDIT: 'Credit (Udhaar)', DEBIT: 'Naqad', OPENING_STOCK: 'Opening Stock',
};

/* ══════════════════════════════════════════
   Component
══════════════════════════════════════════ */
export const RawMaterialPage: React.FC = () => {
  /* master data */
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [openingHistory, setOpeningHistory] = useState<OpeningEntry[]>([]);

  /* UI */
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /* new-entry form */
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryNotes, setEntryNotes] = useState('');
  const [forms, setForms] = useState<RawForm[]>([blankForm()]);

  /* edit state */
  const [editEntryId, setEditEntryId] = useState<number | null>(null);
  const [editEntryNotes, setEditEntryNotes] = useState('');
  const [editLines, setEditLines] = useState<EditLineForm[]>([]);

  /* ── Load ── */
  const loadData = async (resetForm = false) => {
    try {
      const [itemsData, unitsData, catsData, suppData, histData] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<Unit[]>('/items/units'),
        api.get<Category[]>('/items/categories'),
        api.get<Supplier[]>('/parties/suppliers'),
        api.get<OpeningEntry[]>('/opening-stock'),
      ]);
      setItems(itemsData);
      setUnits(unitsData);
      setCategories(catsData);
      setSuppliers(suppData);
      setOpeningHistory(histData);

      // Only touch the form on initial load OR after a successful submit (resetForm=true)
      // Never merge into existing form state — that was causing paymentType to persist
      const baseUnit = unitsData.find((u) => u.isBaseUnit) ?? unitsData[0];
      if (resetForm) {
        // Fresh blank form with correct default unitId
        setForms([{ ...blankForm(), selectedUnitId: baseUnit?.id ?? 0 }]);
        setEntryNotes('');
      } else {
        // Initial load: only set unitId if form is still blank (no user input yet)
        setForms((prev) => prev.map((f) => ({
          ...f,
          selectedUnitId: f.selectedUnitId || (baseUnit?.id ?? 0),
        })));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(false); }, []);

  /* ── Computed totals (new form) ── */
  const baseValue = (f: RawForm) => (parseFloat(f.quantity) || 0) * (parseFloat(f.purchaseRate) || 0);
  const totalValue = (f: RawForm) => (baseValue(f) + (parseFloat(f.extraCharges) || 0)).toFixed(2);

  const updateForm = (idx: number, field: keyof RawForm, value: string | number) =>
    setForms((prev) => prev.map((f, i) => (i === idx ? { ...f, [field]: value } : f)));

  const handleNameChange = (idx: number, value: string) => {
    const matched = items.find((it) => it.name.toLowerCase() === value.toLowerCase());
    setForms((prev) => prev.map((f, i) =>
      i === idx ? { ...f, materialName: value, selectedItemId: matched ? matched.id : 0 } : f
    ));
  };

  /* ── Resolve supplier ── */
  const resolveSupplier = async (f: RawForm): Promise<number | undefined> => {
    if (f.supplierMode === 'existing') return f.existingSupplierId ? Number(f.existingSupplierId) : undefined;
    if (!f.newSupplierName.trim()) return undefined;
    const res = await api.post<{ id: number }>('/parties/suppliers', {
      code: `SUPP-${Date.now().toString().slice(-4)}`,
      name: f.newSupplierName.trim(),
      phone: f.newSupplierPhone.trim() || '0000-0000000',
      address: f.newSupplierAddress.trim() || '',
      openingBalanceOwn: '0.00', openingBalanceConsignment: '0.00',
    });
    return res.id;
  };

  /* ── Resolve item ── */
  const resolveItem = async (f: RawForm): Promise<{ itemId: number; unitId: number }> => {
    if (f.selectedItemId) {
      const item = items.find((it) => it.id === f.selectedItemId);
      return { itemId: f.selectedItemId, unitId: f.selectedUnitId || (item?.baseUnit.id ?? units[0]?.id ?? 1) };
    }
    const name = f.materialName.trim();
    if (!name) throw new Error('Material name is required');
    const defaultCategoryId = categories[0]?.id;
    if (!defaultCategoryId) throw new Error('No item categories found on server.');

    // HAMESHA KG (base unit) ko item ka baseUnit rakho — chahe user ne Mann ya koi bhi unit select ki ho
    const kgUnit = units.find((u) => u.isBaseUnit);
    const trueBaseUnitId = kgUnit?.id || units[0]?.id;
    if (!trueBaseUnitId) throw new Error('No units found on server.');

    const selectedUnitId = f.selectedUnitId || trueBaseUnitId;
    const isNonBaseUnit = selectedUnitId !== trueBaseUnitId;

    // Agar user ne non-base unit (Mann wagera) select ki, to us ka multiplier dhundo
    // Pehle kisi existing item ke conversions se lookup, warna default 40 (Mann = 40 KG)
    let conversions: Array<{ unitId: number; multiplierToBase: string }> = [];
    if (isNonBaseUnit) {
      // Kisi existing item mein is unit ka conversion hai?
      let multiplier = '40.000000'; // default Mann = 40 KG
      for (const existingItem of items) {
        const conv = existingItem.conversions?.find((c) => c.unitId === selectedUnitId);
        if (conv) {
          multiplier = conv.multiplierToBase;
          break;
        }
      }
      conversions = [{ unitId: selectedUnitId, multiplierToBase: multiplier }];
    }

    const code = `RM-${name.toUpperCase().replace(/\s+/g, '-').slice(0, 10)}-${Date.now().toString().slice(-4)}`;
    const created = await api.post<{ id: number }>('/items', {
      code, name, categoryId: defaultCategoryId,
      baseUnitId: trueBaseUnitId,  // ALWAYS KG
      minStockLevel: '0.000000',
      conversions: conversions.length > 0 ? conversions : undefined,
    });
    // unitId as the user-selected unit (Mann wagera) return karo — server pe conversion hai ab
    return { itemId: created.id, unitId: selectedUnitId };
  };

  /* ── Submit new entry ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null); setLoading(true);

    // Validate rates before sending
    for (let i = 0; i < forms.length; i++) {
      const f = forms[i];
      if (f.paymentType !== 'OPENING_STOCK' && !(parseFloat(f.purchaseRate) > 0)) {
        setStatusMsg({ type: 'error', text: `Line ${i + 1}: Purchase rate is required (must be > 0).` });
        setLoading(false);
        return;
      }
    }

    try {
      const resolvedLines = await Promise.all(forms.map(async (f) => {
        const supplierId = await resolveSupplier(f);
        const { itemId, unitId } = await resolveItem(f);

        // Always send the actual rate entered by user
        const rateVal = parseFloat(f.purchaseRate);
        const unitCostStr = (rateVal > 0)
          ? rateVal.toFixed(4)
          : '0.0000';

        const extraVal = parseFloat(f.extraCharges);
        const extraChargesStr = (extraVal > 0) ? extraVal.toFixed(4) : '0.0000';

        console.log(`[submit] line: ${f.materialName}, rate: ${unitCostStr}, extra: ${extraChargesStr}, payment: ${f.paymentType}`);

        return {
          itemId,
          ownershipType: 'OWN' as const,
          supplierId: supplierId ?? null,
          enteredQuantity: f.quantity,
          unitId,
          unitCost: unitCostStr,
          extraCharges: extraChargesStr,
          extraChargesNote: f.extraChargesNote.trim() || undefined,
          paymentType: f.paymentType,
          batchNumber: f.batchNumber,
        };
      }));

      await api.post('/opening-stock', { entryDate, notes: entryNotes || undefined, items: resolvedLines });
      setStatusMsg({ type: 'success', text: `${forms.length} raw material line(s) added successfully!` });
      // resetForm=true: loadData will set a fresh blankForm with correct unitId — no stale state
      await loadData(true);
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to post entry' });
    } finally { setLoading(false); }
  };

  /* ── Open edit mode ── */
  const openEdit = (entry: OpeningEntry) => {
    setEditEntryId(entry.id);
    setEditEntryNotes(entry.notes ?? '');
    setExpandedEntry(entry.id);
    setEditLines(entry.items.map((it) => {
      const { paymentType, extraCharges, extraChargesNote, userNote } = parseNotes(it.notes);
      return {
        itemLineId: it.id,
        itemName: it.item.name,
        quantity: it.enteredQuantity,
        unitName: it.enteredUnitName,
        purchaseRate: parseFloat(it.unitCost) > 0 ? parseFloat(it.unitCost).toFixed(2) : '',
        extraCharges: extraCharges || '',
        extraChargesNote: extraChargesNote || '',
        paymentType: paymentType || 'DEBIT',
        supplierId: it.supplier ? String(it.supplier.id) : '',
        userNote: userNote || '',
      };
    }));
  };

  const updateEditLine = (idx: number, field: keyof EditLineForm, value: string) =>
    setEditLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));

  /* ── Save edit ── */
  const handleSaveEdit = async () => {
    if (!editEntryId) return;
    setLoading(true); setStatusMsg(null);
    try {
      await api.patch(`/opening-stock/${editEntryId}`, {
        notes: editEntryNotes || undefined,
        items: editLines.map((l) => ({
          id: l.itemLineId,
          unitCost: parseFloat(l.purchaseRate) > 0 ? parseFloat(l.purchaseRate).toFixed(4) : '0.0000',
          supplierId: l.supplierId ? Number(l.supplierId) : null,
          extraCharges: parseFloat(l.extraCharges) > 0 ? parseFloat(l.extraCharges).toFixed(4) : '0.0000',
          extraChargesNote: l.extraChargesNote.trim() || undefined,
          paymentType: l.paymentType || 'DEBIT',
          userNote: l.userNote.trim() || undefined,
        })),
      });
      setStatusMsg({ type: 'success', text: 'Entry updated successfully!' });
      setEditEntryId(null); setEditLines([]);
      loadData(false);
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Update failed' });
    } finally { setLoading(false); }
  };

  /* ── Delete ── */
  const handleDeleteEntry = async (id: number, entryNumber: string) => {
    if (!window.confirm(`Delete entry "${entryNumber}"?\n\nThis will remove stock batches and reverse accounting entries.`)) return;
    try {
      setLoading(true);
      await api.delete(`/opening-stock/${id}`);
      setStatusMsg({ type: 'success', text: `Entry ${entryNumber} deleted.` });
      loadData(false);
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
    } finally { setLoading(false); }
  };

  /* ─────────────────── search filter for history ─────────────────── */
  const filteredEntries = useMemo(() => {
    if (!historySearch.trim()) return openingHistory;
    const q = historySearch.toLowerCase().trim();
    return openingHistory.filter((entry) => {
      const numMatch = (entry.entryNumber || '').toLowerCase().includes(q);
      const dateMatch = (entry.entryDate || '').includes(q);
      const notesMatch = (entry.notes || '').toLowerCase().includes(q);
      const itemsMatch = entry.items?.some(
        (it) =>
          (it.item?.name || '').toLowerCase().includes(q) ||
          (it.item?.code || '').toLowerCase().includes(q) ||
          (it.batchNumber || '').toLowerCase().includes(q) ||
          (it.supplier?.name || '').toLowerCase().includes(q) ||
          (it.notes || '').toLowerCase().includes(q)
      );
      return numMatch || dateMatch || notesMatch || itemsMatch;
    });
  }, [openingHistory, historySearch]);

  /* ══════════════════════ RENDER ══════════════════════ */
  return (
    <div className="page-wrapper">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title"><Boxes className="w-5 h-5 text-brand-600" />Raw Material Entry</h1>
          <p className="page-subtitle">Add raw stock — quantity, rate, extra charges &amp; supplier</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => loadData(false)} className="btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="btn-secondary">
            <History className="w-3.5 h-3.5" />
            History ({openingHistory.length})
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div className={statusMsg.type === 'success' ? 'alert-success' : 'alert-error'}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* ══ HISTORY ══ */}
      {showHistory && (
        <div className="card animate-fade-in overflow-hidden">
          <div className="card-header flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-500" />
              <h3 className="section-title">Posted Raw Material Entries</h3>
              <span className="text-xs text-gray-400 font-medium">
                ({filteredEntries.length}{filteredEntries.length !== openingHistory.length ? ` of ${openingHistory.length}` : ''} entries)
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
                  placeholder="Search entry #, material, supplier, batch..."
                  className="form-input pl-8 pr-7 py-1 text-xs w-64 focus:ring-1 focus:ring-amber-500"
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

          {/* Live stock pills - only show items with active positive stock */}
          {items.filter((it) => parseFloat(it.ownStockRemaining || '0') > 0).length > 0 && (
            <div className="bg-amber-50/50 border-b border-gray-100 px-5 py-2.5 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-500 font-semibold text-[11px] uppercase tracking-wider">Live Raw Stock:</span>
              {items
                .filter((it) => parseFloat(it.ownStockRemaining || '0') > 0)
                .map((it) => (
                  <span key={it.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-lg shadow-2xs">
                    <span className="font-bold text-gray-800">{it.name}:</span>
                    <span className="font-mono font-bold text-brand-600">
                      {parseFloat(it.ownStockRemaining || '0').toFixed(2)} {it.baseUnit.name}
                    </span>
                  </span>
                ))}
            </div>
          )}

          {openingHistory.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-8 text-center">No entries yet.</p>
          ) : filteredEntries.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs italic">
              Koi raw material entry "{historySearch}" se match nahi hui.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="table-base">
                <thead className="table-head sticky top-0 z-10 bg-gray-50 shadow-xs">
                  <tr>
                    <th className="table-th w-8"></th>
                    <th className="table-th">Entry #</th>
                    <th className="table-th">Date</th>
                    <th className="table-th">Materials</th>
                    <th className="table-th text-right">Grand Total</th>
                    <th className="table-th">Entry Notes</th>
                    <th className="table-th text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                  const grandTotal = entry.items.reduce((sum, it) => {
                    const { extraCharges } = parseNotes(it.notes);
                    return sum
                      + (parseFloat(it.enteredQuantity) || 0) * (parseFloat(it.unitCost) || 0)
                      + (parseFloat(extraCharges) || 0);
                  }, 0);
                  const isExpanded = expandedEntry === entry.id;
                  const isEditing = editEntryId === entry.id;

                  return (
                    <React.Fragment key={entry.id}>
                      {/* Summary row */}
                      <tr
                        className="table-row cursor-pointer hover:bg-brand-600/5"
                        onClick={() => !isEditing && setExpandedEntry(isExpanded ? null : entry.id)}
                      >
                        <td className="table-td text-center">
                          {isExpanded
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400 mx-auto" />}
                        </td>
                        <td className="table-td font-mono font-bold text-brand-600">{entry.entryNumber}</td>
                        <td className="table-td text-gray-500 text-xs">
                          {new Date(entry.entryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="table-td">
                          {entry.items.map((it, i) => (
                            <span key={i} className="inline-flex items-center gap-1 mr-2">
                              <span className="font-semibold text-amber-600 text-xs">{it.item.name}</span>
                              <span className="text-gray-400 text-[10px]">{it.enteredQuantity} {it.enteredUnitName}</span>
                              {it.remainingQuantity !== undefined && (
                                <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                  parseFloat(it.remainingQuantity) <= 0
                                    ? 'bg-rose-100 text-rose-500'
                                    : parseFloat(it.remainingQuantity) < parseFloat(it.enteredQuantity)
                                      ? 'bg-amber-100 text-amber-600'
                                      : 'bg-green-100 text-green-600'
                                }`}>
                                  {parseFloat(it.remainingQuantity).toFixed(2)} left
                                </span>
                              )}
                            </span>
                          ))}
                        </td>
                        <td className="table-td text-right font-mono font-bold text-brand-600">
                          Rs. {grandTotal.toFixed(2)}
                        </td>
                        <td className="table-td text-gray-400 text-xs max-w-[160px] truncate">
                          {entry.notes || '—'}
                        </td>
                        <td className="table-td text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Edit button */}
                            {isEditing ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                                disabled={loading}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-500 disabled:opacity-40 transition"
                              >
                                <Save className="w-3 h-3" />Save
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(entry); }}
                                className="btn-ghost"
                                title="Edit Entry"
                              >
                                <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-brand-600" />
                              </button>
                            )}
                            {/* Cancel edit */}
                            {isEditing && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditEntryId(null); setEditLines([]); }}
                                className="btn-ghost"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" />
                              </button>
                            )}
                            {/* Delete */}
                            {!isEditing && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id, entry.entryNumber); }}
                                disabled={loading}
                                className="btn-ghost disabled:opacity-30"
                                title="Delete Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded: VIEW mode ── */}
                      {isExpanded && !isEditing && entry.items.map((it, i) => {
                        const { paymentType, extraCharges, extraChargesNote, userNote } = parseNotes(it.notes);
                        const baseVal = (parseFloat(it.enteredQuantity) || 0) * (parseFloat(it.unitCost) || 0);
                        const extraVal = parseFloat(extraCharges) || 0;
                        const lineTotal = baseVal + extraVal;

                        return (
                          <tr key={`view-${entry.id}-${i}`} className="bg-gray-50/80 border-t border-gray-100">
                            <td />
                            <td colSpan={6} className="py-3 px-6">
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-3 text-xs">

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Item</span>
                                  <span className="font-bold text-gray-800">{it.item.name}</span>
                                  <span className="text-gray-400 ml-1 text-[10px]">({it.item.code})</span>
                                </div>

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Entered Qty</span>
                                  <span className="font-mono font-bold text-gray-700">{it.enteredQuantity} {it.enteredUnitName}</span>
                                </div>

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Remaining Stock</span>
                                  <span className={`font-mono font-bold ${
                                    parseFloat(it.remainingQuantity || it.enteredQuantity) <= 0
                                      ? 'text-rose-500'
                                      : parseFloat(it.remainingQuantity || it.enteredQuantity) < parseFloat(it.enteredQuantity)
                                        ? 'text-amber-600'
                                        : 'text-green-600'
                                  }`}>
                                    {it.remainingQuantity ?? it.enteredQuantity} {it.enteredUnitName}
                                  </span>
                                  {parseFloat(it.soldQuantity || '0') > 0 && (
                                    <span className="block text-[9px] text-rose-400 font-medium">Sold: {it.soldQuantity} {it.enteredUnitName}</span>
                                  )}
                                </div>

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Rate / Unit</span>
                                  <span className={`font-mono font-bold ${parseFloat(it.unitCost) > 0 ? 'text-gray-800' : 'text-rose-400'}`}>
                                    Rs. {parseFloat(it.unitCost).toFixed(2)}
                                  </span>
                                  {parseFloat(it.unitCost) === 0 && (
                                    <span className="ml-1 text-[10px] text-rose-400">(edit to fix)</span>
                                  )}
                                </div>

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Base Value</span>
                                  <span className="font-mono text-gray-700">Rs. {baseVal.toFixed(2)}</span>
                                </div>

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">
                                    Extra Charges{extraChargesNote ? ` (${extraChargesNote})` : ''}
                                  </span>
                                  {extraVal > 0
                                    ? <span className="font-mono text-amber-600 font-bold">+ Rs. {extraVal.toFixed(2)}</span>
                                    : <span className="text-gray-300">—</span>}
                                </div>

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Line Total</span>
                                  <span className="font-mono font-bold text-brand-600">Rs. {lineTotal.toFixed(2)}</span>
                                </div>

                                <div>
                                  <span className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Payment / Supplier</span>
                                  <div className="flex flex-col gap-1">
                                    {paymentType
                                      ? <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${PAYMENT_BADGE[paymentType] ?? 'bg-gray-100 text-gray-600'}`}>
                                        {PAYMENT_LABEL[paymentType] ?? paymentType}
                                      </span>
                                      : <span className="text-gray-300 text-[10px]">—</span>}
                                    {it.supplier
                                      ? <span className="text-gray-700 font-semibold">{it.supplier.name}</span>
                                      : <span className="text-gray-300">No supplier</span>}
                                  </div>
                                </div>

                                <div className="col-span-2 md:col-span-4 lg:col-span-8 border-t border-gray-200 pt-2 mt-1 flex gap-6 flex-wrap items-center">
                                  <div>
                                    <span className="text-[10px] text-gray-400 uppercase font-semibold">Batch #</span>
                                    <span className="ml-2 font-mono text-gray-600 text-[11px]">{it.batchNumber}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-gray-400 uppercase font-semibold">Batch Status:</span>
                                    <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      it.batchStatus === 'EXHAUSTED' ? 'bg-rose-100 text-rose-600' : 'bg-green-100 text-green-700'
                                    }`}>
                                      {it.batchStatus ?? 'ACTIVE'}
                                    </span>
                                  </div>
                                  {userNote && (
                                    <div>
                                      <span className="text-[10px] text-gray-400 uppercase font-semibold">Note</span>
                                      <span className="ml-2 text-gray-600 text-[11px]">{userNote}</span>
                                    </div>
                                  )}
                                </div>

                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* ── Expanded: EDIT mode ── */}
                      {isExpanded && isEditing && (
                        <tr className="bg-brand-600/[0.03] border-t border-brand-600/20">
                          <td />
                          <td colSpan={6} className="py-4 px-6">
                            {/* Entry-level notes */}
                            <div className="mb-4">
                              <label className="form-label">Entry Notes</label>
                              <input
                                type="text"
                                value={editEntryNotes}
                                onChange={(e) => setEditEntryNotes(e.target.value)}
                                placeholder="Reference / notes for this entry"
                                className="form-input max-w-md"
                              />
                            </div>

                            {/* One card per item line */}
                            <div className="space-y-4">
                              {editLines.map((line, li) => {
                                const editBaseVal = (parseFloat(line.quantity) || 0) * (parseFloat(line.purchaseRate) || 0);
                                const editExtraVal = parseFloat(line.extraCharges) || 0;
                                const editTotal = editBaseVal + editExtraVal;
                                return (
                                  <div key={li} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                                    {/* Item header */}
                                    <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                      <span className="text-xs font-bold text-gray-700">{line.itemName}</span>
                                      <span className="text-[10px] text-gray-400">{line.quantity} {line.unitName}</span>
                                      <span className="ml-auto font-mono font-bold text-brand-600 text-sm">
                                        Rs. {editTotal.toFixed(2)}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                                      {/* Rate */}
                                      <div>
                                        <label className="form-label">Rate / {line.unitName}</label>
                                        <input
                                          type="number" step="any" min="0"
                                          value={line.purchaseRate}
                                          onChange={(e) => updateEditLine(li, 'purchaseRate', e.target.value)}
                                          className="form-input font-mono"
                                          placeholder="0.00"
                                        />
                                      </div>

                                      {/* Extra Charges */}
                                      <div>
                                        <label className="form-label">Extra Charges (Rs.)</label>
                                        <input
                                          type="number" step="any" min="0"
                                          value={line.extraCharges}
                                          onChange={(e) => updateEditLine(li, 'extraCharges', e.target.value)}
                                          className="form-input font-mono"
                                          placeholder="0.00"
                                        />
                                      </div>

                                      {/* Extra charges label */}
                                      <div>
                                        <label className="form-label">Charge Description</label>
                                        <input
                                          type="text"
                                          value={line.extraChargesNote}
                                          onChange={(e) => updateEditLine(li, 'extraChargesNote', e.target.value)}
                                          className="form-input"
                                          placeholder="e.g. Bilti"
                                        />
                                      </div>

                                      {/* Payment Type */}
                                      <div>
                                        <label className="form-label">Payment Type</label>
                                        <select
                                          value={line.paymentType}
                                          onChange={(e) => updateEditLine(li, 'paymentType', e.target.value)}
                                          className="form-select"
                                        >
                                          <option value="DEBIT">Naqad</option>
                                          <option value="CREDIT">Credit (Udhaar)</option>
                                          <option value="OPENING_STOCK">Opening Stock</option>
                                        </select>
                                      </div>

                                      {/* Supplier */}
                                      <div>
                                        <label className="form-label">Supplier</label>
                                        <select
                                          value={line.supplierId}
                                          onChange={(e) => updateEditLine(li, 'supplierId', e.target.value)}
                                          className="form-select"
                                        >
                                          <option value="">— No supplier —</option>
                                          {suppliers.map((s) => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Notes */}
                                      <div>
                                        <label className="form-label">Note</label>
                                        <input
                                          type="text"
                                          value={line.userNote}
                                          onChange={(e) => updateEditLine(li, 'userNote', e.target.value)}
                                          className="form-input"
                                          placeholder="Optional remark"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Save / Cancel buttons */}
                            <div className="flex items-center gap-3 mt-4">
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={loading}
                                className="btn-primary px-6 py-2.5"
                              >
                                <Save className="w-4 h-4" />
                                {loading ? 'Saving…' : 'Save Changes'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditEntryId(null); setEditLines([]); }}
                                className="btn-secondary px-5 py-2.5"
                              >
                                <X className="w-4 h-4" />Cancel
                              </button>
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

      {/* ══ NEW ENTRY FORM ══ */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Entry date + notes */}
        <div className="card p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Entry Date</label>
              <input type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="form-input" />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Notes / Reference (Optional)</label>
              <input
                type="text" value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                placeholder="e.g. Physical stock verified before ERP launch"
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Line cards */}
        {forms.map((f, idx) => (
          <div key={idx} className="card overflow-hidden">
            {/* Card header */}
            <div className="bg-brand-600/5 border-b border-brand-600/15 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</div>
                <span className="text-sm font-bold text-brand-700">{f.materialName.trim() || `Raw Material #${idx + 1}`}</span>
                {f.materialName.trim() && (
                  f.selectedItemId
                    ? <span className="badge-green text-[10px]">Existing item</span>
                    : <span className="badge-amber text-[10px]">New item — will be created</span>
                )}
                {f.quantity && f.purchaseRate && (
                  <span className="text-xs text-gray-500">
                    Total: <span className="text-brand-600 font-mono font-bold">Rs. {totalValue(f)}</span>
                    {parseFloat(f.extraCharges) > 0 && (
                      <span className="text-amber-600 ml-1 text-[10px]">(+{parseFloat(f.extraCharges).toFixed(2)} extra)</span>
                    )}
                  </span>
                )}
              </div>
              {forms.length > 1 && (
                <button type="button" onClick={() => setForms((p) => p.filter((_, i) => i !== idx))}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-5 space-y-5">
              {/* Row 1: Name / Qty / Unit / Rate */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="form-label">Material Name *</label>
                  <input type="text" required list={`items-list-${idx}`}
                    placeholder="e.g. Premium Tea Leaves" value={f.materialName}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    className="form-input" autoComplete="off" />
                  <datalist id={`items-list-${idx}`}>
                    {items.map((it) => <option key={it.id} value={it.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="form-label">Quantity *</label>
                  <input type="number" step="any" min="0.001" required placeholder="e.g. 50"
                    value={f.quantity} onChange={(e) => updateForm(idx, 'quantity', e.target.value)}
                    className="form-input font-mono" />
                </div>
                <div>
                  <label className="form-label">Unit *</label>
                  <select required value={f.selectedUnitId}
                    onChange={(e) => updateForm(idx, 'selectedUnitId', Number(e.target.value))}
                    className="form-select">
                    <option value={0} disabled>— Select unit —</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.isBaseUnit ? ' (Base)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">
                    Rate (Rs./{units.find((u) => u.id === f.selectedUnitId)?.symbol || 'unit'})
                    {f.paymentType !== 'OPENING_STOCK' && <span className="text-rose-500 ml-1">*</span>}
                  </label>
                  <input
                    type="number" step="any" min="0"
                    required={f.paymentType !== 'OPENING_STOCK'}
                    placeholder="e.g. 150.00"
                    value={f.purchaseRate}
                    onChange={(e) => updateForm(idx, 'purchaseRate', e.target.value)}
                    className="form-input font-mono"
                  />
                </div>
              </div>

              {/* Row 2: Extra Charges */}
              <div className="border border-dashed border-amber-300 rounded-xl p-4 bg-amber-50/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Extra Charges (Optional) — Bilti, Freight, Misc</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="form-label">Amount (Rs.)</label>
                    <input type="number" step="any" min="0" placeholder="e.g. 500.00"
                      value={f.extraCharges} onChange={(e) => updateForm(idx, 'extraCharges', e.target.value)}
                      className="form-input font-mono" />
                  </div>
                  <div>
                    <label className="form-label">Description</label>
                    <input type="text" placeholder="e.g. Bilti, Freight, Loading"
                      value={f.extraChargesNote} onChange={(e) => updateForm(idx, 'extraChargesNote', e.target.value)}
                      className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Total Value (Auto)</label>
                    <div className="form-input bg-gray-50 font-mono font-bold text-gray-700 cursor-default">
                      Rs. {totalValue(f)}
                      {parseFloat(f.extraCharges) > 0 && (
                        <span className="text-amber-500 text-xs ml-1">(+{parseFloat(f.extraCharges).toFixed(2)})</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Payment + Batch */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="form-label">Payment Type *</label>
                  <div className="flex gap-2">
                    {([
                      { value: 'CREDIT', label: 'Credit (Udhaar)', cls: 'bg-sky-600 border-sky-600' },
                      { value: 'DEBIT', label: 'Naqad', cls: 'bg-brand-600 border-brand-600' },
                      { value: 'OPENING_STOCK', label: 'Opening Stock', cls: 'bg-amber-500 border-amber-500' },
                    ] as { value: PaymentType; label: string; cls: string }[]).map(({ value, label, cls }) => (
                      <button key={value} type="button" onClick={() => updateForm(idx, 'paymentType', value)}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold border-2 transition-all ${f.paymentType === value ? `${cls} text-white shadow-sm` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">Batch / Tag #</label>
                  <input type="text" required value={f.batchNumber}
                    onChange={(e) => updateForm(idx, 'batchNumber', e.target.value)}
                    className="form-input font-mono" />
                </div>
              </div>

              {/* Row 4: Supplier */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Supplier</span>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {(['existing', 'new'] as SupplierMode[]).map((mode) => (
                      <button key={mode} type="button" onClick={() => updateForm(idx, 'supplierMode', mode)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${f.supplierMode === mode ? 'bg-white text-brand-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                        {mode === 'existing' ? 'Existing Supplier' : '+ Add New'}
                      </button>
                    ))}
                  </div>
                </div>

                {f.supplierMode === 'existing' && (
                  <div className="max-w-sm">
                    <select value={f.existingSupplierId}
                      onChange={(e) => updateForm(idx, 'existingSupplierId', e.target.value)}
                      className="form-select">
                      <option value="">— No supplier / Cash purchase —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}){s.phone ? ` • ${s.phone}` : ''}{s.currentBalanceOwn ? ` • Bal: Rs.${parseFloat(s.currentBalanceOwn).toFixed(2)}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {f.supplierMode === 'new' && (
                  <div className="bg-brand-600/5 border border-brand-600/20 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-brand-700 font-semibold flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" />New supplier will be registered automatically on submit
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="form-label">Supplier Name *</label>
                        <input type="text" required={f.supplierMode === 'new'} placeholder="e.g. Ahmed Traders"
                          value={f.newSupplierName} onChange={(e) => updateForm(idx, 'newSupplierName', e.target.value)}
                          className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Phone</label>
                        <input type="text" placeholder="0300-1234567"
                          value={f.newSupplierPhone} onChange={(e) => updateForm(idx, 'newSupplierPhone', e.target.value)}
                          className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Address</label>
                        <input type="text" placeholder="Main Market, Lahore"
                          value={f.newSupplierAddress} onChange={(e) => updateForm(idx, 'newSupplierAddress', e.target.value)}
                          className="form-input" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Add another line */}
        <button type="button"
          onClick={() => {
            const baseUnit = units.find((u) => u.isBaseUnit) ?? units[0];
            setForms((prev) => [...prev, { ...blankForm(), selectedUnitId: baseUnit?.id ?? 0 }]);
          }}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-semibold text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-600/5 transition-all flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" />Add Another Raw Material
        </button>

        {/* Submit bar */}
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
          <div className="text-sm text-gray-500">
            <span className="font-semibold text-gray-800">{forms.length}</span> line{forms.length !== 1 ? 's' : ''} •
            Grand Total: <span className="font-mono font-bold text-brand-600 text-base">
              Rs. {forms.reduce((acc, f) => acc + (parseFloat(totalValue(f)) || 0), 0).toFixed(2)}
            </span>
          </div>
          <button type="submit" disabled={loading} className="btn-primary px-8 py-3 text-sm">
            <Package className="w-4 h-4" />
            {loading ? 'Saving…' : 'Confirm & Add Raw Material'}
          </button>
        </div>
      </form>
    </div>
  );
};
