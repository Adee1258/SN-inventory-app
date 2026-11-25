import React, { useEffect, useState, useMemo } from 'react';
import {
  BookMarked,
  Printer,
  Download,
  RefreshCw,
  Search,
  Users,
  Truck,
  Package,
  Boxes,
  UserCheck,
  Percent,
} from 'lucide-react';
import { api } from '../api/client.js';
import { exportToCsv, printDocument } from '../utils/exportUtils.js';

type LedgerType =
  | 'CUSTOMER'
  | 'TRADE_SUPPLIER'
  | 'COMMISSION_SUPPLIER'
  | 'PRODUCT'
  | 'RAW_MATERIAL'
  | 'EMPLOYEE';

interface LedgerTab {
  id: LedgerType;
  label: string;
  urduLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const LEDGER_TABS: LedgerTab[] = [
  { id: 'CUSTOMER',            label: 'Customer Ledger',            urduLabel: 'Grahak Ka Khata',               icon: Users,     color: 'text-rose-600' },
  { id: 'TRADE_SUPPLIER',      label: 'Dukan Supplier Ledger',      urduLabel: 'Apna Maal Khareed Khata',        icon: Truck,     color: 'text-sky-600' },
  { id: 'COMMISSION_SUPPLIER', label: 'Commission Supplier Ledger', urduLabel: 'Amanat Maal & Commission Khata', icon: Percent,   color: 'text-violet-600' },
  { id: 'PRODUCT',             label: 'Product Item Ledger',        urduLabel: 'Har Item Ka Farokht Khata',     icon: Package,   color: 'text-emerald-600' },
  { id: 'RAW_MATERIAL',        label: 'Raw Stock Intake',           urduLabel: 'Kachcha Maal Daakhil Khata',    icon: Boxes,     color: 'text-amber-600' },
  { id: 'EMPLOYEE',            label: 'Staff Advance Ledger',       urduLabel: 'Mulazim Advance Khata',         icon: UserCheck, color: 'text-orange-600' },
];

const fmt = (v: number | string | undefined | null) => {
  const n = parseFloat(String(v || 0));
  return isNaN(n) ? '0.00' : n.toFixed(2);
};

const fmtDate = (d: string | Date | undefined) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Safe helper to extract item rate from sales item line
const getItemRate = (it: any): number => {
  if (it.ratePerEnteredUnit != null) return parseFloat(it.ratePerEnteredUnit);
  if (it.unitPrice != null) return parseFloat(it.unitPrice);
  return 0;
};

// Safe helper to extract item total from sales item line
const getItemTotal = (it: any): number => {
  if (it.netAmount != null) return parseFloat(it.netAmount);
  if (it.lineTotal != null) return parseFloat(it.lineTotal);
  if (it.grossAmount != null) return parseFloat(it.grossAmount);
  const qty = parseFloat(it.enteredQuantity || it.baseQuantity || '0');
  return qty * getItemRate(it);
};

// Robust helper to check if a sale item was CONSIGNMENT (Commission)
const isConsignmentItem = (it: any): boolean => {
  if (it.ownershipType === 'CONSIGNMENT') return true;
  if (it.supplierId != null && Number(it.supplierId) > 0) return true;
  if (
    it.stockAllocations &&
    it.stockAllocations.some((a: any) => a.batch?.ownershipType === 'CONSIGNMENT')
  ) {
    return true;
  }
  return false;
};

export const LedgerPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LedgerType>('CUSTOMER');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Product Ownership Filter for Product Item Ledger (ALL / OWN / CONSIGNMENT)
  const [productOwnershipFilter, setProductOwnershipFilter] = useState<'ALL' | 'OWN' | 'CONSIGNMENT'>('ALL');

  // Date filters
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  // Master Data
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [commissionReceipts, setCommissionReceipts] = useState<any[]>([]);
  const [commissionExpenses, setCommissionExpenses] = useState<any[]>([]);
  const [openingEntries, setOpeningEntries] = useState<any[]>([]);
  const [inventorySummary, setInventorySummary] = useState<any[]>([]);

  // Quick Date Helpers
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
  const setThisYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    setDateRange({ start, end: now.toISOString().split('T')[0] });
  };
  const setAllTime = () => {
    setDateRange({ start: '2020-01-01', end: new Date(Date.now() + 86400000).toISOString().split('T')[0] });
  };

  // ─── Classification Helper: Is this product a Commission Item? ────────────────
  const isCommissionProduct = (p: any): boolean => {
    const catName = p.category?.name?.toLowerCase() || '';
    if (catName.includes('consign') || catName.includes('commis')) return true;

    const inv = inventorySummary.find((inv) => String(inv.itemId) === String(p.id));
    if (inv && parseFloat(inv.consignmentStockBaseQty || '0') > 0) return true;

    if (
      commissionReceipts.some((rc) =>
        (rc.items || []).some((it: any) => String(it.itemId || it.item?.id) === String(p.id))
      )
    ) {
      return true;
    }

    if (
      sales.some((s) =>
        (s.items || []).some(
          (it: any) =>
            String(it.itemId || it.item?.id) === String(p.id) && isConsignmentItem(it)
        )
      )
    ) {
      return true;
    }

    return false;
  };

  // ─── Classification Helper: Is this product Dukan Ka Apna Maal? ─────────────────
  // RULE: Mutually exclusive with isCommissionProduct.
  // A product is "apna maal" ONLY IF it is NOT a commission/consignment product.
  const isOwnProduct = (p: any): boolean => {
    if (isCommissionProduct(p)) return false;
    return true;
  };

  // Helper: Check if product has active stock or any transaction history
  const hasProductHistory = (p: any): boolean => {
    const pId = String(p.id);
    const hasStock = parseFloat(p.totalStockRemaining || '0') > 0;
    if (hasStock) return true;
    const hasSales = sales.some((s) => s.items?.some((it: any) => String(it.itemId) === pId));
    if (hasSales) return true;
    const hasPurch = purchases.some((pr) => pr.items?.some((it: any) => String(it.itemId) === pId));
    if (hasPurch) return true;
    const hasComm = commissionReceipts.some((cr) => cr.items?.some((it: any) => String(it.itemId) === pId));
    if (hasComm) return true;
    const hasOpen = openingEntries.some((oe) => oe.items?.some((it: any) => String(it.itemId) === pId));
    if (hasOpen) return true;
    return false;
  };

  // ─── Filtered Product List for Dropdown based on productOwnershipFilter ───────
  const filteredProductsList = useMemo(() => {
    let list = products.filter(hasProductHistory);
    if (list.length === 0 && products.length > 0) list = products;
    if (productOwnershipFilter === 'CONSIGNMENT') {
      return list.filter(isCommissionProduct);
    }
    if (productOwnershipFilter === 'OWN') {
      return list.filter(isOwnProduct);
    }
    return list;
  }, [products, productOwnershipFilter, inventorySummary, commissionReceipts, openingEntries, purchases, sales]);

  // Counts of Products by Ownership
  const productCounts = useMemo(() => {
    let list = products.filter(hasProductHistory);
    if (list.length === 0 && products.length > 0) list = products;
    const commCount = list.filter(isCommissionProduct).length;
    const ownCount = list.filter(isOwnProduct).length;
    return {
      all: list.length,
      own: ownCount,
      consignment: commCount,
    };
  }, [products, inventorySummary, commissionReceipts, openingEntries, purchases, sales]);

  // Handle clicking product filter buttons: update filter AND auto-select valid product
  const handleProductFilterClick = (filter: 'ALL' | 'OWN' | 'CONSIGNMENT') => {
    setProductOwnershipFilter(filter);
    let nextList = products;
    if (filter === 'CONSIGNMENT') nextList = products.filter(isCommissionProduct);
    else if (filter === 'OWN') nextList = products.filter(isOwnProduct);

    if (nextList.length > 0 && !nextList.some((p) => String(p.id) === String(selectedEntityId))) {
      setSelectedEntityId(String(nextList[0].id));
    }
  };

  // ─── Classification Helper: Commission Supplier vs Trade Supplier ────────────
  const isCommissionSupplier = (s: any): boolean => {
    const hasConsignReceipts = Number(s._count?.consignmentReceipts || 0) > 0;
    const hasAgreements = Number(s._count?.commissionAgreements || 0) > 0;
    const hasConsignBalance = parseFloat(s.currentBalanceConsignment || '0') !== 0;
    const inReceipts = commissionReceipts.some((rc) => String(rc.supplierId) === String(s.id));
    const inExpenses = commissionExpenses.some((e) => String(e.supplierId) === String(s.id));
    return hasConsignReceipts || hasAgreements || hasConsignBalance || inReceipts || inExpenses;
  };

  const isTradeSupplier = (s: any): boolean => {
    const hasPurchaseInvoices = Number(s._count?.purchaseInvoices || 0) > 0;
    const hasOwnBalance = parseFloat(s.currentBalanceOwn || '0') !== 0;
    const inPurchases = purchases.some((p) => String(p.supplierId || p.supplier?.id) === String(s.id));
    const isOnlyComm =
      isCommissionSupplier(s) &&
      !hasPurchaseInvoices &&
      !inPurchases &&
      parseFloat(s.currentBalanceOwn || '0') === 0;
    return !isOnlyComm;
  };

  // Filtered Supplier Lists
  const commissionSuppliersList = useMemo(() => {
    return suppliers.filter(isCommissionSupplier);
  }, [suppliers, commissionReceipts, commissionExpenses]);

  const tradeSuppliersList = useMemo(() => {
    return suppliers.filter(isTradeSupplier);
  }, [suppliers, purchases, commissionReceipts, commissionExpenses]);

  // ─── Fetch All Fresh Data ─────────────────────────────────────────────────────
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [
        custList,
        suppList,
        itemList,
        empList,
        saleList,
        purchList,
        recList,
        payList,
        commRecList,
        commExpList,
        opList,
        invSum,
      ] = await Promise.all([
        api.get<any[]>('/parties/customers').catch(() => []),
        api.get<any[]>('/parties/suppliers').catch(() => []),
        api.get<any[]>('/items').catch(() => []),
        api.get<any[]>('/parties/employees').catch(() => []),
        api.get<any[]>('/sales').catch(() => []),
        api.get<any[]>('/purchases').catch(() => []),
        api.get<any[]>('/vouchers/receipts').catch(() => []),
        api.get<any[]>('/vouchers/payments').catch(() => []),
        api.get<any[]>('/commission/receipts').catch(() => []),
        api.get<any[]>('/commission/expenses').catch(() => []),
        api.get<any[]>('/opening-stock').catch(() => []),
        api.get<any[]>('/inventory/summary').catch(() => []),
      ]);

      setCustomers(custList || []);
      setSuppliers(suppList || []);
      setProducts(itemList || []);
      setEmployees(empList || []);
      setSales(saleList || []);
      setPurchases(purchList || []);
      setReceipts(recList || []);
      setPayments(payList || []);
      setCommissionReceipts(commRecList || []);
      setCommissionExpenses(commExpList || []);
      setOpeningEntries(opList || []);
      setInventorySummary(invSum || []);

      // Auto select first entity for current active tab
      if (activeTab === 'CUSTOMER' && custList?.length) {
        setSelectedEntityId(String(custList[0].id));
      } else if (activeTab === 'PRODUCT' && itemList?.length) {
        setSelectedEntityId(String(itemList[0].id));
      } else if (activeTab === 'EMPLOYEE' && empList?.length) {
        setSelectedEntityId(String(empList[0].id));
      }
    } catch (err) {
      console.error('Failed to load ledger data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // When switching tabs, auto-select first entity of that category
  const handleTabChange = (tab: LedgerType) => {
    setActiveTab(tab);
    setTableSearch('');
    if (tab === 'CUSTOMER' && customers.length) {
      setSelectedEntityId(String(customers[0].id));
    } else if (tab === 'TRADE_SUPPLIER') {
      setSelectedEntityId(String(tradeSuppliersList[0]?.id || suppliers[0]?.id || ''));
    } else if (tab === 'COMMISSION_SUPPLIER') {
      setSelectedEntityId(String(commissionSuppliersList[0]?.id || suppliers[0]?.id || ''));
    } else if (tab === 'PRODUCT') {
      let list = products;
      if (productOwnershipFilter === 'CONSIGNMENT') list = products.filter(isCommissionProduct);
      else if (productOwnershipFilter === 'OWN') list = products.filter(isOwnProduct);
      setSelectedEntityId(String(list[0]?.id || products[0]?.id || ''));
    } else if (tab === 'EMPLOYEE' && employees.length) {
      setSelectedEntityId(String(employees[0].id));
    } else {
      setSelectedEntityId('');
    }
  };

  // Sync selectedEntityId when tab is active and list changes
  useEffect(() => {
    if (activeTab === 'COMMISSION_SUPPLIER') {
      if (!selectedEntityId || !commissionSuppliersList.some((s) => String(s.id) === String(selectedEntityId))) {
        if (commissionSuppliersList.length > 0) {
          setSelectedEntityId(String(commissionSuppliersList[0].id));
        }
      }
    } else if (activeTab === 'TRADE_SUPPLIER') {
      if (!selectedEntityId || !tradeSuppliersList.some((s) => String(s.id) === String(selectedEntityId))) {
        if (tradeSuppliersList.length > 0) {
          setSelectedEntityId(String(tradeSuppliersList[0].id));
        }
      }
    } else if (activeTab === 'PRODUCT') {
      if (!selectedEntityId || !filteredProductsList.some((p) => String(p.id) === String(selectedEntityId))) {
        if (filteredProductsList.length > 0) {
          setSelectedEntityId(String(filteredProductsList[0].id));
        }
      }
    }
  }, [activeTab, commissionSuppliersList, tradeSuppliersList, filteredProductsList, selectedEntityId]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. CUSTOMER LEDGER (Grahak Ka Khata)
  // ══════════════════════════════════════════════════════════════════════════════
  const customerLedger = useMemo(() => {
    if (activeTab !== 'CUSTOMER') return { rows: [], opening: 0, totalDebit: 0, totalCredit: 0, closing: 0 };
    const customer = customers.find((c) => String(c.id) === String(selectedEntityId));
    if (!customer) return { rows: [], opening: 0, totalDebit: 0, totalCredit: 0, closing: 0 };

    const opening = parseFloat(customer.openingBalance || '0');
    const txs: any[] = [];

    // Sales Bills
    sales.forEach((s) => {
      if (String(s.customerId || s.customer?.id) === String(customer.id)) {
        const d = s.invoiceDate?.split('T')[0];
        const itemNames = (s.items || [])
          .map((it: any) => `${it.item?.name || 'Item'} (${it.enteredQuantity} ${it.enteredUnitName || ''})`)
          .join(', ');
        const total = parseFloat(s.netInvoiceAmount || '0');

        txs.push({
          date: s.invoiceDate,
          sortDate: d,
          type: 'SALE_INVOICE',
          refNo: s.invoiceNumber,
          description: `Sale Bill • ${itemNames || 'Wholesale Sale'}`,
          paymentMethod: s.paymentMethod,
          debit: total, // Bill increases customer receivable
          credit: 0,
        });

        // Instant cash payment on bill
        const paid = parseFloat(s.paidAmount || '0');
        if (paid > 0) {
          txs.push({
            date: s.invoiceDate,
            sortDate: d,
            type: 'SALE_PAYMENT',
            refNo: `CASH-${s.invoiceNumber}`,
            description: `Payment Received on Bill #${s.invoiceNumber}`,
            paymentMethod: s.paymentMethod,
            debit: 0,
            credit: paid, // Reduces receivable
          });
        }
      }
    });

    // Receipt Vouchers
    receipts.forEach((r) => {
      if (r.partyType === 'CUSTOMER' && String(r.partyId) === String(customer.id)) {
        const d = r.voucherDate?.split('T')[0];
        const amt = parseFloat(r.amount || '0');
        txs.push({
          date: r.voucherDate,
          sortDate: d,
          type: 'RECEIPT_VOUCHER',
          refNo: r.voucherNumber,
          description: r.narration || 'Cash / Bank Wasooli',
          paymentMethod: r.cashBankAccount?.accountName || 'Cash',
          debit: 0,
          credit: amt,
        });
      }
    });

    // Payment Vouchers (Cash Out to Customer - e.g. refund, return of advance)
    payments.forEach((p) => {
      if (p.partyType === 'CUSTOMER' && String(p.partyId) === String(customer.id)) {
        const d = p.voucherDate?.split('T')[0];
        const amt = parseFloat(p.amount || '0');
        txs.push({
          date: p.voucherDate,
          sortDate: d,
          type: 'PAYMENT_VOUCHER',
          refNo: p.voucherNumber,
          description: p.narration || 'Payment / Refund to Customer',
          paymentMethod: p.cashBankAccount?.accountName || 'Cash',
          debit: amt, // Money paid to customer increases customer debit / clears credit
          credit: 0,
        });
      }
    });

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;

    const calculatedRows = txs.map((tx) => {
      running = running + tx.debit - tx.credit;
      totalDebit += tx.debit;
      totalCredit += tx.credit;
      return {
        ...tx,
        balance: running,
      };
    });

    const filtered = calculatedRows.filter((r) => {
      if (dateRange.start && r.sortDate < dateRange.start) return false;
      if (dateRange.end && r.sortDate > dateRange.end) return false;
      if (tableSearch) {
        const q = tableSearch.toLowerCase();
        return r.refNo?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
      }
      return true;
    });

    return {
      rows: filtered,
      opening,
      totalDebit,
      totalCredit,
      closing: running,
    };
  }, [activeTab, selectedEntityId, customers, sales, receipts, payments, dateRange, tableSearch]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. DUKAN SUPPLIER LEDGER (Apna Maal Khareed & Trade AP)
  // ══════════════════════════════════════════════════════════════════════════════
  const tradeSupplierLedger = useMemo(() => {
    if (activeTab !== 'TRADE_SUPPLIER') return { rows: [], opening: 0, totalDebit: 0, totalCredit: 0, closing: 0 };
    const supplier = suppliers.find((s) => String(s.id) === String(selectedEntityId));
    if (!supplier) return { rows: [], opening: 0, totalDebit: 0, totalCredit: 0, closing: 0 };

    const opening = parseFloat(supplier.openingBalanceOwn || '0');
    const txs: any[] = [];

    // Purchases from this supplier
    purchases.forEach((p) => {
      if (String(p.supplierId || p.supplier?.id) === String(supplier.id)) {
        const d = p.invoiceDate?.split('T')[0];
        const itemNames = (p.items || []).map((it: any) => `${it.item?.name || 'Item'} (${it.quantity || ''})`).join(', ');
        const total = parseFloat(p.netLandedAmount || '0');

        txs.push({
          date: p.invoiceDate,
          sortDate: d,
          type: 'PURCHASE_BILL',
          refNo: p.invoiceNumber,
          description: `Khareed Bill (Own Stock) • ${itemNames || 'Goods Purchase'}`,
          debit: 0,
          credit: total, // Credit: supplier payable increases
        });

        const paid = parseFloat(p.paidAmount || '0');
        if (paid > 0) {
          txs.push({
            date: p.invoiceDate,
            sortDate: d,
            type: 'PURCHASE_PAYMENT',
            refNo: `CASH-${p.invoiceNumber}`,
            description: `Bill Par Adaigi #${p.invoiceNumber}`,
            debit: paid, // Debit: payable decreases
            credit: 0,
          });
        }
      }
    });

    // Payment Vouchers (we paid supplier -> reduces AP)
    payments.forEach((pm) => {
      if (pm.partyType === 'SUPPLIER' && String(pm.partyId) === String(supplier.id)) {
        if (!pm.narration?.toLowerCase().includes('consignment')) {
          const d = pm.voucherDate?.split('T')[0];
          const amt = parseFloat(pm.amount || '0');
          txs.push({
            date: pm.voucherDate,
            sortDate: d,
            type: 'PAYMENT_VOUCHER',
            refNo: pm.voucherNumber,
            description: pm.narration || 'Supplier Ko Adaigi (Payment)',
            debit: amt,
            credit: 0,
          });
        }
      }
    });

    // Receipt Vouchers (cash received from supplier -> increases AP, matches GL Credit 2010 & Supplier Balance)
    receipts.forEach((rc) => {
      if (rc.partyType === 'SUPPLIER' && String(rc.partyId) === String(supplier.id)) {
        if (!rc.narration?.toLowerCase().includes('consignment')) {
          const d = rc.voucherDate?.split('T')[0];
          const amt = parseFloat(rc.amount || '0');
          txs.push({
            date: rc.voucherDate,
            sortDate: d,
            type: 'RECEIPT_VOUCHER',
            refNo: rc.voucherNumber,
            description: rc.narration || 'Supplier Se Raqam Wasool (Receipt)',
            debit: 0,
            credit: amt,
          });
        }
      }
    });

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;

    const calculatedRows = txs.map((tx) => {
      running = running + tx.credit - tx.debit;
      totalDebit += tx.debit;
      totalCredit += tx.credit;
      return {
        ...tx,
        balance: running,
      };
    });

    const filtered = calculatedRows.filter((r) => {
      if (dateRange.start && r.sortDate < dateRange.start) return false;
      if (dateRange.end && r.sortDate > dateRange.end) return false;
      if (tableSearch) {
        const q = tableSearch.toLowerCase();
        return r.refNo?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
      }
      return true;
    });

    return {
      rows: filtered,
      opening,
      totalDebit,
      totalCredit,
      closing: running,
    };
  }, [activeTab, selectedEntityId, suppliers, purchases, payments, receipts, dateRange, tableSearch]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 3. COMMISSION SUPPLIER LEDGER (Amanat Maal, Commission, Kharche & Net Haq)
  // ══════════════════════════════════════════════════════════════════════════════
  const commissionSupplierLedger = useMemo(() => {
    if (activeTab !== 'COMMISSION_SUPPLIER') {
      return {
        rows: [],
        opening: 0,
        totalSalesValue: 0,
        totalCommission: 0,
        totalExpenses: 0,
        totalSettled: 0,
        remainingPayable: 0,
        totalReceivedQty: 0,
        totalSoldQty: 0,
        remainingStockQty: 0,
      };
    }

    const supplier = suppliers.find((s) => String(s.id) === String(selectedEntityId));
    if (!supplier) {
      return {
        rows: [],
        opening: 0,
        totalSalesValue: 0,
        totalCommission: 0,
        totalExpenses: 0,
        totalSettled: 0,
        remainingPayable: 0,
        totalReceivedQty: 0,
        totalSoldQty: 0,
        remainingStockQty: 0,
      };
    }

    const opening = parseFloat(supplier.openingBalanceConsignment || '0');
    const txs: any[] = [];
    let totalReceivedQty = 0;
    let totalSoldQty = 0;

    // 1. Consignment Intake (Maal Daakhil)
    commissionReceipts.forEach((rc) => {
      if (String(rc.supplierId) === String(supplier.id)) {
        const d = rc.receiptDate?.split('T')[0];
        (rc.items || []).forEach((it: any) => {
          const qty = parseFloat(it.enteredQuantity || it.baseQuantity || '0');
          totalReceivedQty += qty;
          txs.push({
            date: rc.receiptDate,
            sortDate: d,
            type: 'CONSIGNMENT_INTAKE',
            refNo: rc.receiptNumber,
            description: `📦 Amanat Maal Aaya • ${it.item?.name || 'Item'} (${qty} ${it.enteredUnitName || 'KG'})`,
            qtyImpact: `+${qty}`,
            grossAmount: 0,
            debit: 0,
            credit: 0,
          });
        });
      }
    });

    // 2. Consignment Sales (Maal Bika) — Match by supplierId or batch allocation
    let totalSalesValue = 0;
    let totalCommission = 0;

    sales.forEach((s) => {
      const d = s.invoiceDate?.split('T')[0];
      (s.items || []).forEach((it: any) => {
        const matchesSupplier =
          String(it.supplierId) === String(supplier.id) ||
          (it.stockAllocations || []).some(
            (alloc: any) =>
              alloc.batch?.ownershipType === 'CONSIGNMENT' &&
              String(alloc.batch?.supplierId) === String(supplier.id)
          );

        if (isConsignmentItem(it) && matchesSupplier) {
          const soldQty = parseFloat(it.enteredQuantity || it.baseQuantity || '0');
          const unitRate = getItemRate(it);
          const grossSale = getItemTotal(it);

          totalSoldQty += soldQty;
          totalSalesValue += grossSale;

          const commAmt = parseFloat(it.commissionAmount || '0') || grossSale * 0.05;
          totalCommission += commAmt;

          const supplierPayable = parseFloat(it.supplierPayable || '0') || (grossSale - commAmt);

          txs.push({
            date: s.invoiceDate,
            sortDate: d,
            type: 'CONSIGNMENT_SALE',
            refNo: s.invoiceNumber,
            description: `Farokht • ${it.item?.name || 'Item'} (${soldQty} ${it.enteredUnitName || 'KG'} @ Rs. ${fmt(unitRate)}) • Minus Comm: Rs. ${fmt(commAmt)}`,
            qtyImpact: `-${soldQty}`,
            grossAmount: grossSale,
            commissionAmount: commAmt,
            debit: 0,
            credit: supplierPayable, // Net proceeds credited to supplier
          });
        }
      });
    });

    // 3. Commission Expenses on this supplier
    let totalExpenses = 0;
    commissionExpenses.forEach((exp) => {
      if (String(exp.supplierId) === String(supplier.id)) {
        const d = exp.expenseDate?.split('T')[0];
        const amt = parseFloat(exp.amount || '0');
        totalExpenses += amt;

        txs.push({
          date: exp.expenseDate,
          sortDate: d,
          type: 'COMMISSION_EXPENSE',
          refNo: `EXP-${exp.id}`,
          description: `Kharcha (${exp.category || 'General'}) • ${exp.description || exp.tafseel || 'Kharcha Kata'}`,
          qtyImpact: '—',
          grossAmount: 0,
          debit: amt,
          credit: 0,
        });
      }
    });

    // 4. Payments Made to Commission Supplier
    let totalSettled = 0;
    payments.forEach((pm) => {
      if (pm.partyType === 'SUPPLIER' && String(pm.partyId) === String(supplier.id)) {
        const d = pm.voucherDate?.split('T')[0];
        const amt = parseFloat(pm.amount || '0');
        totalSettled += amt;

        txs.push({
          date: pm.voucherDate,
          sortDate: d,
          type: 'SUPPLIER_PAYMENT',
          refNo: pm.voucherNumber,
          description: pm.narration || 'Supplier Ko Adaigi (Settlement Paid)',
          qtyImpact: '—',
          grossAmount: 0,
          debit: amt,
          credit: 0,
        });
      }
    });

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = opening;
    const calculatedRows = txs.map((tx) => {
      running = running + tx.credit - tx.debit;
      return {
        ...tx,
        balance: running,
      };
    });

    const filtered = calculatedRows.filter((r) => {
      if (dateRange.start && r.sortDate < dateRange.start) return false;
      if (dateRange.end && r.sortDate > dateRange.end) return false;
      if (tableSearch) {
        const q = tableSearch.toLowerCase();
        return r.refNo?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
      }
      return true;
    });

    return {
      rows: filtered,
      opening,
      totalSalesValue,
      totalCommission,
      totalExpenses,
      totalSettled,
      remainingPayable: running,
      totalReceivedQty,
      totalSoldQty,
      remainingStockQty: Math.max(0, totalReceivedQty - totalSoldQty),
    };
  }, [activeTab, selectedEntityId, suppliers, commissionReceipts, commissionExpenses, sales, payments, dateRange, tableSearch]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 4. PRODUCT ITEM SALES LEDGER
  // ══════════════════════════════════════════════════════════════════════════════
  const productLedger = useMemo(() => {
    if (activeTab !== 'PRODUCT') return { rows: [], totalQty: 0, totalAmount: 0, avgPrice: 0, billCount: 0, stockRemaining: 0 };
    const product = products.find((p) => String(p.id) === String(selectedEntityId));
    if (!product) return { rows: [], totalQty: 0, totalAmount: 0, avgPrice: 0, billCount: 0, stockRemaining: 0 };

    const txs: any[] = [];

    sales.forEach((s) => {
      const d = s.invoiceDate?.split('T')[0];
      (s.items || []).forEach((it: any) => {
        if (String(it.itemId || it.item?.id) === String(product.id)) {
          const isConsign = isConsignmentItem(it);

          // Ownership Filter
          if (productOwnershipFilter === 'OWN' && isConsign) return;
          if (productOwnershipFilter === 'CONSIGNMENT' && !isConsign) return;

          const qty = parseFloat(it.enteredQuantity || it.baseQuantity || '0');
          const rate = getItemRate(it);
          const total = getItemTotal(it);

          txs.push({
            date: s.invoiceDate,
            sortDate: d,
            invoiceNumber: s.invoiceNumber,
            customerName: s.customer?.name || 'Walk-in',
            customerPhone: s.customer?.phone || '—',
            ownershipType: isConsign ? 'Amanat Maal' : 'Apna Maal',
            quantity: qty,
            unitName: it.enteredUnitName || product.baseUnit?.symbol || 'KG',
            unitPrice: rate,
            lineTotal: total,
            paymentMethod: s.paymentMethod,
          });
        }
      });
    });

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let cumQty = 0;
    let cumTotal = 0;

    const calculatedRows = txs.map((tx) => {
      cumQty += tx.quantity;
      cumTotal += tx.lineTotal;
      return {
        ...tx,
        cumulativeQty: cumQty,
        cumulativeTotal: cumTotal,
      };
    });

    const filtered = calculatedRows.filter((r) => {
      if (dateRange.start && r.sortDate < dateRange.start) return false;
      if (dateRange.end && r.sortDate > dateRange.end) return false;
      if (tableSearch) {
        const q = tableSearch.toLowerCase();
        return (
          r.invoiceNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.ownershipType.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const inv = inventorySummary.find((inv) => String(inv.itemId) === String(product.id));
    const stockRemaining = inv ? parseFloat(inv.totalPhysicalBaseQty || '0') : 0;

    const totalQty = filtered.reduce((s, r) => s + r.quantity, 0);
    const totalAmount = filtered.reduce((s, r) => s + r.lineTotal, 0);
    const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0;

    return {
      rows: filtered,
      totalQty,
      totalAmount,
      avgPrice,
      billCount: filtered.length,
      stockRemaining,
    };
  }, [activeTab, selectedEntityId, products, sales, inventorySummary, productOwnershipFilter, dateRange, tableSearch]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 5. RAW MATERIAL INTAKE LEDGER
  // ══════════════════════════════════════════════════════════════════════════════
  const rawMaterialLedger = useMemo(() => {
    if (activeTab !== 'RAW_MATERIAL') return { rows: [], totalQtyIn: 0, totalCost: 0, totalRemaining: 0 };

    const txs: any[] = [];
    let totalQtyIn = 0;
    let totalCost = 0;
    let totalRemaining = 0;

    openingEntries.forEach((entry: any) => {
      const d = entry.entryDate?.split('T')[0];
      (entry.items || []).forEach((it: any) => {
        if (selectedEntityId && selectedEntityId !== 'ALL') {
          if (String(it.itemId || it.item?.id) !== String(selectedEntityId)) return;
        }

        const qty = parseFloat(it.enteredQuantity || '0');
        const rem = parseFloat(it.remainingQuantity ?? it.enteredQuantity);
        const rate = parseFloat(it.unitCost || '0');

        let extra = 0;
        let extraNote = '';
        if (it.notes) {
          const m = it.notes.match(/Extra Charges: Rs\.([\d.]+)(?:\s+\((.+)\))?/);
          if (m) {
            extra = parseFloat(m[1]) || 0;
            extraNote = m[2] ?? '';
          }
        }

        const cost = qty * rate + extra;

        totalQtyIn += qty;
        totalCost += cost;
        totalRemaining += rem;

        txs.push({
          date: entry.entryDate,
          sortDate: d,
          entryNumber: entry.entryNumber,
          itemName: it.item?.name || '—',
          supplierName: it.supplier?.name || '—',
          unitCost: rate,
          enteredQuantity: qty,
          unitName: it.enteredUnitName || 'KG',
          soldQuantity: it.soldQuantity || '0.00',
          remainingQuantity: rem,
          extraCharges: extra,
          extraNote,
          totalCost: cost,
          status: it.batchStatus || (rem > 0 ? 'ACTIVE' : 'EXHAUSTED'),
        });
      });
    });

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const filtered = txs.filter((r) => {
      if (dateRange.start && r.sortDate < dateRange.start) return false;
      if (dateRange.end && r.sortDate > dateRange.end) return false;
      if (tableSearch) {
        const q = tableSearch.toLowerCase();
        return (
          r.entryNumber.toLowerCase().includes(q) ||
          r.itemName.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return {
      rows: filtered,
      totalQtyIn,
      totalCost,
      totalRemaining,
    };
  }, [activeTab, selectedEntityId, openingEntries, dateRange, tableSearch]);

  // ══════════════════════════════════════════════════════════════════════════════
  // 6. EMPLOYEE ADVANCE LEDGER
  // ══════════════════════════════════════════════════════════════════════════════
  const employeeLedger = useMemo(() => {
    if (activeTab !== 'EMPLOYEE') return { rows: [], opening: 0, totalGiven: 0, totalDeducted: 0, netAdvance: 0 };
    const emp = employees.find((e) => String(e.id) === String(selectedEntityId));
    if (!emp) return { rows: [], opening: 0, totalGiven: 0, totalDeducted: 0, netAdvance: 0 };

    const opening = parseFloat(emp.openingBalance || '0');
    const advances = emp.advances || [];
    const txs: any[] = [];

    // 1. Include Opening Balance entry if present
    if (opening > 0) {
      const openDate = emp.joiningDate ? `${emp.joiningDate}T00:00:00.000Z` : new Date().toISOString();
      txs.push({
        id: 'opening-advance',
        date: openDate,
        sortDate: openDate.split('T')[0],
        type: 'OPENING_BALANCE',
        description: 'Pehle Ka Khara Advance (Opening Balance)',
        debit: opening,
        credit: 0,
      });
    }

    // 2. Subsequent Advances
    advances.forEach((adv: any, idx: number) => {
      const d = adv.date?.split('T')[0];
      const amt = parseFloat(adv.amount || '0');
      const isGiven = adv.type === 'GIVEN';

      txs.push({
        id: adv.id || idx,
        date: adv.date,
        sortDate: d,
        type: isGiven ? 'ADVANCE_GIVEN' : 'ADVANCE_DEDUCTED',
        description: adv.notes || (isGiven ? 'Advance Raqam Di Gayi' : 'Tankhwah Se Kata Gaya'),
        debit: isGiven ? amt : 0,
        credit: !isGiven ? amt : 0,
      });
    });

    // 3. Salary payments and cash vouchers for this employee
    payments.forEach((p: any) => {
      if (p.partyType === 'EMPLOYEE' && String(p.partyId) === String(emp.id)) {
        const d = p.voucherDate?.split('T')[0];
        const amt = parseFloat(p.amount || '0');
        const isSalary =
          p.narration?.toLowerCase().includes('salary') ||
          p.narration?.toLowerCase().includes('tankhwah') ||
          p.debitAccount?.accountCode === '5050' ||
          !p.narration?.toLowerCase().includes('advance');

        if (isSalary) {
          txs.push({
            id: `pay-sal-${p.id}`,
            date: p.voucherDate,
            sortDate: d,
            type: 'SALARY_PAID',
            voucherNumber: p.voucherNumber,
            description: `${p.voucherNumber ? `[${p.voucherNumber}] ` : ''}${p.narration || 'Monthly Salary Paid'}`,
            debit: 0,
            credit: 0,
            salaryAmount: amt,
          });
        }
      }
    });

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    let totalGiven = 0;
    let totalDeducted = 0;
    let totalSalaryPaid = 0;

    const calculatedRows = txs.map((tx) => {
      running = running + tx.debit - tx.credit;
      if (tx.type === 'ADVANCE_GIVEN') totalGiven += tx.debit;
      if (tx.type === 'ADVANCE_DEDUCTED') totalDeducted += tx.credit;
      if (tx.type === 'SALARY_PAID') totalSalaryPaid += (tx.salaryAmount || 0);
      return {
        ...tx,
        balance: running,
      };
    });

    const filtered = calculatedRows.filter((r) => {
      if (r.type === 'OPENING_BALANCE') return true; // Always show opening row
      if (dateRange.start && r.sortDate < dateRange.start) return false;
      if (dateRange.end && r.sortDate > dateRange.end) return false;
      if (tableSearch) {
        const q = tableSearch.toLowerCase();
        return r.description.toLowerCase().includes(q);
      }
      return true;
    });

    return {
      rows: filtered,
      opening,
      totalGiven,
      totalDeducted,
      netAdvance: running,
      totalSalaryPaid,
    };
  }, [activeTab, selectedEntityId, employees, payments, dateRange, tableSearch]);

  // ─── Export CSV ───────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let filename = `Ledger_${activeTab}_${dateRange.start}_to_${dateRange.end}`;

    if (activeTab === 'CUSTOMER') {
      const c = customers.find((x) => String(x.id) === String(selectedEntityId));
      filename = `Customer_Ledger_${c?.name || 'Customer'}`;
      headers = ['Date', 'Type', 'Voucher / Bill #', 'Description', 'Payment Method', 'Debit (Bill Rs.)', 'Credit (Wasool Rs.)', 'Running Balance (Rs.)'];
      rows = customerLedger.rows.map((r) => [fmtDate(r.date), r.type, r.refNo, r.description, r.paymentMethod || '—', fmt(r.debit), fmt(r.credit), fmt(r.balance)]);
    } else if (activeTab === 'TRADE_SUPPLIER') {
      const s = suppliers.find((x) => String(x.id) === String(selectedEntityId));
      filename = `Trade_Supplier_Ledger_${s?.name || 'Supplier'}`;
      headers = ['Date', 'Type', 'Bill / Voucher #', 'Description', 'Debit (Adaigi Rs.)', 'Credit (Khareed Rs.)', 'Running Balance (Rs.)'];
      rows = tradeSupplierLedger.rows.map((r) => [fmtDate(r.date), r.type, r.refNo, r.description, fmt(r.debit), fmt(r.credit), fmt(r.balance)]);
    } else if (activeTab === 'COMMISSION_SUPPLIER') {
      const s = suppliers.find((x) => String(x.id) === String(selectedEntityId));
      filename = `Commission_Supplier_Ledger_${s?.name || 'Commission_Supplier'}`;
      headers = ['Date', 'Type', 'Ref #', 'Description', 'Qty Impact', 'Debit (Minus)', 'Credit (Net Proceeds)', 'Running Balance (Rs.)'];
      rows = commissionSupplierLedger.rows.map((r) => [fmtDate(r.date), r.type, r.refNo, r.description, r.qtyImpact || '—', fmt(r.debit), fmt(r.credit), fmt(r.balance)]);
    } else if (activeTab === 'PRODUCT') {
      const p = products.find((x) => String(x.id) === String(selectedEntityId));
      filename = `Product_Ledger_${p?.name || 'Product'}`;
      headers = ['Date', 'Bill #', 'Customer', 'Ownership Type', 'Quantity', 'Rate (Rs.)', 'Total (Rs.)', 'Cum. Qty', 'Cum. Sales (Rs.)'];
      rows = productLedger.rows.map((r) => [fmtDate(r.date), r.invoiceNumber, r.customerName, r.ownershipType, `${r.quantity} ${r.unitName}`, fmt(r.unitPrice), fmt(r.lineTotal), r.cumulativeQty, fmt(r.cumulativeTotal)]);
    } else if (activeTab === 'RAW_MATERIAL') {
      filename = 'Raw_Material_Ledger';
      headers = ['Date', 'Entry #', 'Material / Item', 'Supplier', 'Khareed Rate', 'Entered Qty', 'Sold Qty', 'Remaining Qty', 'Extra Charges', 'Total Cost', 'Status'];
      rows = rawMaterialLedger.rows.map((r) => [fmtDate(r.date), r.entryNumber, r.itemName, r.supplierName, fmt(r.unitCost), `${r.enteredQuantity} ${r.unitName}`, r.soldQuantity, `${r.remainingQuantity} ${r.unitName}`, r.extraCharges > 0 ? fmt(r.extraCharges) : '0.00', fmt(r.totalCost), r.status]);
    } else if (activeTab === 'EMPLOYEE') {
      const e = employees.find((x) => String(x.id) === String(selectedEntityId));
      filename = `Employee_Ledger_${e?.name || 'Staff'}`;
      headers = ['Date', 'Type', 'Description', 'Advance Diya (+ Debit)', 'Advance Kata / Wapis (- Credit)', 'Running Advance (Rs.)', 'Salary Paid (Rs.)'];
      rows = employeeLedger.rows.map((r) => [fmtDate(r.date), r.type, r.description, fmt(r.debit), fmt(r.credit), fmt(r.balance), r.type === 'SALARY_PAID' ? fmt(r.salaryAmount || 0) : '—']);
    }

    exportToCsv(filename, headers, rows);
  };

  // Active entity details
  const activeEntityName = useMemo(() => {
    if (activeTab === 'CUSTOMER') return customers.find((c) => String(c.id) === String(selectedEntityId))?.name || 'Customer Chunein';
    if (activeTab === 'TRADE_SUPPLIER') return suppliers.find((s) => String(s.id) === String(selectedEntityId))?.name || 'Supplier Chunein';
    if (activeTab === 'COMMISSION_SUPPLIER') return suppliers.find((s) => String(s.id) === String(selectedEntityId))?.name || 'Commission Supplier Chunein';
    if (activeTab === 'PRODUCT') return products.find((p) => String(p.id) === String(selectedEntityId))?.name || 'Product Chunein';
    if (activeTab === 'RAW_MATERIAL') return selectedEntityId === 'ALL' || !selectedEntityId ? 'Tamam Kachcha Maal' : products.find((p) => String(p.id) === String(selectedEntityId))?.name;
    if (activeTab === 'EMPLOYEE') return employees.find((e) => String(e.id) === String(selectedEntityId))?.name || 'Mulazim Chunein';
    return '';
  }, [activeTab, selectedEntityId, customers, suppliers, products, employees]);

  return (
    <div className="page-wrapper">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">
            <BookMarked className="w-5 h-5 text-brand-600" />
            General &amp; Product Ledger (Khaata Book)
          </h1>
          <p className="page-subtitle">
            Customer, Dukan Supplier, Commission Supplier, Employee aur Har Product ka alag alag tafseeli khata
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCsv} className="btn-secondary">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={printDocument} className="btn-primary">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
          <button onClick={loadAllData} className="btn-secondary" title="Refresh Live Data">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Top Tabs (6 Dedicated Ledger Tabs) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {LEDGER_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
                isActive
                  ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                  : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 ' + tab.color
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold truncate leading-tight">{tab.label}</div>
                <div className={`text-[9px] truncate ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                  {tab.urduLabel}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filter & Entity Selector Bar ── */}
      <div className="card p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Entity Selector Dropdown */}
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-xs font-bold text-gray-700 whitespace-nowrap">
              {activeTab === 'CUSTOMER' && '👤 Grahak (Customer):'}
              {activeTab === 'TRADE_SUPPLIER' && '🚚 Dukan Supplier (Trade):'}
              {activeTab === 'COMMISSION_SUPPLIER' && '🤝 Commission Supplier:'}
              {activeTab === 'PRODUCT' && '📦 Product Item:'}
              {activeTab === 'RAW_MATERIAL' && '🌿 Kachcha Maal / Item:'}
              {activeTab === 'EMPLOYEE' && '👷 Mulazim (Staff):'}
            </span>

            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="form-input py-1.5 text-xs font-semibold flex-1 max-w-md bg-white border-brand-500 ring-1 ring-brand-500/20"
            >
              {/* CUSTOMERS */}
              {activeTab === 'CUSTOMER' &&
                customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code}) — Baqi: Rs. {fmt(c.currentBalance)}
                  </option>
                ))}

              {/* DUKAN / TRADE SUPPLIERS (Strictly Trade Suppliers Only) */}
              {activeTab === 'TRADE_SUPPLIER' &&
                (tradeSuppliersList.length === 0 ? (
                  <option value="">Koi Dukan Supplier Nahi Mila</option>
                ) : (
                  tradeSuppliersList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — Dukan AP: Rs. {fmt(s.currentBalanceOwn || 0)}
                    </option>
                  ))
                ))}

              {/* COMMISSION SUPPLIERS (Strictly Commission Suppliers Only) */}
              {activeTab === 'COMMISSION_SUPPLIER' &&
                (commissionSuppliersList.length === 0 ? (
                  <option value="">Koi Commission Supplier Nahi Mila</option>
                ) : (
                  commissionSuppliersList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — Amanat Haq: Rs. {fmt(s.currentBalanceConsignment || 0)}
                    </option>
                  ))
                ))}

              {/* PRODUCTS (Strictly filtered by productOwnershipFilter!) */}
              {activeTab === 'PRODUCT' &&
                (filteredProductsList.length === 0 ? (
                  <option value="">Is category mein koi product nahi mila</option>
                ) : (
                  filteredProductsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) — {p.category?.name || 'General'}
                    </option>
                  ))
                ))}

              {/* RAW MATERIAL */}
              {activeTab === 'RAW_MATERIAL' && (
                <>
                  <option value="ALL">Tamam Kachcha Maal (All Items)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </>
              )}

              {/* EMPLOYEES */}
              {activeTab === 'EMPLOYEE' &&
                employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.designation || 'Staff'}) — Baqi Advance: Rs. {fmt(e.currentAdvance)}
                  </option>
                ))}
            </select>
          </div>

          {/* Product Ownership Toggle with LIVE COUNTS of Products */}
          {activeTab === 'PRODUCT' && (
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button
                onClick={() => handleProductFilterClick('ALL')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
                  productOwnershipFilter === 'ALL'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Dukan ke tamam products dikhayein"
              >
                <span>Tamam Maal</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 text-gray-700">
                  {productCounts.all}
                </span>
              </button>

              <button
                onClick={() => handleProductFilterClick('OWN')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
                  productOwnershipFilter === 'OWN'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Sirf dukan ka apna khareeda hua maal dikhayein"
              >
                <span>Sirf Apna Maal</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    productOwnershipFilter === 'OWN'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {productCounts.own}
                </span>
              </button>

              <button
                onClick={() => handleProductFilterClick('CONSIGNMENT')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
                  productOwnershipFilter === 'CONSIGNMENT'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Sirf commission / consignment walay items dikhayein"
              >
                <span>Sirf Commission Maal</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    productOwnershipFilter === 'CONSIGNMENT'
                      ? 'bg-violet-700 text-white'
                      : 'bg-violet-100 text-violet-800'
                  }`}
                >
                  {productCounts.consignment}
                </span>
              </button>
            </div>
          )}

          {/* Quick Date Presets & Range */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {['Today', 'This Week', 'This Month', 'This Year', 'All Time'].map((label, idx) => (
              <button
                key={label}
                onClick={[setToday, setThisWeek, setThisMonth, setThisYear, setAllTime][idx]}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-700 hover:bg-brand-600 hover:text-white transition"
              >
                {label}
              </button>
            ))}

            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))}
              className="form-input py-1 text-xs w-32"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))}
              className="form-input py-1 text-xs w-32"
            />
          </div>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      {/* 1. CUSTOMER KPIS */}
      {activeTab === 'CUSTOMER' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3 bg-gray-50 border-gray-200">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Pehle Ka Opening Balance</span>
            <div className="text-lg font-bold font-mono text-gray-900 mt-1">Rs. {fmt(customerLedger.opening)}</div>
          </div>
          <div className="card p-3 bg-brand-50 border-brand-200">
            <span className="text-[10px] text-brand-700 font-bold uppercase tracking-wider">Kul Sale Bills (Debit +)</span>
            <div className="text-lg font-bold font-mono text-brand-800 mt-1">Rs. {fmt(customerLedger.totalDebit)}</div>
          </div>
          <div className="card p-3 bg-emerald-50 border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Kul Wasooli (Credit -)</span>
            <div className="text-lg font-bold font-mono text-emerald-800 mt-1">Rs. {fmt(customerLedger.totalCredit)}</div>
          </div>
          <div className={`card p-3 ${customerLedger.closing > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${customerLedger.closing > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              Ab Tak Baqi Lena (Closing)
            </span>
            <div className={`text-xl font-bold font-mono mt-1 ${customerLedger.closing > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              Rs. {fmt(customerLedger.closing)}
            </div>
          </div>
        </div>
      )}

      {/* 2. DUKAN SUPPLIER KPIS */}
      {activeTab === 'TRADE_SUPPLIER' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3 bg-gray-50 border-gray-200">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Opening AP Balance</span>
            <div className="text-lg font-bold font-mono text-gray-900 mt-1">Rs. {fmt(tradeSupplierLedger.opening)}</div>
          </div>
          <div className="card p-3 bg-sky-50 border-sky-200">
            <span className="text-[10px] text-sky-700 font-bold uppercase tracking-wider">Kul Khareed Bills (Credit +)</span>
            <div className="text-lg font-bold font-mono text-sky-800 mt-1">Rs. {fmt(tradeSupplierLedger.totalCredit)}</div>
          </div>
          <div className="card p-3 bg-emerald-50 border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Kul Adaigi (Debit -)</span>
            <div className="text-lg font-bold font-mono text-emerald-800 mt-1">Rs. {fmt(tradeSupplierLedger.totalDebit)}</div>
          </div>
          <div className="card p-3 bg-amber-50 border-amber-200">
            <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Dukan AP Baqi Dena</span>
            <div className="text-xl font-bold font-mono text-amber-800 mt-1">Rs. {fmt(tradeSupplierLedger.closing)}</div>
          </div>
        </div>
      )}

      {/* 3. COMMISSION SUPPLIER KPIS */}
      {activeTab === 'COMMISSION_SUPPLIER' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <div className="card p-3 bg-violet-50 border-violet-200">
            <span className="text-[10px] text-violet-700 font-bold uppercase tracking-wider">Kul Maal Aaya</span>
            <div className="text-lg font-bold font-mono text-violet-800 mt-1">{fmt(commissionSupplierLedger.totalReceivedQty)}</div>
            <span className="text-[9px] text-gray-400">Baqi Stock: {fmt(commissionSupplierLedger.remainingStockQty)}</span>
          </div>
          <div className="card p-3 bg-brand-50 border-brand-200">
            <span className="text-[10px] text-brand-700 font-bold uppercase tracking-wider">Kul Farokht (Sale)</span>
            <div className="text-lg font-bold font-mono text-brand-800 mt-1">Rs. {fmt(commissionSupplierLedger.totalSalesValue)}</div>
            <span className="text-[9px] text-gray-400">Bika: {fmt(commissionSupplierLedger.totalSoldQty)}</span>
          </div>
          <div className="card p-3 bg-emerald-50 border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Commission Kati</span>
            <div className="text-lg font-bold font-mono text-emerald-800 mt-1">Rs. {fmt(commissionSupplierLedger.totalCommission)}</div>
            <span className="text-[9px] text-gray-400">Hamari Kamai</span>
          </div>
          <div className="card p-3 bg-rose-50 border-rose-200">
            <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Kharche Katay</span>
            <div className="text-lg font-bold font-mono text-rose-800 mt-1">Rs. {fmt(commissionSupplierLedger.totalExpenses)}</div>
            <span className="text-[9px] text-gray-400">Mazdoori, Bilti etc.</span>
          </div>
          <div className="card p-3 bg-sky-50 border-sky-200">
            <span className="text-[10px] text-sky-700 font-bold uppercase tracking-wider">Diya Gaya (Settled)</span>
            <div className="text-lg font-bold font-mono text-sky-800 mt-1">Rs. {fmt(commissionSupplierLedger.totalSettled)}</div>
            <span className="text-[9px] text-gray-400">Ada Shuda Raqam</span>
          </div>
          <div className="card p-3 bg-amber-50 border-amber-200">
            <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Ab Tak Baqi Dena</span>
            <div className="text-xl font-bold font-mono text-amber-800 mt-1">Rs. {fmt(commissionSupplierLedger.remainingPayable)}</div>
            <span className="text-[9px] text-gray-400">Net Supplier Haq</span>
          </div>
        </div>
      )}

      {/* 4. PRODUCT KPIS */}
      {activeTab === 'PRODUCT' && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="card p-3 bg-emerald-50 border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Kul Bechi Gayi Qty</span>
            <div className="text-xl font-bold font-mono text-emerald-800 mt-1">
              {fmt(productLedger.totalQty)}{' '}
              <span className="text-xs font-normal">
                {products.find((p) => String(p.id) === String(selectedEntityId))?.baseUnit?.symbol || 'KG'}
              </span>
            </div>
          </div>
          <div className="card p-3 bg-brand-50 border-brand-200">
            <span className="text-[10px] text-brand-700 font-bold uppercase tracking-wider">Kul Farokht Raqam</span>
            <div className="text-xl font-bold font-mono text-brand-800 mt-1">Rs. {fmt(productLedger.totalAmount)}</div>
          </div>
          <div className="card p-3 bg-teal-50 border-teal-200">
            <span className="text-[10px] text-teal-700 font-bold uppercase tracking-wider">Ausat Rate (Avg Price)</span>
            <div className="text-lg font-bold font-mono text-teal-800 mt-1">Rs. {fmt(productLedger.avgPrice)}</div>
          </div>
          <div className="card p-3 bg-sky-50 border-sky-200">
            <span className="text-[10px] text-sky-700 font-bold uppercase tracking-wider">Kitne Bills Mein Bika</span>
            <div className="text-xl font-bold font-mono text-sky-800 mt-1">{productLedger.billCount} bills</div>
          </div>
          <div className="card p-3 bg-amber-50 border-amber-200">
            <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Dukan Par Mojood Stock</span>
            <div className="text-xl font-bold font-mono text-amber-800 mt-1">
              {fmt(productLedger.stockRemaining)}{' '}
              <span className="text-xs font-normal">
                {products.find((p) => String(p.id) === String(selectedEntityId))?.baseUnit?.symbol || 'KG'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. RAW MATERIAL KPIS */}
      {activeTab === 'RAW_MATERIAL' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card p-3 bg-amber-50 border-amber-200">
            <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Kul Daakhil Kachcha Maal</span>
            <div className="text-xl font-bold font-mono text-amber-800 mt-1">{fmt(rawMaterialLedger.totalQtyIn)}</div>
          </div>
          <div className="card p-3 bg-brand-50 border-brand-200">
            <span className="text-[10px] text-brand-700 font-bold uppercase tracking-wider">Kul Khareed Value</span>
            <div className="text-xl font-bold font-mono text-brand-800 mt-1">Rs. {fmt(rawMaterialLedger.totalCost)}</div>
          </div>
          <div className="card p-3 bg-emerald-50 border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Baqi Mojood Kachcha Stock</span>
            <div className="text-xl font-bold font-mono text-emerald-800 mt-1">{fmt(rawMaterialLedger.totalRemaining)}</div>
          </div>
        </div>
      )}

      {/* 6. EMPLOYEE KPIS */}
      {activeTab === 'EMPLOYEE' && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="card p-3 bg-gray-50 border-gray-200">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Pehle Ka Khara Advance</span>
            <div className="text-lg font-bold font-mono text-gray-900 mt-1">Rs. {fmt(employeeLedger.opening)}</div>
          </div>
          <div className="card p-3 bg-rose-50 border-rose-200">
            <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Kul Diya Gaya Advance (+)</span>
            <div className="text-lg font-bold font-mono text-rose-800 mt-1">Rs. {fmt(employeeLedger.totalGiven)}</div>
          </div>
          <div className="card p-3 bg-emerald-50 border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Kul Kata / Wapis Aaya (-)</span>
            <div className="text-lg font-bold font-mono text-emerald-800 mt-1">Rs. {fmt(employeeLedger.totalDeducted)}</div>
          </div>
          <div className="card p-3 bg-orange-50 border-orange-200">
            <span className="text-[10px] text-orange-700 font-bold uppercase tracking-wider">Net Baqi Staff Advance</span>
            <div className="text-xl font-bold font-mono text-orange-800 mt-1">Rs. {fmt(employeeLedger.netAdvance)}</div>
          </div>
          <div className="card p-3 bg-blue-50 border-blue-200">
            <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider">Ada Shuda Tankhwah</span>
            <div className="text-xl font-bold font-mono text-blue-800 mt-1">Rs. {fmt(employeeLedger.totalSalaryPaid || 0)}</div>
          </div>
        </div>
      )}

      {/* ── Main Transaction Ledger Table ── */}
      <div className="card overflow-hidden">
        <div className="card-header flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-brand-600" />
            <h3 className="section-title">
              {activeEntityName} — Mukammal Statement
            </h3>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Filter statement rows..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="form-input pl-8 py-1 text-xs w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          {/* 1. CUSTOMER TABLE */}
          {activeTab === 'CUSTOMER' && (
            <table className="table-base">
              <thead className="table-head sticky top-0">
                <tr>
                  <th className="table-th">Taareekh (Date)</th>
                  <th className="table-th">Qisam (Type)</th>
                  <th className="table-th">Bill / Voucher #</th>
                  <th className="table-th">Tafseel (Description)</th>
                  <th className="table-th">Payment Terms</th>
                  <th className="table-th text-right text-brand-700">Debit (+ Bill)</th>
                  <th className="table-th text-right text-emerald-700">Credit (- Wasool)</th>
                  <th className="table-th text-right text-rose-700">Baqi Lena (Balance)</th>
                </tr>
              </thead>
              <tbody>
                {customerLedger.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-td text-center text-gray-400 italic py-10">
                      Is grahak ka is date range mein koi transaction nahi mila.
                    </td>
                  </tr>
                ) : (
                  customerLedger.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-td text-gray-600 text-xs">{fmtDate(r.date)}</td>
                      <td className="table-td">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.type === 'SALE_INVOICE'
                              ? 'bg-brand-50 text-brand-800'
                              : r.type === 'PAYMENT_VOUCHER'
                                ? 'bg-rose-50 text-rose-800'
                                : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {r.type === 'SALE_INVOICE' ? '📄 Sale Bill' : r.type === 'PAYMENT_VOUCHER' ? '💸 Adaigi (Payment/Refund)' : '💵 Wasooli (Receipt)'}
                        </span>
                      </td>
                      <td className="table-td font-mono font-bold text-gray-900 text-xs">{r.refNo}</td>
                      <td className="table-td text-gray-800 text-xs max-w-sm">{r.description}</td>
                      <td className="table-td text-gray-500 text-xs">{r.paymentMethod || '—'}</td>
                      <td className="table-td text-right font-mono font-bold text-brand-700">
                        {r.debit > 0 ? `+ Rs. ${fmt(r.debit)}` : '—'}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-emerald-700">
                        {r.credit > 0 ? `- Rs. ${fmt(r.credit)}` : '—'}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-rose-700">
                        Rs. {fmt(r.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 2. DUKAN SUPPLIER TABLE */}
          {activeTab === 'TRADE_SUPPLIER' && (
            <table className="table-base">
              <thead className="table-head sticky top-0">
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Bill / Voucher #</th>
                  <th className="table-th">Tafseel (Description)</th>
                  <th className="table-th text-right text-emerald-700">Debit (- Adaigi)</th>
                  <th className="table-th text-right text-sky-700">Credit (+ Khareed Bill)</th>
                  <th className="table-th text-right text-amber-700">Baqi Dena (Payable)</th>
                </tr>
              </thead>
              <tbody>
                {tradeSupplierLedger.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-td text-center text-gray-400 italic py-10">
                      Is dukan supplier ka koi transaction nahi mila.
                    </td>
                  </tr>
                ) : (
                  tradeSupplierLedger.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-td text-gray-600 text-xs">{fmtDate(r.date)}</td>
                      <td className="table-td">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.type === 'PURCHASE_BILL' ? 'bg-sky-50 text-sky-800' : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {r.type === 'PURCHASE_BILL' ? '🛒 Khareed Bill' : '💵 Adaigi (Payment)'}
                        </span>
                      </td>
                      <td className="table-td font-mono font-bold text-gray-900 text-xs">{r.refNo}</td>
                      <td className="table-td text-gray-800 text-xs max-w-sm">{r.description}</td>
                      <td className="table-td text-right font-mono font-bold text-emerald-700">
                        {r.debit > 0 ? `- Rs. ${fmt(r.debit)}` : '—'}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-sky-700">
                        {r.credit > 0 ? `+ Rs. ${fmt(r.credit)}` : '—'}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-amber-700">
                        Rs. {fmt(r.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 3. COMMISSION SUPPLIER TABLE */}
          {activeTab === 'COMMISSION_SUPPLIER' && (
            <table className="table-base">
              <thead className="table-head sticky top-0">
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Qisam (Type)</th>
                  <th className="table-th">Ref #</th>
                  <th className="table-th">Tafseel (Maal / Farokht / Kharcha)</th>
                  <th className="table-th text-center">Qty Impact</th>
                  <th className="table-th text-right text-rose-700">Debit (Minus/Paid)</th>
                  <th className="table-th text-right text-brand-700">Credit (Supplier Haq)</th>
                  <th className="table-th text-right text-amber-700">Running Baqi Dena</th>
                </tr>
              </thead>
              <tbody>
                {commissionSupplierLedger.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-td text-center text-gray-400 italic py-10">
                      Is commission supplier ka koi record nahi mila.
                    </td>
                  </tr>
                ) : (
                  commissionSupplierLedger.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-td text-gray-600 text-xs">{fmtDate(r.date)}</td>
                      <td className="table-td">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.type === 'CONSIGNMENT_INTAKE'
                              ? 'bg-violet-100 text-violet-800'
                              : r.type === 'CONSIGNMENT_SALE'
                              ? 'bg-brand-50 text-brand-800'
                              : r.type === 'COMMISSION_EXPENSE'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {r.type === 'CONSIGNMENT_INTAKE'
                            ? '📦 Maal Aaya'
                            : r.type === 'CONSIGNMENT_SALE'
                            ? '💰 Maal Bika'
                            : r.type === 'COMMISSION_EXPENSE'
                            ? '📉 Kharcha Kata'
                            : '💵 Adaigi'}
                        </span>
                      </td>
                      <td className="table-td font-mono font-bold text-gray-900 text-xs">{r.refNo}</td>
                      <td className="table-td text-gray-800 text-xs max-w-md">{r.description}</td>
                      <td className="table-td text-center font-mono font-bold text-xs">
                        {r.qtyImpact ? (
                          <span className={r.qtyImpact.startsWith('+') ? 'text-violet-600' : 'text-amber-600'}>
                            {r.qtyImpact}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-rose-700">
                        {r.debit > 0 ? `- Rs. ${fmt(r.debit)}` : '—'}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-brand-700">
                        {r.credit > 0 ? `+ Rs. ${fmt(r.credit)}` : '—'}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-amber-700">
                        Rs. {fmt(r.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 4. PRODUCT ITEM SALES LEDGER */}
          {activeTab === 'PRODUCT' && (
            <table className="table-base">
              <thead className="table-head sticky top-0">
                <tr>
                  <th className="table-th">Farokht Taareekh</th>
                  <th className="table-th">Bill / Invoice #</th>
                  <th className="table-th">Grahak (Customer)</th>
                  <th className="table-th">Stock Type</th>
                  <th className="table-th text-right text-emerald-700">Bechi Gayi Qty</th>
                  <th className="table-th text-right">Khareed Rate / Price</th>
                  <th className="table-th text-right font-bold text-gray-900">Line Bill (Rs.)</th>
                  <th className="table-th text-right text-sky-700">Cum. Total Qty</th>
                  <th className="table-th text-right text-brand-700">Cum. Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {productLedger.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="table-td text-center text-gray-400 italic py-10">
                      Is product ka is filter ({productOwnershipFilter === 'ALL' ? 'Tamam Maal' : productOwnershipFilter === 'OWN' ? 'Apna Maal' : 'Commission Maal'}) mein koi record nahi mila.
                    </td>
                  </tr>
                ) : (
                  productLedger.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-td text-gray-600 text-xs">{fmtDate(r.date)}</td>
                      <td className="table-td font-mono font-bold text-brand-600 text-xs">{r.invoiceNumber}</td>
                      <td className="table-td font-medium text-gray-900 text-xs">
                        {r.customerName}
                        <span className="text-[10px] text-gray-400 block">{r.customerPhone}</span>
                      </td>
                      <td className="table-td">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.ownershipType === 'Amanat Maal'
                              ? 'bg-violet-100 text-violet-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {r.ownershipType}
                        </span>
                      </td>
                      <td className="table-td text-right font-mono font-bold text-emerald-700 text-sm">
                        {r.quantity} {r.unitName}
                      </td>
                      <td className="table-td text-right font-mono text-gray-700">Rs. {fmt(r.unitPrice)}</td>
                      <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {fmt(r.lineTotal)}</td>
                      <td className="table-td text-right font-mono font-bold text-sky-700">
                        {r.cumulativeQty} {r.unitName}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-brand-700">
                        Rs. {fmt(r.cumulativeTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 5. RAW MATERIAL TABLE */}
          {activeTab === 'RAW_MATERIAL' && (
            <table className="table-base">
              <thead className="table-head sticky top-0">
                <tr>
                  <th className="table-th">Intake Date</th>
                  <th className="table-th">Entry #</th>
                  <th className="table-th">Kachcha Maal / Item</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th text-right">Khareed Rate</th>
                  <th className="table-th text-right text-gray-900 font-bold">Daakhil Qty</th>
                  <th className="table-th text-right text-amber-600">Bik Chuka Qty</th>
                  <th className="table-th text-right text-brand-700 font-bold">Baqi Qty</th>
                  <th className="table-th text-right text-amber-600 font-bold">Extra Charges</th>
                  <th className="table-th text-right text-gray-900 font-bold">Kul Khareed Rs.</th>
                  <th className="table-th text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {rawMaterialLedger.rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="table-td text-center text-gray-400 italic py-10">
                      Koi raw material record nahi mila.
                    </td>
                  </tr>
                ) : (
                  rawMaterialLedger.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-td text-gray-600 text-xs">{fmtDate(r.date)}</td>
                      <td className="table-td font-mono font-bold text-brand-600 text-xs">{r.entryNumber}</td>
                      <td className="table-td font-bold text-gray-900 text-xs">{r.itemName}</td>
                      <td className="table-td text-gray-700 text-xs">{r.supplierName}</td>
                      <td className="table-td text-right font-mono text-gray-700">Rs. {fmt(r.unitCost)}</td>
                      <td className="table-td text-right font-mono font-bold text-gray-900">
                        {r.enteredQuantity} {r.unitName}
                      </td>
                      <td className="table-td text-right font-mono text-amber-600">{r.soldQuantity}</td>
                      <td className="table-td text-right font-mono font-bold text-brand-700">
                        {r.remainingQuantity} {r.unitName}
                      </td>
                      <td className="table-td text-right font-mono text-amber-700 text-xs">
                        {r.extraCharges > 0 ? (
                          <span className="font-semibold text-amber-600">
                            +Rs. {fmt(r.extraCharges)}
                            {r.extraNote ? ` (${r.extraNote})` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {fmt(r.totalCost)}</td>
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
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 6. EMPLOYEE ADVANCE TABLE */}
          {activeTab === 'EMPLOYEE' && (
            <table className="table-base">
              <thead className="table-head sticky top-0">
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Qisam (Type)</th>
                  <th className="table-th">Tafseel (Description / Notes)</th>
                  <th className="table-th text-right text-rose-700">Advance Diya (+ Debit)</th>
                  <th className="table-th text-right text-emerald-700">Advance Kata (- Credit)</th>
                  <th className="table-th text-right text-orange-700">Baqi Advance (Balance)</th>
                </tr>
              </thead>
              <tbody>
                {employeeLedger.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-td text-center text-gray-400 italic py-10">
                      Is mulazim ka is date range mein koi advance record nahi mila.
                    </td>
                  </tr>
                ) : (
                  employeeLedger.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-td text-gray-600 text-xs">{fmtDate(r.date)}</td>
                      <td className="table-td">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.type === 'OPENING_BALANCE'
                              ? 'bg-purple-100 text-purple-800'
                              : r.type === 'ADVANCE_GIVEN'
                                ? 'bg-rose-100 text-rose-800'
                                : r.type === 'SALARY_PAID'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {r.type === 'OPENING_BALANCE'
                            ? '📌 Pehle Ka Advance (Opening)'
                            : r.type === 'ADVANCE_GIVEN'
                              ? '➕ Advance Diya'
                              : r.type === 'SALARY_PAID'
                                ? '💵 Tankhwah (Salary Paid)'
                                : '➖ Advance Wapis / Kata'}
                        </span>
                      </td>
                      <td className="table-td text-gray-800 text-xs">{r.description}</td>
                      <td className="table-td text-right font-mono font-bold text-rose-700">
                        {r.debit > 0 ? (
                          `+ Rs. ${fmt(r.debit)}`
                        ) : r.type === 'SALARY_PAID' ? (
                          <span className="text-blue-700 text-xs">Rs. {fmt(r.salaryAmount || 0)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-emerald-700">
                        {r.credit > 0 ? `- Rs. ${fmt(r.credit)}` : '—'}
                      </td>
                      <td className="table-td text-right font-mono font-bold text-orange-700">
                        Rs. {fmt(r.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
