import React, { useEffect, useState, useCallback } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  RefreshCw,
  ChevronRight,
  TrendingUp,
  ShoppingCart,
  Boxes,
  Users,
  Truck,
  Package,
  Layers,
  Percent,
  UserCheck,
  BarChart2,
  ArrowDownCircle,
  ArrowUpCircle,
  List,
  Receipt,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { api } from '../api/client.js';
import { exportToCsv, printDocument } from '../utils/exportUtils.js';

// ─── Report Meta ───────────────────────────────────────────────────────────────
interface ReportMeta {
  id: string;
  title: string;
  urduTitle: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const REPORT_CATEGORIES = [
  {
    label: '📦 Inventory & Stock (Maal Ka Hisaab)',
    color: 'text-amber-600',
    ids: ['raw_material', 'stock_valuation', 'product_list', 'low_stock'],
  },
  {
    label: '📊 Sales (Farokht)',
    color: 'text-brand-600',
    ids: ['daily_sales', 'sale_summary', 'unpaid_sales'],
  },
  {
    label: '🛒 Purchases (Dukan Khareed)',
    color: 'text-sky-600',
    ids: ['purchase_register', 'purchase_summary'],
  },
  {
    label: '👥 Customers (Grahak Khata)',
    color: 'text-rose-600',
    ids: ['customer_aging', 'customer_list'],
  },
  {
    label: '🚚 Suppliers (Supplier Khata)',
    color: 'text-sky-600',
    ids: ['supplier_ap', 'supplier_list'],
  },
  {
    label: '📋 Commission & Consignment (Amanat Maal)',
    color: 'text-violet-600',
    ids: ['commission_summary', 'commission_expenses', 'consignment_stock'],
  },
  {
    label: '👷 Employees (Staff Hisaab)',
    color: 'text-orange-600',
    ids: ['employee_list', 'employee_advances'],
  },
];

const REPORTS: ReportMeta[] = [
  // Inventory (No FG! Pure Raw Stock & Valuation)
  { id: 'raw_material',         title: 'Raw Material / Stock Register',      urduTitle: 'Kachcha Maal Intake Report',      category: 'Inventory',  icon: Layers,         color: 'text-amber-500' },
  { id: 'stock_valuation',      title: 'Current Stock Valuation',            urduTitle: 'Mojooda Maal Ka Hisaab (FIFO)',   category: 'Inventory',  icon: Boxes,          color: 'text-amber-600' },
  { id: 'product_list',         title: 'Product / Item Directory',           urduTitle: 'Tamam Items Ki Fehrist',          category: 'Inventory',  icon: List,           color: 'text-amber-400' },
  { id: 'low_stock',            title: 'Low Stock Alert',                    urduTitle: 'Kam Maal Warning Report',         category: 'Inventory',  icon: AlertTriangle,  color: 'text-orange-500' },

  // Sales
  { id: 'daily_sales',          title: 'Daily Sales Invoices',               urduTitle: 'Rozana Farokht Register',         category: 'Sales',      icon: TrendingUp,     color: 'text-brand-500' },
  { id: 'sale_summary',         title: 'Sale Summary (by Date)',             urduTitle: 'Farokht Ka Khulasa',              category: 'Sales',      icon: BarChart2,      color: 'text-brand-600' },
  { id: 'unpaid_sales',         title: 'Unpaid / Udhar Sales',               urduTitle: 'Baqi Wasooli Farokht',            category: 'Sales',      icon: Receipt,        color: 'text-rose-500' },

  // Purchases
  { id: 'purchase_register',    title: 'Purchase Register',                  urduTitle: 'Khareed Bill Register',           category: 'Purchases',  icon: ShoppingCart,   color: 'text-sky-500' },
  { id: 'purchase_summary',     title: 'Purchase Summary (by Supplier)',     urduTitle: 'Supplier Wise Khareed',           category: 'Purchases',  icon: Package,        color: 'text-sky-600' },

  // Customers
  { id: 'customer_aging',       title: 'Customer Balances & Udhar',          urduTitle: 'Grahak Ka Baqi Khata',            category: 'Customers',  icon: Users,          color: 'text-rose-500' },
  { id: 'customer_list',        title: 'Customer Directory (Full)',          urduTitle: 'Tamam Grahak Fehrist',            category: 'Customers',  icon: UserCheck,      color: 'text-rose-600' },

  // Suppliers
  { id: 'supplier_ap',          title: 'Supplier Balances (AP)',             urduTitle: 'Supplier Ka Baqi Dena',           category: 'Suppliers',  icon: Truck,          color: 'text-sky-500' },
  { id: 'supplier_list',        title: 'Supplier Directory (Full)',          urduTitle: 'Tamam Supplier Fehrist',          category: 'Suppliers',  icon: List,           color: 'text-sky-600' },

  // Commission & Consignment
  { id: 'commission_summary',   title: 'Commission Summary (Per Supplier)',  urduTitle: 'Commission Ka Hisaab',            category: 'Commission', icon: Percent,        color: 'text-violet-500' },
  { id: 'commission_expenses',  title: 'Commission Expenses Log',            urduTitle: 'Commission Kharche',              category: 'Commission', icon: ArrowUpCircle,  color: 'text-violet-600' },
  { id: 'consignment_stock',    title: 'Consignment Stock Status',           urduTitle: 'Amanat Maal Ki Tafseel',          category: 'Commission', icon: Layers,         color: 'text-violet-400' },

  // Employees
  { id: 'employee_list',        title: 'Employee Directory & Salary',        urduTitle: 'Mulazmeen Ki Fehrist',            category: 'Employees',  icon: UserCheck,      color: 'text-orange-500' },
  { id: 'employee_advances',    title: 'Staff Advance Ledger',               urduTitle: 'Staff Advance Hisaab',            category: 'Employees',  icon: ArrowDownCircle,color: 'text-orange-600' },
];

const fmt = (v: number | string | undefined | null) => {
  const n = parseFloat(String(v || 0));
  return isNaN(n) ? '0.00' : n.toFixed(2);
};
const fmtDate = (d: string | Date | undefined) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Table Headers ──────────────────────────────────────────────────────────────
const TABLE_HEADERS: Record<string, string[]> = {
  raw_material:        ['Entry #', 'Date', 'Material / Item', 'Supplier', 'Khareed Rate', 'Daakhil Qty', 'Bik Gaya', 'Baqi Qty', 'Extra Charges', 'Kul Value (Rs.)', 'Status'],
  stock_valuation:     ['Code', 'Item Name', 'Unit', 'Kul Mojood Maal', 'Apna Maal', 'Amanat Maal', 'Apna Maal Valuation (FIFO)'],
  product_list:        ['Code', 'Item Name', 'Category', 'Base Unit', 'Packs/Unit', 'Status'],
  low_stock:           ['Code', 'Item Name', 'Unit', 'Mojooda Stock', 'Status'],
  daily_sales:         ['Invoice #', 'Date', 'Customer', 'Items', 'Terms', 'Net Bill', 'Wasool (Paid)', 'Baqi (Balance)'],
  sale_summary:        ['Date', 'Invoices Count', 'Kul Farokht (Rs.)', 'Kul Wasool (Rs.)', 'Kul Baqi (Rs.)'],
  unpaid_sales:        ['Invoice #', 'Date', 'Customer', 'Items', 'Terms', 'Net Bill', 'Wasool', 'Baqi Udhar (Rs.)'],
  purchase_register:   ['Invoice #', 'Date', 'Supplier', 'Items', 'Terms', 'Net Landed', 'Paid', 'AP Balance'],
  purchase_summary:    ['Supplier Name', 'Phone', 'Invoices Count', 'Kul Khareed (Rs.)', 'Paid (Rs.)', 'Baqi Dena (Rs.)'],
  customer_aging:      ['Code', 'Customer Name', 'Phone', 'Address', 'Pehle Ka Balance', 'Baqi Lena (Rs.)'],
  customer_list:       ['Code', 'Customer Name', 'Phone', 'Address', 'Opening Bal.', 'Current Balance'],
  supplier_ap:         ['Code', 'Supplier Name', 'Phone', 'Apna Maal AP (Rs.)', 'Amanat Maal Haq (Rs.)', 'Kul Dena (Total AP)'],
  supplier_list:       ['Code', 'Supplier Name', 'Phone', 'Address', 'Opening Bal.', 'Own AP', 'Consignment AP'],
  commission_summary:  ['Supplier', 'Maal Aaya', 'Maal Bika', 'Kul Sale (Rs.)', 'Commission Kamai', 'Kharche (Minus)', 'Net Commission', 'Settled (Diya)', 'Baqi Dena'],
  commission_expenses: ['Date', 'Category', 'Tafseel (Detail)', 'Supplier', 'Amount (Rs.)'],
  consignment_stock:   ['Supplier', 'Batch / Receipt #', 'Received Date', 'Item Name', 'Aaya Qty', 'Remaining Qty', 'Status'],
  employee_list:       ['Code', 'Mulazim Ka Naam', 'Phone', 'Ohda (Designation)', 'Monthly Salary', 'Pehle Ka Advance', 'Baqi Advance'],
  employee_advances:   ['Mulazim Ka Naam', 'Date', 'Qisam (Type)', 'Amount (Rs.)', 'Tafseel / Note'],
};

export const ReportsPage: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState('raw_material');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [reportData, setReportData] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Quick date presets
  const setToday = () => {
    const t = new Date().toISOString().split('T')[0];
    setDateRange({ start: t, end: t });
  };
  const setThisWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - day);
    setDateRange({ start: startOfWeek.toISOString().split('T')[0], end: now.toISOString().split('T')[0] });
  };
  const setThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    setDateRange({ start, end: now.toISOString().split('T')[0] });
  };
  const setLastMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    setDateRange({ start, end });
  };
  const setThisYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    setDateRange({ start, end: now.toISOString().split('T')[0] });
  };

  // ─── Fetch Report Data (Real-Time Live API Calls) ──────────────────────────────
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setSummaryData(null);
    setReportData([]);
    try {
      let data: any[] = [];

      /* 1. RAW MATERIAL REGISTER — Directly from live opening-stock */
      if (selectedReport === 'raw_material') {
        const entries = await api.get<any[]>('/opening-stock');
        const rows: any[] = [];
        let totalQtyIn = 0;
        let totalQtyRem = 0;
        let totalVal = 0;

        (entries || []).forEach((entry: any) => {
          const d = entry.entryDate?.split('T')[0];
          if (dateRange.start && d < dateRange.start) return;
          if (dateRange.end && d > dateRange.end) return;

          (entry.items || []).forEach((it: any) => {
            const qty = parseFloat(it.enteredQuantity || 0);
            const rem = parseFloat(it.remainingQuantity ?? it.enteredQuantity);
            const rate = parseFloat(it.unitCost || 0);

            // Parse extra charges from notes (e.g. "Payment: DEBIT | Extra Charges: Rs.15 (Bilti)")
            let extra = 0;
            let extraNote = '';
            if (it.notes) {
              const m = it.notes.match(/Extra Charges: Rs\.([\d.]+)(?:\s+\((.+)\))?/);
              if (m) {
                extra = parseFloat(m[1]) || 0;
                extraNote = m[2] ?? '';
              }
            }

            const baseVal = qty * rate;
            const val = baseVal + extra;

            totalQtyIn += qty;
            totalQtyRem += rem;
            totalVal += val;

            rows.push({
              id: it.id,
              entryNumber: entry.entryNumber,
              entryDate: entry.entryDate,
              itemName: it.item?.name || '—',
              itemCode: it.item?.code || '—',
              supplierName: it.supplier?.name || '—',
              rate: it.unitCost,
              enteredQty: `${it.enteredQuantity} ${it.enteredUnitName || ''}`,
              soldQty: it.soldQuantity || '0.00',
              remainingQty: `${rem.toFixed(2)} ${it.enteredUnitName || ''}`,
              extraCharges: extra > 0 ? `Rs. ${extra.toFixed(2)}${extraNote ? ` (${extraNote})` : ''}` : '—',
              extraAmount: extra,
              totalValue: val.toFixed(2),
              status: it.batchStatus || (rem > 0 ? 'ACTIVE' : 'EXHAUSTED'),
            });
          });
        });

        data = rows;
        setSummaryData({ totalQtyIn, totalQtyRem, totalVal });
      }

      /* 2. CURRENT STOCK VALUATION (Own + Consignment) */
      else if (selectedReport === 'stock_valuation') {
        const raw = await api.get<any[]>('/inventory/summary');
        // Only include items that actually have physical stock or valuation
        data = (raw || []).filter(
          (st) => parseFloat(st.totalPhysicalBaseQty || 0) > 0 || parseFloat(st.ownStockValuation || 0) > 0
        );
        let totalPhysical = 0;
        let totalOwn = 0;
        let totalConsignment = 0;
        let totalVal = 0;
        data.forEach((st) => {
          totalPhysical += parseFloat(st.totalPhysicalBaseQty || 0);
          totalOwn += parseFloat(st.ownStockBaseQty || 0);
          totalConsignment += parseFloat(st.consignmentStockBaseQty || 0);
          totalVal += parseFloat(st.ownStockValuation || 0);
        });
        setSummaryData({ totalPhysical, totalOwn, totalConsignment, totalVal });
      }

      /* 3. PRODUCT LIST */
      else if (selectedReport === 'product_list') {
        data = await api.get<any[]>('/items');
      }

      /* 4. LOW STOCK ALERT */
      else if (selectedReport === 'low_stock') {
        const all = await api.get<any[]>('/inventory/summary');
        data = (all || []).filter((s: any) => {
          const qty = parseFloat(s.totalPhysicalBaseQty || 0);
          return qty > 0 && qty < 10;
        });
      }

      /* 5. DAILY SALES */
      else if (selectedReport === 'daily_sales') {
        const all = await api.get<any[]>('/sales');
        data = all.filter((s: any) => {
          const d = s.invoiceDate?.split('T')[0];
          return d >= dateRange.start && d <= dateRange.end;
        });
        let totalGross = 0;
        let totalPaid = 0;
        let totalBaqi = 0;
        data.forEach((s) => {
          totalGross += parseFloat(s.netInvoiceAmount || 0);
          totalPaid += parseFloat(s.paidAmount || 0);
          totalBaqi += parseFloat(s.remainingBalance || 0);
        });
        setSummaryData({ totalGross, totalPaid, totalBaqi });
      }

      /* 6. SALE SUMMARY BY DATE */
      else if (selectedReport === 'sale_summary') {
        const all = await api.get<any[]>('/sales');
        const filtered = all.filter((s: any) => {
          const d = s.invoiceDate?.split('T')[0];
          return d >= dateRange.start && d <= dateRange.end;
        });
        const grouped: Record<string, { total: number; paid: number; baqi: number; count: number }> = {};
        filtered.forEach((s: any) => {
          const d = s.invoiceDate?.split('T')[0];
          if (!grouped[d]) grouped[d] = { total: 0, paid: 0, baqi: 0, count: 0 };
          grouped[d].total += parseFloat(s.netInvoiceAmount || 0);
          grouped[d].paid += parseFloat(s.paidAmount || 0);
          grouped[d].baqi += parseFloat(s.remainingBalance || 0);
          grouped[d].count += 1;
        });
        data = Object.entries(grouped)
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => b.date.localeCompare(a.date));
        const grand = { totalSale: 0, totalPaid: 0, totalBaqi: 0 };
        data.forEach((r) => { grand.totalSale += r.total; grand.totalPaid += r.paid; grand.totalBaqi += r.baqi; });
        setSummaryData(grand);
      }

      /* 7. UNPAID / UDHAR SALES */
      else if (selectedReport === 'unpaid_sales') {
        const all = await api.get<any[]>('/sales');
        data = all.filter((s: any) => parseFloat(s.remainingBalance || 0) > 0);
        const totalPending = data.reduce((sum, s) => sum + parseFloat(s.remainingBalance || 0), 0);
        setSummaryData({ totalPending });
      }

      /* 8. PURCHASE REGISTER */
      else if (selectedReport === 'purchase_register') {
        const all = await api.get<any[]>('/purchases');
        data = all.filter((p: any) => {
          const d = p.invoiceDate?.split('T')[0];
          return d >= dateRange.start && d <= dateRange.end;
        });
      }

      /* 9. PURCHASE SUMMARY BY SUPPLIER */
      else if (selectedReport === 'purchase_summary') {
        const all = await api.get<any[]>('/purchases');
        const filtered = all.filter((p: any) => {
          const d = p.invoiceDate?.split('T')[0];
          return d >= dateRange.start && d <= dateRange.end;
        });
        const grouped: Record<string, { name: string; phone: string; total: number; paid: number; baqi: number; count: number }> = {};
        filtered.forEach((p: any) => {
          const key = p.supplier?.id || 'unknown';
          if (!grouped[key]) grouped[key] = { name: p.supplier?.name || '—', phone: p.supplier?.phone || '—', total: 0, paid: 0, baqi: 0, count: 0 };
          grouped[key].total += parseFloat(p.netLandedAmount || 0);
          grouped[key].paid += parseFloat(p.paidAmount || 0);
          grouped[key].baqi += parseFloat(p.remainingBalance || 0);
          grouped[key].count += 1;
        });
        data = Object.values(grouped).sort((a, b) => b.total - a.total);
      }

      /* 10. CUSTOMERS */
      else if (selectedReport === 'customer_aging' || selectedReport === 'customer_list') {
        // Auto-recalculate balances before showing (fixes stale data from deleted invoices)
        await api.post('/parties/recalculate', {}).catch(() => null);
        data = await api.get<any[]>('/parties/customers');
        const totalReceivable = data.reduce((s, c) => s + parseFloat(c.currentBalance || 0), 0);
        setSummaryData({ totalReceivable });
      }

      /* 11. SUPPLIERS (Bug #7 Fix: exclude pure commission suppliers from shop supplier reports) */
      else if (selectedReport === 'supplier_ap' || selectedReport === 'supplier_list') {
        // Auto-recalculate supplier balances before showing
        await api.post('/parties/recalculate', {}).catch(() => null);
        const allSuppliers = await api.get<any[]>('/parties/suppliers');
        data = (allSuppliers || []).filter((s: any) => {
          const hasConsign =
            Number(s._count?.consignmentReceipts || 0) > 0 ||
            Number(s._count?.commissionAgreements || 0) > 0 ||
            parseFloat(s.currentBalanceConsignment || '0') !== 0;
          const hasTrade =
            Number(s._count?.purchaseInvoices || 0) > 0 ||
            parseFloat(s.currentBalanceOwn || '0') !== 0 ||
            parseFloat(s.openingBalanceOwn || '0') !== 0;
          return !(hasConsign && !hasTrade);
        });
        let totalOwnAp = 0;
        let totalConsignmentAp = 0;
        data.forEach((s) => {
          totalOwnAp += parseFloat(s.currentBalanceOwn || 0);
          totalConsignmentAp += parseFloat(s.currentBalanceConsignment || 0);
        });
        setSummaryData({ totalOwnAp, totalConsignmentAp, grandTotal: totalOwnAp + totalConsignmentAp });
      }

      /* 12. COMMISSION SUMMARY */
      else if (selectedReport === 'commission_summary') {
        const dash = await api.get<any>('/commission/supplier-dashboard');
        const list = Array.isArray(dash) ? dash : (dash?.suppliers || []);
        data = list
          .filter((s: any) =>
            parseFloat(s.totalReceivedQty || s.totalReceived || 0) > 0 ||
            parseFloat(s.totalSoldQty || s.totalSold || 0) > 0 ||
            parseFloat(s.currentBalanceConsignment || s.remainingPayable || 0) > 0
          )
          .map((s: any) => ({
            name: s.supplierName,
            maalAaya: s.totalReceivedQty || s.totalReceived || '0.00',
            maalBika: s.totalSoldQty || s.totalSold || '0.00',
            totalSale: s.totalSoldAmount || s.totalSaleValue || '0.00',
            commissionEarned: s.totalCommissionEarned || s.totalCommission || '0.00',
            kharche: s.totalSupplierExpenses || s.totalExpenses || '0.00',
            netCommission: s.netCommissionFromSupplier || s.totalCommissionEarned || s.totalCommission || '0.00',
            diyaGaya: s.totalSettled || '0.00',
            baqiDena: s.currentBalanceConsignment || s.remainingPayable || '0.00',
          }));
        const summary = await api.get<any>('/commission/final-summary').catch(() => null);
        setSummaryData(summary);
      }

      /* 13. COMMISSION EXPENSES */
      else if (selectedReport === 'commission_expenses') {
        const all = await api.get<any[]>('/commission/expenses');
        data = all.filter((e: any) => {
          const d = e.expenseDate?.split('T')[0];
          return d >= dateRange.start && d <= dateRange.end;
        });
        const totalExp = data.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
        setSummaryData({ totalExp });
      }

      /* 14. CONSIGNMENT STOCK (Amanat Maal Status) */
      else if (selectedReport === 'consignment_stock') {
        const batches = await api.get<any[]>('/inventory/batches?ownershipType=CONSIGNMENT');
        data = (batches || [])
          .filter((b: any) => parseFloat(b.initialBaseQty || 0) > 0)
          .map((b: any) => ({
            supplierName: b.supplier?.name || '—',
            batchNumber: b.batchNumber || `BATCH-${b.id}`,
            receivedDate: b.receivedDate,
            itemName: b.item?.name || '—',
            initialQty: b.initialBaseQty,
            remainingQty: b.remainingBaseQty,
            status: parseFloat(b.remainingBaseQty) > 0 ? 'ACTIVE' : 'SOLD_OUT',
          }));
      }

      /* 15. EMPLOYEES & ADVANCES */
      else if (selectedReport === 'employee_list') {
        data = await api.get<any[]>('/parties/employees');
      } else if (selectedReport === 'employee_advances') {
        const employees = await api.get<any[]>('/parties/employees');
        const rows: any[] = [];
        employees.forEach((emp: any) => {
          if (emp.advances && emp.advances.length > 0) {
            emp.advances.forEach((adv: any) => {
              rows.push({
                employee: emp.name,
                date: adv.date,
                type: adv.type,
                amount: adv.amount,
                note: adv.notes || '—',
              });
            });
          }
        });
        data = rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const totalGiven = rows.filter((r) => r.type === 'GIVEN').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const totalDeducted = rows.filter((r) => r.type === 'DEDUCTED').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        setSummaryData({ totalGiven, totalDeducted, net: totalGiven - totalDeducted });
      }

      setReportData(data);
    } catch (err) {
      console.error('Report fetch failed:', err);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedReport, dateRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // ─── Filtered Data by Search ──────────────────────────────────────────────────
  const filteredData = React.useMemo(() => {
    if (!searchFilter) return reportData;
    const q = searchFilter.toLowerCase();
    return reportData.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [reportData, searchFilter]);

  // ─── CSV Export ───────────────────────────────────────────────────────────────
  const handleDownloadCsv = () => {
    const filename = `${selectedReport}_${dateRange.start}_to_${dateRange.end}`;
    const headers = TABLE_HEADERS[selectedReport] || [];
    let rows: (string | number)[][] = [];

    if (selectedReport === 'raw_material') {
      rows = filteredData.map((r) => [r.entryNumber, fmtDate(r.entryDate), r.itemName, r.supplierName, r.rate, r.enteredQty, r.soldQty, r.remainingQty, r.extraCharges, r.totalValue, r.status]);
    } else if (selectedReport === 'stock_valuation') {
      rows = filteredData.map((s) => [s.itemCode, s.itemName, s.baseUnit, s.totalPhysicalBaseQty, s.ownStockBaseQty, s.consignmentStockBaseQty, s.ownStockValuation]);
    } else if (selectedReport === 'product_list') {
      rows = filteredData.map((i) => [i.code, i.name, i.category?.name || '', i.baseUnit?.symbol || '', i.piecesPerPack || 1, i.isActive ? 'Active' : 'Inactive']);
    } else if (selectedReport === 'daily_sales' || selectedReport === 'unpaid_sales') {
      rows = filteredData.map((s) => [
        s.invoiceNumber,
        fmtDate(s.invoiceDate),
        s.customer?.name || 'Walk-in',
        (s.items || []).map((it: any) => `${it.item?.name || 'Item'}${it.enteredQuantity ? ` (${it.enteredQuantity} ${it.enteredUnitName || ''})` : ''}`).join(', ') || '—',
        s.paymentMethod,
        s.netInvoiceAmount,
        s.paidAmount || 0,
        s.remainingBalance || 0,
      ]);
    } else if (selectedReport === 'sale_summary') {
      rows = filteredData.map((r) => [r.date, r.count, fmt(r.total), fmt(r.paid), fmt(r.baqi)]);
    } else if (selectedReport === 'purchase_register') {
      rows = filteredData.map((p) => [
        p.invoiceNumber,
        fmtDate(p.invoiceDate),
        p.supplier?.name || '',
        (p.items || []).map((it: any) => `${it.item?.name || 'Item'}${it.enteredQuantity || it.quantity ? ` (${it.enteredQuantity || it.quantity} ${it.enteredUnitName || ''})` : ''}`).join(', ') || '—',
        p.paymentMethod,
        p.netLandedAmount,
        p.paidAmount || 0,
        p.remainingBalance || 0,
      ]);
    } else if (selectedReport === 'purchase_summary') {
      rows = filteredData.map((r) => [r.name, r.phone, r.count, fmt(r.total), fmt(r.paid), fmt(r.baqi)]);
    } else if (selectedReport === 'customer_aging' || selectedReport === 'customer_list') {
      rows = filteredData.map((c) => [c.code, c.name, c.phone, c.address || '', c.openingBalance, c.currentBalance]);
    } else if (selectedReport === 'supplier_ap' || selectedReport === 'supplier_list') {
      rows = filteredData.map((s) => [s.code, s.name, s.phone, s.currentBalanceOwn, s.currentBalanceConsignment, fmt(parseFloat(s.currentBalanceOwn || 0) + parseFloat(s.currentBalanceConsignment || 0))]);
    } else if (selectedReport === 'commission_summary') {
      rows = filteredData.map((r) => [r.name, r.maalAaya, r.maalBika, r.totalSale, r.commissionEarned, r.kharche, r.netCommission, r.diyaGaya, r.baqiDena]);
    } else if (selectedReport === 'commission_expenses') {
      rows = filteredData.map((e) => [fmtDate(e.expenseDate), e.category || '', e.tafseel || e.description || '', e.supplier?.name || '', fmt(e.amount)]);
    } else if (selectedReport === 'consignment_stock') {
      rows = filteredData.map((b) => [b.supplierName, b.batchNumber, fmtDate(b.receivedDate), b.itemName, b.initialQty, b.remainingQty, b.status]);
    } else if (selectedReport === 'employee_list') {
      rows = filteredData.map((e) => [e.code, e.name, e.phone, e.designation || '', e.salary || 0, e.openingBalance || 0, e.currentAdvance || 0]);
    } else if (selectedReport === 'employee_advances') {
      rows = filteredData.map((r) => [r.employee, fmtDate(r.date), r.type, fmt(r.amount), r.note]);
    }

    exportToCsv(filename, headers, rows);
  };

  const activeMeta = REPORTS.find((r) => r.id === selectedReport);

  // ─── Table Row Renderer ───────────────────────────────────────────────────────
  const renderRows = () => {
    if (filteredData.length === 0) {
      return (
        <tr>
          <td colSpan={10} className="table-td text-center text-gray-400 italic py-12">
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet className="w-8 h-8 text-gray-300" />
              <span>Is report ka koi data nahi mila. Date range tabdeel karein ya Refresh karein.</span>
            </div>
          </td>
        </tr>
      );
    }

    /* 1. RAW MATERIAL REGISTER */
    if (selectedReport === 'raw_material') {
      return filteredData.map((r, i) => (
        <tr key={r.id || i} className="table-row">
          <td className="table-td font-mono font-bold text-brand-600 text-[11px]">{r.entryNumber}</td>
          <td className="table-td text-gray-500 text-[11px]">{fmtDate(r.entryDate)}</td>
          <td className="table-td font-medium text-gray-900">{r.itemName}</td>
          <td className="table-td text-gray-700">{r.supplierName}</td>
          <td className="table-td text-right font-mono text-gray-900">Rs. {fmt(r.rate)}</td>
          <td className="table-td text-right font-mono font-bold text-gray-900">{r.enteredQty}</td>
          <td className="table-td text-right font-mono text-amber-600">{r.soldQty}</td>
          <td className="table-td text-right font-mono font-bold text-brand-700">{r.remainingQty}</td>
          <td className="table-td text-right font-mono text-amber-700 text-xs">
            {r.extraAmount > 0 ? <span className="font-semibold text-amber-600">+{r.extraCharges}</span> : '—'}
          </td>
          <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {r.totalValue}</td>
          <td className="table-td text-center">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                r.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {r.status === 'ACTIVE' ? 'Mojood' : 'Khatam'}
            </span>
          </td>
        </tr>
      ));
    }

    /* 2. CURRENT STOCK VALUATION */
    if (selectedReport === 'stock_valuation') {
      return filteredData.map((st) => (
        <tr key={st.itemId} className="table-row">
          <td className="table-td font-mono text-gray-500 text-[11px]">{st.itemCode}</td>
          <td className="table-td font-medium text-gray-800">{st.itemName}</td>
          <td className="table-td text-gray-500">{st.baseUnit}</td>
          <td className="table-td text-right font-mono text-gray-900 font-bold">{fmt(st.totalPhysicalBaseQty)}</td>
          <td className="table-td text-right font-mono text-brand-600 font-bold">{fmt(st.ownStockBaseQty)}</td>
          <td className="table-td text-right font-mono text-violet-600">{fmt(st.consignmentStockBaseQty)}</td>
          <td className="table-td text-right font-mono font-bold text-emerald-700">Rs. {fmt(st.ownStockValuation)}</td>
        </tr>
      ));
    }

    /* 3. PRODUCT LIST */
    if (selectedReport === 'product_list') {
      return filteredData.map((item) => (
        <tr key={item.id} className="table-row">
          <td className="table-td font-mono text-brand-600 text-[11px]">{item.code}</td>
          <td className="table-td font-medium text-gray-800">{item.name}</td>
          <td className="table-td text-gray-500">{item.category?.name || '—'}</td>
          <td className="table-td text-gray-500">{item.baseUnit?.symbol || item.baseUnit?.name || '—'}</td>
          <td className="table-td text-center font-mono">{item.piecesPerPack || 1}</td>
          <td className="table-td text-center">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {item.isActive ? 'Active' : 'Band'}
            </span>
          </td>
        </tr>
      ));
    }

    /* 4. LOW STOCK */
    if (selectedReport === 'low_stock') {
      return filteredData.map((st, idx) => (
        <tr key={String(st.itemId ?? idx)} className="table-row">
          <td className="table-td font-mono text-gray-500 text-[11px]">{String(st.itemCode ?? '—')}</td>
          <td className="table-td font-medium text-gray-800">{String(st.itemName ?? '—')}</td>
          <td className="table-td text-gray-500">{typeof st.baseUnit === 'object' ? (st.baseUnit?.name ?? '—') : String(st.baseUnit ?? '—')}</td>
          <td className="table-td text-right font-mono font-bold text-rose-600">{fmt(st.totalPhysicalBaseQty)}</td>
          <td className="table-td text-center">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                parseFloat(st.totalPhysicalBaseQty) === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {parseFloat(st.totalPhysicalBaseQty) === 0 ? '🚨 Khatam' : '⚠️ Kam Hai'}
            </span>
          </td>
        </tr>
      ));
    }

    /* 5. SALES */
    if (selectedReport === 'daily_sales' || selectedReport === 'unpaid_sales') {
      return filteredData.map((s) => {
        const itemsText = (s.items || [])
          .map((it: any) => `${it.item?.name || 'Item'}${it.enteredQuantity ? ` (${it.enteredQuantity} ${it.enteredUnitName || ''})` : ''}`)
          .join(', ') || '—';
        return (
          <tr key={s.id} className="table-row">
            <td className="table-td font-mono font-bold text-brand-600 text-[11px]">{s.invoiceNumber}</td>
            <td className="table-td text-gray-500 text-[11px]">{fmtDate(s.invoiceDate)}</td>
            <td className="table-td text-gray-800 font-medium">{s.customer?.name || 'Walk-in'}</td>
            <td className="table-td text-gray-700 text-xs max-w-[240px]">{itemsText}</td>
            <td className="table-td">
              <span className="badge-blue text-[9px]">{s.paymentMethod}</span>
            </td>
            <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {fmt(s.netInvoiceAmount)}</td>
            <td className="table-td text-right font-mono text-emerald-600">Rs. {fmt(s.paidAmount)}</td>
            <td className="table-td text-right font-mono text-rose-600 font-bold">Rs. {fmt(s.remainingBalance)}</td>
          </tr>
        );
      });
    }

    /* 6. SALE SUMMARY */
    if (selectedReport === 'sale_summary') {
      return filteredData.map((r, i) => (
        <tr key={i} className="table-row">
          <td className="table-td font-medium text-gray-800">{r.date}</td>
          <td className="table-td text-center font-mono text-gray-500">{r.count}</td>
          <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {fmt(r.total)}</td>
          <td className="table-td text-right font-mono text-emerald-600">Rs. {fmt(r.paid)}</td>
          <td className="table-td text-right font-mono text-rose-600 font-bold">Rs. {fmt(r.baqi)}</td>
        </tr>
      ));
    }

    /* 7. PURCHASES */
    if (selectedReport === 'purchase_register') {
      return filteredData.map((p) => {
        const itemsText = (p.items || [])
          .map((it: any) => `${it.item?.name || 'Item'}${it.enteredQuantity || it.quantity ? ` (${it.enteredQuantity || it.quantity} ${it.enteredUnitName || ''})` : ''}`)
          .join(', ') || '—';
        return (
          <tr key={p.id} className="table-row">
            <td className="table-td font-mono font-bold text-sky-600 text-[11px]">{p.invoiceNumber}</td>
            <td className="table-td text-gray-500 text-[11px]">{fmtDate(p.invoiceDate)}</td>
            <td className="table-td text-gray-800 font-medium">{p.supplier?.name || '—'}</td>
            <td className="table-td text-gray-700 text-xs max-w-[240px]">{itemsText}</td>
            <td className="table-td">
              <span className="badge-blue text-[9px]">{p.paymentMethod}</span>
            </td>
            <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {fmt(p.netLandedAmount)}</td>
            <td className="table-td text-right font-mono text-emerald-600">Rs. {fmt(p.paidAmount)}</td>
            <td className="table-td text-right font-mono text-amber-600 font-bold">Rs. {fmt(p.remainingBalance)}</td>
          </tr>
        );
      });
    }

    if (selectedReport === 'purchase_summary') {
      return filteredData.map((r, i) => (
        <tr key={i} className="table-row">
          <td className="table-td font-medium text-gray-800">{r.name}</td>
          <td className="table-td text-gray-500">{r.phone}</td>
          <td className="table-td text-center font-mono text-gray-500">{r.count}</td>
          <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {fmt(r.total)}</td>
          <td className="table-td text-right font-mono text-emerald-600">Rs. {fmt(r.paid)}</td>
          <td className="table-td text-right font-mono text-rose-600 font-bold">Rs. {fmt(r.baqi)}</td>
        </tr>
      ));
    }

    /* 8. CUSTOMERS */
    if (selectedReport === 'customer_aging' || selectedReport === 'customer_list') {
      return filteredData.map((c) => (
        <tr key={c.id} className="table-row">
          <td className="table-td font-mono text-brand-600 text-[11px]">{c.code}</td>
          <td className="table-td font-medium text-gray-800">{c.name}</td>
          <td className="table-td text-gray-500">{c.phone}</td>
          <td className="table-td text-gray-400 text-[11px]">{c.address || '—'}</td>
          <td className="table-td text-right font-mono text-gray-500">Rs. {fmt(c.openingBalance)}</td>
          <td className="table-td text-right font-mono font-bold text-rose-600">Rs. {fmt(c.currentBalance)}</td>
        </tr>
      ));
    }

    /* 9. SUPPLIERS */
    if (selectedReport === 'supplier_ap') {
      return filteredData.map((s) => (
        <tr key={s.id} className="table-row">
          <td className="table-td font-mono text-sky-600 text-[11px]">{s.code}</td>
          <td className="table-td font-medium text-gray-800">{s.name}</td>
          <td className="table-td text-gray-500">{s.phone}</td>
          <td className="table-td text-right font-mono text-sky-600">Rs. {fmt(s.currentBalanceOwn)}</td>
          <td className="table-td text-right font-mono text-violet-600">Rs. {fmt(s.currentBalanceConsignment)}</td>
          <td className="table-td text-right font-mono font-bold text-gray-900">
            Rs. {fmt(parseFloat(s.currentBalanceOwn || 0) + parseFloat(s.currentBalanceConsignment || 0))}
          </td>
        </tr>
      ));
    }

    if (selectedReport === 'supplier_list') {
      return filteredData.map((s) => (
        <tr key={s.id} className="table-row">
          <td className="table-td font-mono text-sky-600 text-[11px]">{s.code}</td>
          <td className="table-td font-medium text-gray-800">{s.name}</td>
          <td className="table-td text-gray-500">{s.phone}</td>
          <td className="table-td text-gray-400 text-[11px]">{s.address || '—'}</td>
          <td className="table-td text-right font-mono text-gray-500">Rs. {fmt(s.openingBalanceOwn || 0)}</td>
          <td className="table-td text-right font-mono text-sky-600">Rs. {fmt(s.currentBalanceOwn)}</td>
          <td className="table-td text-right font-mono text-violet-600">Rs. {fmt(s.currentBalanceConsignment)}</td>
        </tr>
      ));
    }

    /* 10. COMMISSION SUMMARY */
    if (selectedReport === 'commission_summary') {
      return filteredData.map((r, i) => (
        <tr key={i} className="table-row">
          <td className="table-td font-medium text-gray-800">{r.name}</td>
          <td className="table-td text-right font-mono text-gray-700">{fmt(r.maalAaya)}</td>
          <td className="table-td text-right font-mono text-gray-700">{fmt(r.maalBika)}</td>
          <td className="table-td text-right font-mono text-gray-900 font-bold">Rs. {fmt(r.totalSale)}</td>
          <td className="table-td text-right font-mono text-emerald-600">Rs. {fmt(r.commissionEarned)}</td>
          <td className="table-td text-right font-mono text-rose-600">Rs. {fmt(r.kharche)}</td>
          <td className={`table-td text-right font-mono font-bold ${parseFloat(r.netCommission) >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            Rs. {fmt(r.netCommission)}
          </td>
          <td className="table-td text-right font-mono text-gray-500">Rs. {fmt(r.diyaGaya)}</td>
          <td className="table-td text-right font-mono text-amber-600 font-bold">Rs. {fmt(r.baqiDena)}</td>
        </tr>
      ));
    }

    /* 11. COMMISSION EXPENSES */
    if (selectedReport === 'commission_expenses') {
      return filteredData.map((e, i) => (
        <tr key={i} className="table-row">
          <td className="table-td text-gray-500 text-[11px]">{fmtDate(e.expenseDate)}</td>
          <td className="table-td text-gray-700">{e.category || '—'}</td>
          <td className="table-td font-medium text-gray-800">{e.tafseel || e.description || '—'}</td>
          <td className="table-td text-gray-600">{e.supplier?.name || 'Aam Kharcha (General)'}</td>
          <td className="table-td text-right font-mono font-bold text-rose-600">Rs. {fmt(e.amount)}</td>
        </tr>
      ));
    }

    /* 12. CONSIGNMENT STOCK */
    if (selectedReport === 'consignment_stock') {
      return filteredData.map((b, i) => (
        <tr key={i} className="table-row">
          <td className="table-td font-medium text-gray-800">{b.supplierName}</td>
          <td className="table-td font-mono text-violet-600 text-[11px]">{b.batchNumber}</td>
          <td className="table-td text-gray-500 text-[11px]">{fmtDate(b.receivedDate)}</td>
          <td className="table-td text-gray-800">{b.itemName}</td>
          <td className="table-td text-right font-mono text-gray-700">{fmt(b.initialQty)}</td>
          <td className="table-td text-right font-mono font-bold text-violet-700">{fmt(b.remainingQty)}</td>
          <td className="table-td text-center">
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${b.status === 'ACTIVE' ? 'bg-violet-100 text-violet-800' : 'bg-gray-100 text-gray-500'}`}>
              {b.status === 'ACTIVE' ? 'Mojood' : 'Bik Chuka'}
            </span>
          </td>
        </tr>
      ));
    }

    /* 13. EMPLOYEES */
    if (selectedReport === 'employee_list') {
      return filteredData.map((e) => (
        <tr key={e.id} className="table-row">
          <td className="table-td font-mono text-orange-600 text-[11px]">{e.code}</td>
          <td className="table-td font-medium text-gray-800">{e.name}</td>
          <td className="table-td text-gray-500">{e.phone}</td>
          <td className="table-td text-gray-400">{e.designation || '—'}</td>
          <td className="table-td text-right font-mono text-gray-900 font-bold">Rs. {fmt(e.salary)}</td>
          <td className="table-td text-right font-mono text-gray-500">Rs. {fmt(e.openingBalance)}</td>
          <td className="table-td text-right font-mono text-orange-600 font-bold">Rs. {fmt(e.currentAdvance)}</td>
        </tr>
      ));
    }

    if (selectedReport === 'employee_advances') {
      return filteredData.map((r, i) => (
        <tr key={i} className="table-row">
          <td className="table-td font-medium text-gray-800">{r.employee}</td>
          <td className="table-td text-gray-500 text-[11px]">{fmtDate(r.date)}</td>
          <td className="table-td">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                r.type === 'GIVEN' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {r.type === 'GIVEN' ? '➕ Diya Gaya' : '➖ Kata Gaya'}
            </span>
          </td>
          <td className={`table-td text-right font-mono font-bold ${r.type === 'GIVEN' ? 'text-rose-600' : 'text-emerald-700'}`}>
            Rs. {fmt(r.amount)}
          </td>
          <td className="table-td text-gray-500 text-[11px]">{r.note}</td>
        </tr>
      ));
    }

    return null;
  };

  // ─── Summary Totals Bar ───────────────────────────────────────────────────────
  const renderSummary = () => {
    if (!summaryData) return null;

    if (selectedReport === 'raw_material') {
      return (
        <div className="flex gap-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs">
          <div className="text-center">
            <div className="text-gray-500">Kul Daakhil Maal</div>
            <div className="font-bold font-mono text-gray-900">{fmt(summaryData.totalQtyIn)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Kul Baqi Mojood</div>
            <div className="font-bold font-mono text-brand-700">{fmt(summaryData.totalQtyRem)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Kul Maal Valuation</div>
            <div className="font-bold font-mono text-emerald-700">Rs. {fmt(summaryData.totalVal)}</div>
          </div>
        </div>
      );
    }

    if (selectedReport === 'stock_valuation') {
      return (
        <div className="flex gap-4 p-3 bg-brand-50 border border-brand-200 rounded-xl text-xs">
          <div className="text-center">
            <div className="text-gray-500">Kul Mojood Maal</div>
            <div className="font-bold font-mono text-gray-900">{fmt(summaryData.totalPhysical)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Apna Maal (Own)</div>
            <div className="font-bold font-mono text-brand-700">{fmt(summaryData.totalOwn)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Amanat Maal (Consignment)</div>
            <div className="font-bold font-mono text-violet-700">{fmt(summaryData.totalConsignment)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Apna Stock Valuation (FIFO)</div>
            <div className="font-bold font-mono text-emerald-700">Rs. {fmt(summaryData.totalVal)}</div>
          </div>
        </div>
      );
    }

    if (selectedReport === 'daily_sales' || selectedReport === 'sale_summary') {
      return (
        <div className="flex gap-4 p-3 bg-brand-50 border border-brand-200 rounded-xl text-xs">
          <div className="text-center">
            <div className="text-gray-500">Kul Farokht (Sale)</div>
            <div className="font-bold font-mono text-gray-900">Rs. {fmt(summaryData.totalGross || summaryData.totalSale)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Kul Wasool (Paid)</div>
            <div className="font-bold font-mono text-emerald-700">Rs. {fmt(summaryData.totalPaid)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Kul Baqi Udhar</div>
            <div className="font-bold font-mono text-rose-600">Rs. {fmt(summaryData.totalBaqi)}</div>
          </div>
        </div>
      );
    }

    if (selectedReport === 'unpaid_sales') {
      return (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs">
          <span className="text-rose-700 font-bold">Kul Udhar Baqi (Accounts Receivable): </span>
          <span className="font-mono font-bold text-base text-rose-800">Rs. {fmt(summaryData.totalPending)}</span>
        </div>
      );
    }

    if (selectedReport === 'supplier_ap') {
      return (
        <div className="flex gap-4 p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs">
          <div className="text-center">
            <div className="text-gray-500">Apna Maal Baqi (Trade AP)</div>
            <div className="font-bold font-mono text-sky-800">Rs. {fmt(summaryData.totalOwnAp)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Amanat Maal Haq (Consignment AP)</div>
            <div className="font-bold font-mono text-violet-800">Rs. {fmt(summaryData.totalConsignmentAp)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Kul Dena (Total Payable)</div>
            <div className="font-bold font-mono text-gray-900">Rs. {fmt(summaryData.grandTotal)}</div>
          </div>
        </div>
      );
    }

    if (selectedReport === 'employee_advances') {
      return (
        <div className="flex gap-4 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs">
          <div className="text-center">
            <div className="text-gray-500">Diya Gaya Advance</div>
            <div className="font-bold font-mono text-rose-600">Rs. {fmt(summaryData.totalGiven)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Kata Gaya Advance</div>
            <div className="font-bold font-mono text-emerald-700">Rs. {fmt(summaryData.totalDeducted)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Baqi Advance</div>
            <div className="font-bold font-mono text-orange-700">Rs. {fmt(summaryData.net)}</div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">
            <FileSpreadsheet className="w-5 h-5 text-brand-600" />
            Business Reports &amp; Intelligence
          </h1>
          <p className="page-subtitle">
            Real-time reports: Kachcha Maal / Stock • Farokht • Khareed • Grahak &amp; Supplier Khatay • Commission
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadCsv} className="btn-secondary">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={printDocument} className="btn-primary">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 items-start">
        {/* ── Left Sidebar (Grouped Reports) ── */}
        <div className="card p-3 space-y-1 md:col-span-1 max-h-[82vh] overflow-y-auto">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1">Report Chunein</h3>
          {REPORT_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-2">
              <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 mt-1 ${cat.color}`}>{cat.label}</div>
              {cat.ids.map((rid) => {
                const rep = REPORTS.find((r) => r.id === rid);
                if (!rep) return null;
                const Icon = rep.icon;
                const isActive = selectedReport === rep.id;
                return (
                  <button
                    key={rep.id}
                    onClick={() => {
                      setSelectedReport(rep.id);
                      setSearchFilter('');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition flex items-center gap-2.5 ${
                      isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-white' : rep.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate ${isActive ? 'font-bold' : ''}`}>{rep.title}</div>
                      <div className="text-[9px] opacity-70 truncate">{rep.urduTitle}</div>
                    </div>
                    {isActive && <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Right Panel ── */}
        <div className="card md:col-span-3 overflow-hidden">
          {/* Panel Header */}
          <div className="card-header flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {activeMeta && React.createElement(activeMeta.icon, { className: `w-4 h-4 ${activeMeta.color} flex-shrink-0` })}
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-gray-900 truncate">{activeMeta?.title}</h2>
                <span className="text-[10px] text-gray-500">{filteredData.length} records</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter table..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="form-input pl-6 py-1 text-[11px] w-32"
                />
              </div>

              {/* Quick presets */}
              {['Today', 'Week', 'Month', 'Last M', 'Year'].map((label, i) => (
                <button
                  key={label}
                  onClick={[setToday, setThisWeek, setThisMonth, setLastMonth, setThisYear][i]}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium bg-gray-100 text-gray-600 hover:bg-brand-600 hover:text-white transition"
                >
                  {label}
                </button>
              ))}

              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))}
                className="form-input py-1 text-[10px] w-28"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))}
                className="form-input py-1 text-[10px] w-28"
              />

              <button onClick={fetchReportData} className="btn-secondary py-1 px-2.5" title="Refresh Live Data">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Summary bar */}
          {summaryData && <div className="px-4 pb-3">{renderSummary()}</div>}

          {/* Table */}
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="table-base">
              <thead className="table-head sticky top-0">
                <tr>
                  {(TABLE_HEADERS[selectedReport] || []).map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="table-td text-center text-gray-400 py-12">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-600" />
                      <span className="text-xs mt-2 block">Data load ho raha hai...</span>
                    </td>
                  </tr>
                ) : (
                  renderRows()
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
