import React, { useEffect, useState } from 'react';
import { Warehouse, Boxes, Search, RefreshCw, Layers, TrendingUp, Package, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { ConfirmModal, type ConfirmDialogState } from '../components/common/ConfirmModal.js';

interface InventorySummaryItem {
  itemId: number;
  itemCode: string;
  itemName: string;
  categoryName: string;
  baseUnit: string;
  totalPhysicalBaseQty: string;
  ownStockBaseQty: string;
  consignmentStockBaseQty: string;
  ownStockValuation: string;
  activeBatchCount: number;
  supplierConsignmentBreakdown: Array<{ supplierId: string; supplierName: string; baseQty: string }>;
}

interface StockBatch {
  id: number;
  batchNumber: string;
  ownershipType: 'OWN' | 'CONSIGNMENT';
  sourceType: string;
  receivedDate: string;
  initialBaseQty: string;
  remainingBaseQty: string;
  baseUnitName: string;
  unitCost: string;
  status: string;
  item: { name: string; code: string };
  supplier?: { name: string; code: string };
}

export const InventoryPage: React.FC = () => {
  const [summary, setSummary] = useState<InventorySummaryItem[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [activeTab, setActiveTab] = useState<'summary' | 'batches'>('summary');
  const [searchTerm, setSearchTerm] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'ALL' | 'OWN' | 'CONSIGNMENT'>('ALL');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumData, batchData] = await Promise.all([
        api.get<InventorySummaryItem[]>('/inventory/summary'),
        api.get<StockBatch[]>('/inventory/batches'),
      ]);
      setSummary(sumData);
      setBatches(batchData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = (id: number, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Product',
      message: `Delete unused product "${name}"?\n\nThis will remove it completely from inventory and sales.`,
      confirmLabel: 'Yes, Delete Product',
      isDestructive: true,
      onConfirm: async () => {
        // Optimistic UI update: instantly remove from view
        const backup = [...summary];
        setSummary((prev) => prev.filter((i) => i.itemId !== id));
        setStatusMsg(null);
        try {
          await api.delete(`/items/${id}`);
          setStatusMsg({ type: 'success', text: `Product "${name}" deleted successfully.` });
          loadData();
        } catch (err: unknown) {
          setSummary(backup); // Rollback on error
          setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete product' });
        }
      },
    });
  };

  const handleCleanupOrphans = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Clean Up Unused Products',
      message: 'Clean up all unused products?\n\nThis will permanently remove all test products that have 0 stock and no transaction history.',
      confirmLabel: 'Yes, Clean Up',
      isDestructive: false,
      onConfirm: async () => {
        setLoading(true);
        setStatusMsg(null);
        try {
          const res = await api.post<{ success: boolean; deletedCount: number; message: string }>('/items/cleanup-orphans', {});
          setStatusMsg({ type: 'success', text: res.message });
          await loadData();
        } catch (err: unknown) {
          setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Cleanup failed' });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  useEffect(() => { loadData(); }, []);

  const filteredSummary = summary.filter((s) =>
    s.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.itemCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBatches = batches.filter((b) => {
    if (ownershipFilter !== 'ALL' && b.ownershipType !== ownershipFilter) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return (
        b.batchNumber.toLowerCase().includes(t) ||
        b.item?.name.toLowerCase().includes(t) ||
        b.supplier?.name.toLowerCase().includes(t)
      );
    }
    return true;
  });

  /* ── Summary stats ── */
  const totalOwn = summary.reduce((a, s) => a + parseFloat(s.ownStockBaseQty || '0'), 0);
  const totalConsignment = summary.reduce((a, s) => a + parseFloat(s.consignmentStockBaseQty || '0'), 0);
  const totalValuation = summary.reduce((a, s) => a + parseFloat(s.ownStockValuation || '0'), 0);

  return (
    <div className="page-wrapper">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            <Warehouse className="w-5 h-5 text-brand-400" />
            Central Physical Inventory &amp; FIFO Batches
          </h1>
          <p className="page-subtitle">
            Real-time stock statement • Clear distinction between own assets and supplier consignment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCleanupOrphans}
            disabled={loading}
            className="btn-secondary text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            title="Clean up test products that have 0 stock and no transactions"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clean Unused Products
          </button>
          <button onClick={loadData} className="btn-secondary">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Stock
          </button>
        </div>
      </div>

      {/* ── Status Msg ── */}
      {statusMsg && (
        <div className={statusMsg.type === 'success' ? 'alert-success' : 'alert-error'}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Own Stock</span>
            <div className="font-mono font-bold text-base text-brand-400">{totalOwn.toFixed(2)} KG</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Consignment</span>
            <div className="font-mono font-bold text-base text-amber-400">{totalConsignment.toFixed(2)} KG</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">FIFO Valuation</span>
            <div className="font-mono font-bold text-base text-sky-400">Rs. {totalValuation.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* ── Tabs + Filters ── */}
      <div className="card p-3 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="tab-bar">
          <button
            onClick={() => setActiveTab('summary')}
            className={`tab-btn ${activeTab === 'summary' ? 'tab-btn-active' : 'tab-btn-inactive'}`}
          >
            <Boxes className="w-3.5 h-3.5 inline mr-1.5" />
            Stock Summary
          </button>
          <button
            onClick={() => setActiveTab('batches')}
            className={`tab-btn ${activeTab === 'batches' ? 'tab-btn-active' : 'tab-btn-inactive'}`}
          >
            <Package className="w-3.5 h-3.5 inline mr-1.5" />
            FIFO Batches
          </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {activeTab === 'batches' && (
            <select
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value as any)}
              className="form-select w-40 py-1.5 text-xs"
            >
              <option value="ALL">All Ownerships</option>
              <option value="OWN">Own Stock Only</option>
              <option value="CONSIGNMENT">Consignment Only</option>
            </select>
          )}
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search commodity, batch #…"
              className="form-input pl-9 py-1.5 text-xs"
            />
          </div>
        </div>
      </div>

      {/* ── Summary Tab ── */}
      {activeTab === 'summary' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="table-th">Commodity Item</th>
                <th className="table-th">Category</th>
                <th className="table-th text-right">Total Physical</th>
                <th className="table-th text-right text-brand-400">Own Stock</th>
                <th className="table-th text-right text-brand-400">FIFO Asset Value</th>
                <th className="table-th text-amber-400 text-right">Consignment</th>
                <th className="table-th text-center">Batches</th>
                <th className="table-th text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummary.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center text-gray-400 italic py-8">No inventory records found.</td></tr>
              ) : filteredSummary.map((item) => (
                <tr key={item.itemId} className="table-row">
                  <td className="table-td">
                    <div className="font-medium text-gray-800">{item.itemName}</div>
                    <span className="text-[10px] text-gray-400 font-mono">{item.itemCode}</span>
                  </td>
                  <td className="table-td">
                    <span className="badge-gray">{item.categoryName || 'Commodity'}</span>
                  </td>
                  <td className="table-td text-right font-mono font-bold text-gray-900">
                    {item.totalPhysicalBaseQty}
                    <span className="text-[10px] text-gray-400 ml-1">{item.baseUnit}</span>
                  </td>
                  <td className="table-td text-right font-mono font-bold text-brand-400">
                    {item.ownStockBaseQty}
                    <span className="text-[10px] text-gray-400 ml-1">{item.baseUnit}</span>
                  </td>
                  <td className="table-td text-right font-mono font-bold text-brand-400">
                    Rs. {item.ownStockValuation}
                  </td>
                  <td className="table-td text-right font-mono font-bold text-amber-400">
                    {item.consignmentStockBaseQty}
                    <span className="text-[10px] text-gray-400 ml-1">{item.baseUnit}</span>
                  </td>
                  <td className="table-td text-center">
                    <span className="badge-blue">{item.activeBatchCount}</span>
                  </td>
                  <td className="table-td text-center">
                    {parseFloat(item.totalPhysicalBaseQty) === 0 && item.activeBatchCount === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.itemId, item.itemName)}
                        className="p-1 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
                        title={`Delete unused product "${item.itemName}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Batches Tab ── */}
      {activeTab === 'batches' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="table-th">Batch #</th>
                <th className="table-th">Commodity</th>
                <th className="table-th">Ownership</th>
                <th className="table-th">Supplier Owner</th>
                <th className="table-th">Received</th>
                <th className="table-th text-right">Initial Qty</th>
                <th className="table-th text-right">Remaining</th>
                <th className="table-th text-right">Landed Cost</th>
                <th className="table-th text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.length === 0 ? (
                <tr><td colSpan={9} className="table-td text-center text-gray-400 italic py-8">No batches found.</td></tr>
              ) : filteredBatches.map((b) => (
                <tr key={b.id} className="table-row">
                  <td className="table-td font-mono font-bold text-brand-400 text-[11px]">{b.batchNumber}</td>
                  <td className="table-td text-gray-800 font-medium">{b.item?.name}</td>
                  <td className="table-td">
                    <span className={b.ownershipType === 'OWN' ? 'badge-green' : 'badge-amber'}>
                      {b.ownershipType}
                    </span>
                  </td>
                  <td className="table-td text-gray-500 text-[11px]">
                    {b.supplier ? `${b.supplier.name} (${b.supplier.code})` : '—'}
                  </td>
                  <td className="table-td text-gray-400 text-[11px]">
                    {new Date(b.receivedDate).toLocaleDateString()}
                  </td>
                  <td className="table-td text-right font-mono text-gray-700">
                    {b.initialBaseQty} <span className="text-gray-400 text-[10px]">{b.baseUnitName}</span>
                  </td>
                  <td className="table-td text-right font-mono font-bold text-gray-900">
                    {b.remainingBaseQty} <span className="text-gray-400 text-[10px]">{b.baseUnitName}</span>
                  </td>
                  <td className="table-td text-right font-mono text-sky-400">
                    {b.ownershipType === 'OWN' ? `Rs. ${b.unitCost}` : '—'}
                  </td>
                  <td className="table-td text-center">
                    <span className="inline-flex items-center gap-1 badge-green">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                      {b.status || 'ACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal — avoids native window.confirm Electron input freeze */}
      <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
};
