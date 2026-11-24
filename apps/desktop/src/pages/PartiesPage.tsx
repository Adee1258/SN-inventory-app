import React, { useEffect, useState, useMemo } from 'react';
import { Users, Truck, Plus, CheckCircle, Phone, MapPin, Edit2, Trash2, X, User, RefreshCw, Search } from 'lucide-react';
import { api } from '../api/client.js';
import { ConfirmModal, type ConfirmDialogState } from '../components/common/ConfirmModal.js';

interface Customer {
  id: number;
  code: string;
  name: string;
  phone: string;
  address?: string;
  openingBalance: string;
  currentBalance: string;
}

interface Supplier {
  id: number;
  code: string;
  name: string;
  phone: string;
  address?: string;
  currentBalanceOwn: string;
  currentBalanceConsignment: string;
}

export const PartiesPage: React.FC<{ type: 'customers' | 'suppliers' }> = ({ type }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [currentBalance, setCurrentBalance] = useState('0.00');
  const [currentBalanceOwn, setCurrentBalanceOwn] = useState('0.00');
  const [currentBalanceCons, setCurrentBalanceCons] = useState('0.00');

  const isCustomer = type === 'customers';
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const loadData = async () => {
    try {
      if (isCustomer) {
        setCustomers(await api.get<Customer[]>('/parties/customers'));
      } else {
        setSuppliers(await api.get<Supplier[]>('/parties/suppliers'));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); resetForm(); }, [type]);

  const resetForm = () => {
    setEditingId(null);
    setName(''); setPhone(''); setAddress(''); setOpeningBalance('0.00');
    setCurrentBalance('0.00'); setCurrentBalanceOwn('0.00'); setCurrentBalanceCons('0.00');
    setCode(`${isCustomer ? 'CUST' : 'SUPP'}-${Date.now().toString().slice(-4)}`);
  };

  const handleEdit = (party: Customer | Supplier) => {
    setEditingId(party.id);
    setCode(party.code);
    setName(party.name);
    setPhone(party.phone);
    setAddress(party.address || '');
    if (isCustomer) {
      const c = party as Customer;
      setOpeningBalance(c.openingBalance || '0.00');
      setCurrentBalance(c.currentBalance || '0.00');
    } else {
      const s = party as Supplier;
      setOpeningBalance(s.currentBalanceOwn || '0.00');
      setCurrentBalanceOwn(s.currentBalanceOwn || '0.00');
      setCurrentBalanceCons(s.currentBalanceConsignment || '0.00');
    }
    setIsModalOpen(true);
  };

  const handleSyncBalances = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Sync Balances',
      message: 'Recalculate and synchronize all customer and supplier balances based on actual invoices?',
      confirmLabel: 'Yes, Synchronize',
      isDestructive: false,
      onConfirm: async () => {
        setLoading(true);
        setStatusMsg(null);
        try {
          const res = await api.post<{ success: boolean; message: string }>('/parties/recalculate', {});
          setStatusMsg(res.message);
          await loadData();
        } catch (err: unknown) {
          setStatusMsg(err instanceof Error ? err.message : 'Sync failed');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleDelete = (party: Customer | Supplier) => {
    setConfirmDialog({
      isOpen: true,
      title: `Delete ${isCustomer ? 'Customer' : 'Supplier'}`,
      message: `Delete ${isCustomer ? 'customer' : 'supplier'} "${party.name}"?`,
      confirmLabel: 'Yes, Delete',
      isDestructive: true,
      onConfirm: async () => {
        // Optimistic UI update
        if (isCustomer) {
          setCustomers((prev) => prev.filter((c) => c.id !== party.id));
        } else {
          setSuppliers((prev) => prev.filter((s) => s.id !== party.id));
        }
        try {
          const res = await api.delete<{ message: string; deactivated?: boolean }>(`/parties/${type}/${party.id}`);
          setStatusMsg(res.message);
          loadData();
        } catch (err: unknown) {
          setStatusMsg(err instanceof Error ? err.message : 'Delete failed');
          loadData();
        }
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      if (editingId) {
        if (isCustomer) {
          await api.put(`/parties/customers/${editingId}`, {
            name,
            phone,
            address,
            currentBalance,
            openingBalance: currentBalance,
          });
        } else {
          await api.put(`/parties/suppliers/${editingId}`, {
            name,
            phone,
            address,
            currentBalanceOwn,
            openingBalanceOwn: currentBalanceOwn,
            currentBalanceConsignment: currentBalanceCons,
          });
        }
        setStatusMsg(`${isCustomer ? 'Customer' : 'Supplier'} updated successfully!`);
      } else {
        if (isCustomer) {
          await api.post('/parties/customers', { code, name, phone, address, openingBalance });
        } else {
          await api.post('/parties/suppliers', { code, name, phone, address, openingBalanceOwn: openingBalance, openingBalanceConsignment: '0.00' });
        }
        setStatusMsg(`${isCustomer ? 'Customer' : 'Supplier'} registered successfully!`);
      }
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally { setLoading(false); }
  };

  const data: (Customer | Supplier)[] = isCustomer ? customers : suppliers;

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase().trim();
    return data.filter((p) => {
      const nameMatch = (p.name || '').toLowerCase().includes(q);
      const codeMatch = (p.code || '').toLowerCase().includes(q);
      const phoneMatch = (p.phone || '').includes(q);
      const addrMatch = (p.address || '').toLowerCase().includes(q);
      return nameMatch || codeMatch || phoneMatch || addrMatch;
    });
  }, [data, searchQuery]);

  return (
    <div className="page-wrapper">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            {isCustomer
              ? <><Users className="w-5 h-5 text-brand-400" /> Wholesale Customer Directory</>
              : <><Truck className="w-5 h-5 text-sky-400" /> Supplier Directory</>}
          </h1>
          <p className="page-subtitle">
            {isCustomer
              ? 'Customer receivables ledger • Invoices and cash collections'
              : 'Segregated Own Stock AP and Consignment Commission proceeds payable'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncBalances}
            disabled={loading}
            className="btn-secondary text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 flex items-center gap-1.5"
            type="button"
            title="Recalculate all balances from surviving invoices"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Balances
          </button>
          <button onClick={() => loadData()} className="btn-secondary" type="button">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
          <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="btn-primary">
            <Plus className="w-4 h-4" />
            Register New {isCustomer ? 'Customer' : 'Supplier'}
          </button>
        </div>
      </div>

      {/* ── Status ── */}
      {statusMsg && (
        <div className="alert-success">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isCustomer ? (
          <>
            <div className="card p-4">
              <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Total Customers</span>
              <div className="text-2xl font-bold text-brand-400 mt-1">{customers.length}</div>
            </div>
            <div className="card p-4">
              <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Total Receivables</span>
              <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                Rs. {customers.reduce((a, c) => a + parseFloat(c.currentBalance || '0'), 0).toFixed(2)}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card p-4">
              <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Total Suppliers</span>
              <div className="text-2xl font-bold text-sky-400 mt-1">{suppliers.length}</div>
            </div>
            <div className="card p-4">
              <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Own Stock AP</span>
              <div className="text-lg font-bold font-mono text-sky-400 mt-1">
                Rs. {suppliers.reduce((a, s) => a + parseFloat(s.currentBalanceOwn || '0'), 0).toFixed(2)}
              </div>
            </div>
            <div className="card p-4">
              <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Consignment Payable</span>
              <div className="text-lg font-bold font-mono text-amber-400 mt-1">
                Rs. {suppliers.reduce((a, s) => a + parseFloat(s.currentBalanceConsignment || '0'), 0).toFixed(2)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Directory Table ── */}
      <div className="card overflow-hidden">
        <div className="card-header flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {isCustomer ? <Users className="w-4 h-4 text-brand-400" /> : <Truck className="w-4 h-4 text-sky-400" />}
            <h3 className="section-title">{isCustomer ? 'Customers List' : 'Suppliers List'}</h3>
            <span className="text-xs text-gray-400 font-medium">
              ({filteredData.length}{filteredData.length !== data.length ? ` of ${data.length}` : ''} parties)
            </span>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${isCustomer ? 'customer' : 'supplier'}, phone, code...`}
              className="form-input pl-8 pr-7 py-1 text-xs w-60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[560px] overflow-y-auto">
          <table className="table-base">
            <thead className="table-head sticky top-0 z-10 bg-gray-50 shadow-xs">
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Name</th>
                <th className="table-th">Contact</th>
                <th className="table-th">Address</th>
                {isCustomer ? (
                  <th className="table-th text-right">Current Receivable</th>
                ) : (
                  <>
                    <th className="table-th text-right text-sky-400">Own Stock AP</th>
                    <th className="table-th text-right text-amber-400">Consignment Payable</th>
                  </>
                )}
                <th className="table-th text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={isCustomer ? 6 : 7} className="table-td text-center text-gray-400 italic py-10">
                    No {isCustomer ? 'customers' : 'suppliers'} registered yet. Click &quot;Register New&quot; to add one.
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={isCustomer ? 6 : 7} className="table-td text-center text-gray-400 italic py-10">
                    Koi party "{searchQuery}" se match nahi hui.
                  </td>
                </tr>
              ) : isCustomer ? (
                (filteredData as Customer[]).map((c) => (
                  <tr key={c.id} className="table-row">
                    <td className="table-td font-mono font-bold text-brand-400 text-[11px]">{c.code}</td>
                    <td className="table-td font-medium text-gray-900">{c.name}</td>
                    <td className="table-td text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {c.phone}
                      </div>
                    </td>
                    <td className="table-td text-gray-400 text-[11px]">{c.address || '—'}</td>
                    <td className="table-td text-right font-mono font-bold text-gray-900">
                      Rs. {parseFloat(c.currentBalance || '0').toFixed(2)}
                    </td>
                    <td className="table-td text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleEdit(c)} className="btn-ghost" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(c)} className="btn-ghost" title="Delete">
                          <Trash2 className="w-3.5 h-3.5 hover:text-rose-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                (filteredData as Supplier[]).map((s) => (
                  <tr key={s.id} className="table-row">
                    <td className="table-td font-mono font-bold text-sky-400 text-[11px]">{s.code}</td>
                    <td className="table-td font-medium text-gray-900">{s.name}</td>
                    <td className="table-td text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {s.phone}
                      </div>
                    </td>
                    <td className="table-td text-gray-400 text-[11px]">{s.address || '—'}</td>
                    <td className="table-td text-right font-mono font-bold text-sky-400">Rs. {parseFloat(s.currentBalanceOwn || '0').toFixed(2)}</td>
                    <td className="table-td text-right font-mono font-bold text-amber-400">Rs. {parseFloat(s.currentBalanceConsignment || '0').toFixed(2)}</td>
                    <td className="table-td text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleEdit(s)} className="btn-ghost" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(s)} className="btn-ghost" title="Delete">
                          <Trash2 className="w-3.5 h-3.5 hover:text-rose-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-gray-100/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md card overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="card-header bg-gray-50">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCustomer ? 'bg-brand-600' : 'bg-sky-600'}`}>
                  <User className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {editingId ? 'Edit' : 'Register New'} {isCustomer ? 'Customer' : 'Supplier'}
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    {editingId ? 'Update party details' : 'Add to the directory'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="btn-ghost">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Party Code</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={!!editingId}
                    className="form-input font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="form-label">Full Name</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="form-input" />
                </div>
              </div>

              <div>
                <label className="form-label">Phone Number</label>
                <input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" className="form-input" />
              </div>

              <div>
                <label className="form-label">Address (Optional)</label>
                <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, Area" className="form-input" />
              </div>

              {!editingId ? (
                <div>
                  <label className="form-label">Opening Balance (Rs.)</label>
                  <input type="number" step="any" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="form-input font-mono" />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {isCustomer ? 'Outstanding receivable before ERP launch' : 'Outstanding payable before ERP launch'}
                  </p>
                </div>
              ) : isCustomer ? (
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                  <label className="form-label text-amber-900 font-bold">Current Receivable Balance (Rs.)</label>
                  <input
                    type="number"
                    step="any"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                    className="form-input font-mono font-bold text-brand-700 bg-white"
                  />
                  <p className="text-[11px] text-amber-800 mt-1">
                    Edit or set to 0.00 to reset this customer's balance.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 space-y-3">
                  <div>
                    <label className="form-label text-amber-900 font-bold">Own Stock AP (Rs.)</label>
                    <input
                      type="number"
                      step="any"
                      value={currentBalanceOwn}
                      onChange={(e) => setCurrentBalanceOwn(e.target.value)}
                      className="form-input font-mono font-bold text-sky-700 bg-white"
                    />
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Directly reset or fix payable for own stock (e.g. 0.00).
                    </p>
                  </div>
                  <div>
                    <label className="form-label text-amber-900 font-bold">Consignment Commission Payable (Rs.)</label>
                    <input
                      type="number"
                      step="any"
                      value={currentBalanceCons}
                      onChange={(e) => setCurrentBalanceCons(e.target.value)}
                      className="form-input font-mono font-bold text-amber-700 bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className={`btn-primary flex-1 justify-center ${isCustomer ? '' : 'bg-sky-600 hover:bg-sky-500'}`}>
                  {loading ? 'Saving…' : editingId ? 'Update' : `Register ${isCustomer ? 'Customer' : 'Supplier'}`}
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
