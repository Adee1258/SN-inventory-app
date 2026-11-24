import React, { useEffect, useState, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  User,
  Wallet,
  Search,
  X,
} from 'lucide-react';
import { api } from '../api/client.js';
import { ConfirmModal, type ConfirmDialogState } from '../components/common/ConfirmModal.js';

interface CashAccount {
  id: number;
  accountName: string;
  accountType: string;
  currentBalance: string;
}

interface GlAccount {
  id: number;
  accountCode: string;
  accountName: string;
  category: string;
}

interface Party {
  id: number;
  name: string;
  code: string;
  currentBalanceOwn?: string;
  currentBalanceConsignment?: string;
  openingBalanceConsignment?: string;
  _count?: {
    consignmentReceipts?: number;
    commissionAgreements?: number;
    purchaseInvoices?: number;
  };
}

interface VoucherRecord {
  id: number;
  voucherNumber: string;
  voucherDate: string;
  amount: string;
  partyType: string;
  narration: string;
  cashBankAccount?: { accountName: string };
}

export const VouchersPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'receipt' | 'payment'>('receipt');
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<VoucherRecord[]>([]);
  const [recentPayments, setRecentPayments] = useState<VoucherRecord[]>([]);

  // form state
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashBankAccountId, setCashBankAccountId] = useState('');

  // receipt fields
  // Modes: 'CUSTOMER' (Khata 1020) | 'EMPLOYEE' (Khata 1030) | 'COMMISSION_SUPPLIER' (Khata 2020) | 'TRADE_SUPPLIER' (Khata 2010) | 'OTHER' (Khata 4030)
  const [receiptMode, setReceiptMode] = useState<'CUSTOMER' | 'EMPLOYEE' | 'COMMISSION_SUPPLIER' | 'TRADE_SUPPLIER' | 'OTHER'>('CUSTOMER');
  const [receiptPartyType, setReceiptPartyType] = useState<'CUSTOMER' | 'EMPLOYEE' | 'SUPPLIER' | 'OTHER'>('CUSTOMER');
  const [receiptPartyId, setReceiptPartyId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');

  // payment fields
  // Modes: 'CUSTOMER' (Khata 1020) | 'EMPLOYEE' (Khata 5050 / 1030) | 'COMMISSION_SUPPLIER' (Khata 2020) | 'TRADE_SUPPLIER' (Khata 2010) | 'OTHER' (General Expense)
  const [paymentMode, setPaymentMode] = useState<'CUSTOMER' | 'EMPLOYEE' | 'COMMISSION_SUPPLIER' | 'TRADE_SUPPLIER' | 'OTHER'>('TRADE_SUPPLIER');
  const [paymentPartyType, setPaymentPartyType] = useState<'CUSTOMER' | 'EMPLOYEE' | 'SUPPLIER' | 'OTHER'>('SUPPLIER');
  const [paymentPartyId, setPaymentPartyId] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  /* Helper to detect commission suppliers */
  const isCommSupplier = (s: Party) => {
    const c = s._count;
    return (
      (c?.consignmentReceipts ?? 0) > 0 ||
      (c?.commissionAgreements ?? 0) > 0 ||
      parseFloat(s.currentBalanceConsignment || '0') !== 0 ||
      parseFloat(s.openingBalanceConsignment || '0') !== 0
    );
  };

  /* ── Load master data ── */
  const loadData = async () => {
    try {
      const [accountsData, receiptsData, paymentsData, customersData, suppliersData, empData, glData] =
        await Promise.all([
          api.get<CashAccount[]>('/vouchers/accounts'),
          api.get<VoucherRecord[]>('/vouchers/receipts'),
          api.get<VoucherRecord[]>('/vouchers/payments'),
          api.get<Party[]>('/parties/customers'),
          api.get<Party[]>('/parties/suppliers'),
          api.get<any[]>('/parties/employees').catch(() => []),
          api.get<GlAccount[]>('/accounting/gl-accounts'),
        ]);
      setAccounts(accountsData);
      setRecentReceipts(receiptsData);
      setRecentPayments(paymentsData);
      setCustomers(customersData);
      setSuppliers(suppliersData);
      setEmployees(empData);
      setGlAccounts(glData);
      if (accountsData.length > 0 && !cashBankAccountId) {
        setCashBankAccountId(String(accountsData[0].id));
      }
      if (glData.length > 0 && !creditAccountId) {
        const gl1020 = glData.find((a) => a.accountCode === '1020');
        if (gl1020) setCreditAccountId(String(gl1020.id));
      }
      if (glData.length > 0 && !debitAccountId) {
        const gl2020 = glData.find((a) => a.accountCode === '2020');
        if (gl2020) setDebitAccountId(String(gl2020.id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { loadData(); }, []);

  /* ── Delete voucher ── */
  const handleDelete = (id: number, voucherNum: string, type: 'receipt' | 'payment') => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Voucher',
      message: `Delete and reverse voucher "${voucherNum}"?\n\nCash balance and GL entries will be reversed.`,
      confirmLabel: 'Yes, Delete Voucher',
      isDestructive: true,
      onConfirm: async () => {
        // Optimistic UI update: instantly remove from the respective list
        if (type === 'receipt') {
          setRecentReceipts((prev) => prev.filter((r) => r.id !== id));
        } else {
          setRecentPayments((prev) => prev.filter((p) => p.id !== id));
        }
        try {
          await api.delete(type === 'receipt' ? `/vouchers/receipts/${id}` : `/vouchers/payments/${id}`);
          setStatusMsg({ type: 'success', text: `Voucher ${voucherNum} reversed and deleted.` });
          loadData();
        } catch (err: unknown) {
          setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
          loadData();
        }
      },
    });
  };

  /* ── Submit voucher ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    // narration is required (min 1) by server schema — ensure non-empty
    const finalNarration = narration.trim() || (activeTab === 'receipt' ? 'Cash receipt voucher' : 'Cash payment voucher');

    try {
      if (activeTab === 'receipt') {
        if (!creditAccountId) {
          setStatusMsg({ type: 'error', text: 'Please select a Credit GL Account.' });
          return;
        }
        await api.post('/vouchers/receipts', {
          voucherDate,
          cashBankAccountId: Number(cashBankAccountId),
          amount,
          // Server enum: 'CUSTOMER' | 'SUPPLIER' | 'OTHER'
          partyType: receiptPartyType,
          partyId: (receiptPartyType === 'CUSTOMER' || receiptPartyType === 'SUPPLIER' || receiptPartyType === 'EMPLOYEE') && receiptPartyId ? Number(receiptPartyId) : null,
          creditAccountId: Number(creditAccountId),
          narration: finalNarration,
        });
        setStatusMsg({ type: 'success', text: 'Receipt voucher posted! Cash updated and journal created.' });
      } else {
        if (!debitAccountId) {
          setStatusMsg({ type: 'error', text: 'Please select a Debit GL Account.' });
          return;
        }
        await api.post('/vouchers/payments', {
          voucherDate,
          cashBankAccountId: Number(cashBankAccountId),
          amount,
          partyType: paymentPartyType,
          partyId: (paymentPartyType === 'SUPPLIER' || paymentPartyType === 'CUSTOMER' || paymentPartyType === 'EMPLOYEE') && paymentPartyId ? Number(paymentPartyId) : null,
          debitAccountId: Number(debitAccountId),
          narration: finalNarration,
        });
        setStatusMsg({ type: 'success', text: 'Payment voucher posted! Cash deducted and journal created.' });
      }

      // reset amount & narration, keep date & account
      setAmount('');
      setNarration('');
      setReceiptPartyId('');
      setPaymentPartyId('');
      loadData();
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Voucher failed' });
    } finally { setLoading(false); }
  };

  const receiptGlAccounts = glAccounts.filter((a) => ['ASSET', 'INCOME', 'LIABILITY'].includes(a.category));
  const paymentGlAccounts = glAccounts.filter((a) => ['EXPENSE', 'LIABILITY', 'ASSET'].includes(a.category));
  const displayVouchers = activeTab === 'receipt' ? recentReceipts : recentPayments;

  const [voucherSearch, setVoucherSearch] = useState('');

  const filteredVouchers = useMemo(() => {
    if (!voucherSearch.trim()) return displayVouchers;
    const q = voucherSearch.toLowerCase().trim();
    return displayVouchers.filter((v) => {
      const numMatch = (v.voucherNumber || '').toLowerCase().includes(q);
      const dateMatch = (v.voucherDate || '').includes(q);
      const narMatch = (v.narration || '').toLowerCase().includes(q);
      const amtMatch = String(v.amount || '').includes(q);
      const accMatch = (v.cashBankAccount?.accountName || '').toLowerCase().includes(q);
      return numMatch || dateMatch || narMatch || amtMatch || accMatch;
    });
  }, [displayVouchers, voucherSearch]);

  return (
    <div className="page-wrapper">

      {/* ── Header ── */}
      <div>
        <h1 className="page-title">
          <CreditCard className="w-5 h-5 text-brand-600" />
          Cash &amp; Bank Vouchers
        </h1>
        <p className="page-subtitle">
          Official cash inflows and outflows • Double-entry journal auto-posted
        </p>
      </div>

      {/* ── Status ── */}
      {statusMsg && (
        <div className={statusMsg.type === 'success' ? 'alert-success' : 'alert-error'}>
          {statusMsg.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* ── Account Balance Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${acc.accountType === 'BANK' ? 'bg-sky-600' : 'bg-brand-600'}`}>
                <Wallet className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">
                  {acc.accountType} Register
                </span>
                <div className="text-sm font-bold text-gray-800">{acc.accountName}</div>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-mono font-bold text-base ${parseFloat(acc.currentBalance) >= 0 ? 'text-brand-600' : 'text-rose-500'}`}>
                Rs. {acc.currentBalance}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── Voucher Form ── */}
        <div className="card p-5 space-y-4 lg:col-span-2">

          {/* Tab toggle */}
          <div className="tab-bar">
            <button
              type="button"
              onClick={() => setActiveTab('receipt')}
              className={`tab-btn flex items-center gap-1.5 ${activeTab === 'receipt' ? 'tab-btn-active' : 'tab-btn-inactive'}`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Receipt (Cash In)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payment')}
              className={`tab-btn flex items-center gap-1.5 ${activeTab === 'payment' ? 'bg-rose-600 text-white shadow-sm' : 'tab-btn-inactive'}`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Payment (Cash Out)
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Date */}
            <div>
              <label className="form-label">Date</label>
              <input
                type="date"
                required
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
                className="form-input"
              />
            </div>

            {/* Cash/Bank Register */}
            <div>
              <label className="form-label">Cash / Bank Register</label>
              <select
                required
                value={cashBankAccountId}
                onChange={(e) => setCashBankAccountId(e.target.value)}
                className="form-select"
              >
                <option value="">— Select register —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName} ({a.accountType}) — Rs. {a.currentBalance}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Receipt-specific ── */}
            {activeTab === 'receipt' && (
              <>
                <div>
                  <label className="form-label text-xs font-bold text-gray-700">Receipt Kis Se Aayi? (Party Switch)</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 mt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptMode('CUSTOMER');
                        setReceiptPartyType('CUSTOMER');
                        setReceiptPartyId('');
                        const gl1020 = glAccounts.find((a) => a.accountCode === '1020');
                        if (gl1020) setCreditAccountId(String(gl1020.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        receiptMode === 'CUSTOMER'
                          ? 'bg-brand-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Customer
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReceiptMode('EMPLOYEE');
                        setReceiptPartyType('EMPLOYEE');
                        setReceiptPartyId('');
                        const gl1030 = glAccounts.find((a) => a.accountCode === '1030');
                        if (gl1030) setCreditAccountId(String(gl1030.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        receiptMode === 'EMPLOYEE'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Mulazim (Advance Wapsi)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReceiptMode('COMMISSION_SUPPLIER');
                        setReceiptPartyType('SUPPLIER');
                        setReceiptPartyId('');
                        const gl2020 = glAccounts.find((a) => a.accountCode === '2020');
                        if (gl2020) setCreditAccountId(String(gl2020.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        receiptMode === 'COMMISSION_SUPPLIER'
                          ? 'bg-green-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Commission Supplier
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReceiptMode('TRADE_SUPPLIER');
                        setReceiptPartyType('SUPPLIER');
                        setReceiptPartyId('');
                        const gl2010 = glAccounts.find((a) => a.accountCode === '2010');
                        if (gl2010) setCreditAccountId(String(gl2010.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        receiptMode === 'TRADE_SUPPLIER'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Dukaan Ka Supplier
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReceiptMode('OTHER');
                        setReceiptPartyType('OTHER');
                        setReceiptPartyId('');
                        const gl4030 = glAccounts.find((a) => a.accountCode === '4030');
                        if (gl4030) setCreditAccountId(String(gl4030.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        receiptMode === 'OTHER'
                          ? 'bg-gray-800 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Other / Misc
                    </button>
                  </div>
                </div>

                {receiptMode === 'CUSTOMER' && (
                  <div>
                    <label className="form-label text-xs font-semibold text-gray-700">Customer Select Karein *</label>
                    <select
                      value={receiptPartyId}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setReceiptPartyId(cid);
                        const c = customers.find((x) => x.id === Number(cid));
                        if (c) setNarration(`Payment received from customer ${c.name}`);
                      }}
                      className="form-select mt-1"
                    >
                      <option value="">— Customer Select Karein —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code}) {c.currentBalanceOwn ? `— Balance: Rs. ${c.currentBalanceOwn}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {receiptMode === 'EMPLOYEE' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="form-label text-xs font-semibold text-gray-700">Mulazim (Staff) Select Karein *</label>
                      <span className="text-[10px] text-amber-700 font-medium">✓ Staff Advance Ki Wapsi / Jama</span>
                    </div>
                    <select
                      value={receiptPartyId}
                      onChange={(e) => {
                        const eid = e.target.value;
                        setReceiptPartyId(eid);
                        const emp = employees.find((x) => x.id === Number(eid));
                        if (emp) setNarration(`Advance payment returned / deposited by employee ${emp.name}`);
                      }}
                      className="form-select mt-1"
                    >
                      <option value="">— Mulazim Select Karein —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} {e.jobTitle ? `(${e.jobTitle})` : ''} — Baqi Advance: Rs. {e.currentAdvance || '0.00'}
                        </option>
                      ))}
                    </select>

                    {(() => {
                      const selectedEmp = employees.find((e) => e.id === Number(receiptPartyId));
                      if (!selectedEmp) return null;
                      const advVal = selectedEmp.currentAdvance || '0.00';
                      return (
                        <div className="mt-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-amber-800 font-semibold">Mulazim Ka Baqi Khara Advance: </span>
                            <span className="font-mono font-bold text-sm ml-1 text-amber-900">Rs. {advVal}</span>
                          </div>
                          {parseFloat(advVal) > 0 && (
                            <button
                              type="button"
                              onClick={() => setAmount(Math.abs(parseFloat(advVal)).toFixed(2))}
                              className="px-2.5 py-1 rounded-lg text-white font-bold text-[11px] shadow-xs cursor-pointer bg-amber-600 hover:bg-amber-700"
                            >
                              Pura Advance Wapis Bharo
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {receiptMode === 'COMMISSION_SUPPLIER' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="form-label text-xs font-semibold text-gray-700">Commission Supplier Select Karein *</label>
                      <span className="text-[10px] text-green-700 font-medium">✓ Sirf Commission walay suppliers</span>
                    </div>
                    <select
                      value={receiptPartyId}
                      onChange={(e) => {
                        const sid = e.target.value;
                        setReceiptPartyId(sid);
                        const sup = suppliers.find((s) => s.id === Number(sid));
                        if (sup) setNarration(`Received / Advance return from commission supplier ${sup.name}`);
                      }}
                      className="form-select mt-1"
                    >
                      <option value="">— Commission Supplier Select Karein —</option>
                      {(suppliers.filter(isCommSupplier).length > 0 ? suppliers.filter(isCommSupplier) : suppliers).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}) — Consignment Payable: Rs. {s.currentBalanceConsignment || '0.00'}
                        </option>
                      ))}
                    </select>

                    {(() => {
                      const selectedSup = suppliers.find((s) => s.id === Number(receiptPartyId));
                      if (!selectedSup) return null;
                      const balVal = selectedSup.currentBalanceConsignment || '0.00';
                      return (
                        <div className="mt-2 p-2.5 rounded-xl border border-green-200 bg-green-50 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-green-800 font-semibold">Commission Maal Ka Baqi Khata: </span>
                            <span className="font-mono font-bold text-sm ml-1 text-green-900">Rs. {balVal}</span>
                          </div>
                          {parseFloat(balVal) !== 0 && (
                            <button
                              type="button"
                              onClick={() => setAmount(Math.abs(parseFloat(balVal)).toFixed(2))}
                              className="px-2.5 py-1 rounded-lg text-white font-bold text-[11px] shadow-xs cursor-pointer bg-green-600 hover:bg-green-700"
                            >
                              Puri Raqam Bharo
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {receiptMode === 'TRADE_SUPPLIER' && (
                  <div>
                    <label className="form-label text-xs font-semibold text-gray-700">Dukaan Ka Supplier Select Karein *</label>
                    <select
                      value={receiptPartyId}
                      onChange={(e) => {
                        const sid = e.target.value;
                        setReceiptPartyId(sid);
                        const sup = suppliers.find((s) => s.id === Number(sid));
                        if (sup) setNarration(`Refund / payment received from trade supplier ${sup.name}`);
                      }}
                      className="form-select mt-1"
                    >
                      <option value="">— Dukaan Ka Supplier Select Karein —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}) — Dukaan Balance: Rs. {s.currentBalanceOwn || '0.00'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Credit GL Account (Khata) *</label>
                  <select
                    required
                    value={creditAccountId}
                    onChange={(e) => setCreditAccountId(e.target.value)}
                    className="form-select mt-1"
                  >
                    <option value="">— Select GL account —</option>
                    {receiptGlAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.accountCode}] {a.accountName} ({a.category})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {receiptMode === 'CUSTOMER'
                      ? '✓ Customer ke liye Khata [1020] Customer Accounts Receivable auto-select hai'
                      : receiptMode === 'EMPLOYEE'
                        ? '✓ Mulazim ke liye Khata [1030] Staff Advances & Employee Loans auto-select hai (Advance wapsi)'
                        : receiptMode === 'COMMISSION_SUPPLIER'
                          ? '✓ Commission Supplier ke liye Khata [2020] Commission Supplier Payable auto-select hai'
                          : receiptMode === 'TRADE_SUPPLIER'
                            ? '✓ Dukaan ke Supplier ke liye Khata [2010] Trade Accounts Payable auto-select hai'
                            : 'Aam aamdani ya kisi aur khate me credit darj karein'}
                  </p>
                </div>
              </>
            )}

            {/* ── Payment-specific ── */}
            {activeTab === 'payment' && (
              <>
                <div>
                  <label className="form-label text-xs font-bold text-gray-700">Payment Kisko Karni Hai? (Party Switch)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 mt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMode('CUSTOMER');
                        setPaymentPartyType('CUSTOMER');
                        setPaymentPartyId('');
                        const gl1020 = glAccounts.find((a) => a.accountCode === '1020');
                        if (gl1020) setDebitAccountId(String(gl1020.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        paymentMode === 'CUSTOMER'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Customer (Grahak)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMode('EMPLOYEE');
                        setPaymentPartyType('EMPLOYEE');
                        setPaymentPartyId('');
                        const gl5050 = glAccounts.find((a) => a.accountCode === '5050');
                        if (gl5050) setDebitAccountId(String(gl5050.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        paymentMode === 'EMPLOYEE'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Mulazim (Salary)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMode('TRADE_SUPPLIER');
                        setPaymentPartyType('SUPPLIER');
                        setPaymentPartyId('');
                        const gl2010 = glAccounts.find((a) => a.accountCode === '2010');
                        if (gl2010) setDebitAccountId(String(gl2010.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        paymentMode === 'TRADE_SUPPLIER'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Dukaan Ka Supplier
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMode('COMMISSION_SUPPLIER');
                        setPaymentPartyType('SUPPLIER');
                        setPaymentPartyId('');
                        const gl2020 = glAccounts.find((a) => a.accountCode === '2020');
                        if (gl2020) setDebitAccountId(String(gl2020.id));
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        paymentMode === 'COMMISSION_SUPPLIER'
                          ? 'bg-green-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Commission Supplier
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMode('OTHER');
                        setPaymentPartyType('OTHER');
                        setPaymentPartyId('');
                        setDebitAccountId('');
                      }}
                      className={`py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                        paymentMode === 'OTHER'
                          ? 'bg-gray-800 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Other / Misc
                    </button>
                  </div>
                </div>

                {paymentPartyType === 'CUSTOMER' && (
                  <div>
                    <label className="form-label text-xs font-semibold text-gray-700">Customer Select Karein *</label>
                    <select
                      value={paymentPartyId}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setPaymentPartyId(cid);
                        const c = customers.find((x) => x.id === Number(cid));
                        if (c) setNarration(`Payment / Refund to customer ${c.name}`);
                      }}
                      className="form-select mt-1"
                    >
                      <option value="">— Customer Select Karein —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code}) — Balance: Rs. {c.currentBalanceOwn || (c as any).currentBalance || '0.00'}
                        </option>
                      ))}
                    </select>

                    {/* Customer Balance Preview Card */}
                    {(() => {
                      const selectedCust = customers.find((c) => c.id === Number(paymentPartyId));
                      if (!selectedCust) return null;
                      const balVal = (selectedCust as any).currentBalance || selectedCust.currentBalanceOwn || '0.00';
                      return (
                        <div className="mt-2 p-2.5 rounded-xl border border-purple-200 bg-purple-50 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-purple-800 font-semibold">Customer Ka Mojooda Khata (Receivable): </span>
                            <span className="font-mono font-bold text-sm ml-1 text-purple-900">Rs. {balVal}</span>
                          </div>
                          {parseFloat(balVal) !== 0 && (
                            <button
                              type="button"
                              onClick={() => setAmount(Math.abs(parseFloat(balVal)).toFixed(2))}
                              className="px-2.5 py-1 rounded-lg text-white font-bold text-[11px] shadow-xs cursor-pointer bg-purple-600 hover:bg-purple-700"
                            >
                              Raqam Bharo
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {paymentPartyType === 'EMPLOYEE' && (
                  <div>
                    <label className="form-label text-xs font-semibold text-gray-700">Mulazim (Staff) Select Karein *</label>
                    <select
                      value={paymentPartyId}
                      onChange={(e) => {
                        const eid = e.target.value;
                        setPaymentPartyId(eid);
                        const emp = employees.find((x) => String(x.id) === String(eid));
                        if (emp) {
                          setNarration(`Monthly Salary paid to ${emp.name} (${emp.jobTitle})`);
                          if (emp.salary && parseFloat(emp.salary) > 0) {
                            setAmount(emp.salary);
                          }
                          const gl5050 = glAccounts.find((a) => a.accountCode === '5050');
                          if (gl5050) setDebitAccountId(String(gl5050.id));
                        }
                      }}
                      className="form-select mt-1"
                    >
                      <option value="">— Mulazim Select Karein —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.jobTitle}) — Tankhwah: Rs. {e.salary} | Baqi Advance: Rs. {e.currentAdvance || e.openingBalance || '0.00'}
                        </option>
                      ))}
                    </select>

                    {/* Employee Details & One-Click Buttons */}
                    {(() => {
                      const selectedEmp = employees.find((x) => String(x.id) === String(paymentPartyId));
                      if (!selectedEmp) return null;
                      const sal = selectedEmp.salary || '0.00';
                      const adv = selectedEmp.currentAdvance || selectedEmp.openingBalance || '0.00';

                      return (
                        <div className="mt-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="text-amber-800 font-semibold">Mahana Tankhwah: </span>
                            <span className="font-mono font-bold text-sm text-amber-900">Rs. {sal}</span>
                            <span className="text-gray-400 mx-2">|</span>
                            <span className="text-rose-800 font-semibold">Pehle Ka Advance: </span>
                            <span className="font-mono font-bold text-sm text-rose-900">Rs. {adv}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setAmount(sal);
                                const gl5050 = glAccounts.find((a) => a.accountCode === '5050');
                                if (gl5050) setDebitAccountId(String(gl5050.id));
                                setNarration(`Monthly Salary paid to ${selectedEmp.name} (${selectedEmp.jobTitle})`);
                              }}
                              className="px-2.5 py-1 rounded-lg text-white font-bold text-[11px] shadow-xs cursor-pointer bg-emerald-600 hover:bg-emerald-700"
                            >
                              💵 Puri Tankhwah Bharo
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const gl1030 = glAccounts.find((a) => a.accountCode === '1030');
                                if (gl1030) setDebitAccountId(String(gl1030.id));
                                setNarration(`Advance paid to ${selectedEmp.name}`);
                              }}
                              className="px-2.5 py-1 rounded-lg text-white font-bold text-[11px] shadow-xs cursor-pointer bg-amber-600 hover:bg-amber-700"
                            >
                              ➕ Naya Advance Dena Hai
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {paymentPartyType === 'SUPPLIER' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="form-label text-xs font-semibold text-gray-700">
                        {paymentMode === 'COMMISSION_SUPPLIER' ? 'Commission Supplier Chunain *' : 'Dukaan Ka Supplier Chunain *'}
                      </label>
                      {paymentMode === 'COMMISSION_SUPPLIER' && (
                        <span className="text-[10px] text-green-700 font-medium">✓ Sirf Commission walay suppliers</span>
                      )}
                    </div>
                    <select
                      value={paymentPartyId}
                      onChange={(e) => {
                        const sid = e.target.value;
                        setPaymentPartyId(sid);
                        const sup = suppliers.find((s) => s.id === Number(sid));
                        if (sup) {
                          if (paymentMode === 'COMMISSION_SUPPLIER') {
                            setNarration(`Commission settlement payment to ${sup.name}`);
                          } else {
                            setNarration(`Payment to trade supplier ${sup.name}`);
                          }
                        }
                      }}
                      className="form-select mt-1"
                    >
                      <option value="">— Supplier Select Karein —</option>
                      {(() => {
                        const commSups = suppliers.filter(isCommSupplier);
                        const listSups = paymentMode === 'COMMISSION_SUPPLIER'
                          ? (commSups.length > 0 ? commSups : suppliers)
                          : suppliers;
                        return listSups.map((s) => {
                          const bal = paymentMode === 'COMMISSION_SUPPLIER'
                            ? (s.currentBalanceConsignment || '0.00')
                            : (s.currentBalanceOwn || '0.00');
                          return (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code}) — Baqi: Rs. {bal}
                            </option>
                          );
                        });
                      })()}
                    </select>

                    {/* Balance Preview Card with Auto-Fill */}
                    {(() => {
                      const selectedSup = suppliers.find((s) => s.id === Number(paymentPartyId));
                      if (!selectedSup) return null;
                      const balVal = paymentMode === 'COMMISSION_SUPPLIER'
                        ? selectedSup.currentBalanceConsignment || '0.00'
                        : selectedSup.currentBalanceOwn || '0.00';
                      const isComm = paymentMode === 'COMMISSION_SUPPLIER';

                      return (
                        <div className={`mt-2 p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          isComm ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
                        }`}>
                          <div>
                            <span className={isComm ? 'text-green-800 font-semibold' : 'text-blue-800 font-semibold'}>
                              {isComm ? 'Commission Maal Ka Baqi Dena: ' : 'Dukaan Ka Baqi Dena: '}
                            </span>
                            <span className={`font-mono font-bold text-sm ml-1 ${isComm ? 'text-green-900' : 'text-blue-900'}`}>
                              Rs. {balVal}
                            </span>
                          </div>
                          {parseFloat(balVal) > 0 && (
                            <button
                              type="button"
                              onClick={() => setAmount(balVal)}
                              className={`px-2.5 py-1 rounded-lg text-white font-bold text-[11px] shadow-xs cursor-pointer ${
                                isComm ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              Puri Raqam Bharo
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Debit GL Account (Khata) *</label>
                  <select
                    required
                    value={debitAccountId}
                    onChange={(e) => setDebitAccountId(e.target.value)}
                    className="form-select mt-1"
                  >
                    <option value="">— Select GL account —</option>
                    {paymentGlAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.accountCode}] {a.accountName} ({a.category})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {paymentMode === 'CUSTOMER'
                      ? '✓ Customer ke liye Khata [1020] Customer Accounts Receivable auto-select hai'
                      : paymentMode === 'EMPLOYEE'
                        ? (debitAccountId && glAccounts.find((a) => String(a.id) === debitAccountId)?.accountCode === '1030'
                            ? '✓ Naye Advance ke liye Khata [1030] Staff Advances auto-select hai (Asset)'
                            : '✓ Tankhwah (Salary) ke liye Khata [5050] Staff Salaries & Wages Expense auto-select hai (Dukan Ka Kharcha)')
                        : paymentMode === 'COMMISSION_SUPPLIER'
                          ? '✓ Commission Supplier ke liye Khata [2020] Commission Supplier Payable auto-select hai'
                          : paymentMode === 'TRADE_SUPPLIER'
                            ? '✓ Dukaan ke Supplier ke liye Khata [2010] Trade Accounts Payable auto-select hai'
                            : 'Kisi aam kharche ya asset khate me debit karein'}
                  </p>
                </div>
              </>
            )}

            {/* Amount */}
            <div>
              <label className="form-label">Amount (Rs.) *</label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="form-input font-mono text-sm"
              />
            </div>

            {/* Narration — has fallback so server min(1) always satisfied */}
            <div>
              <label className="form-label">Narration / Description</label>
              <input
                type="text"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder={activeTab === 'receipt' ? 'e.g. Cash received from customer' : 'e.g. Payment to supplier'}
                className="form-input"
              />
              <p className="text-[10px] text-gray-400 mt-1">Leave blank to use default description</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg font-semibold text-sm text-white transition disabled:opacity-50 flex items-center justify-center gap-2 ${activeTab === 'receipt'
                  ? 'bg-brand-600 hover:bg-brand-500'
                  : 'bg-rose-600 hover:bg-rose-500'
                }`}
            >
              {activeTab === 'receipt'
                ? <ArrowDownLeft className="w-4 h-4" />
                : <ArrowUpRight className="w-4 h-4" />}
              {loading
                ? 'Posting…'
                : `Post ${activeTab === 'receipt' ? 'Receipt' : 'Payment'} Voucher`}
            </button>
          </form>
        </div>

        {/* ── Recent Vouchers ── */}
        <div className="card overflow-hidden lg:col-span-3">
          <div className="card-header flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="section-title">
                {activeTab === 'receipt'
                  ? <><ArrowDownLeft className="w-4 h-4 text-brand-600" /> Recent Receipts</>
                  : <><ArrowUpRight className="w-4 h-4 text-rose-500" /> Recent Payments</>}
              </h3>
              <span className="text-xs text-gray-400 font-medium">
                ({filteredVouchers.length}{filteredVouchers.length !== displayVouchers.length ? ` of ${displayVouchers.length}` : ''})
              </span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={voucherSearch}
                onChange={(e) => setVoucherSearch(e.target.value)}
                placeholder="Search voucher #, narration, amount..."
                className="form-input pl-8 pr-7 py-1 text-xs w-52"
              />
              {voucherSearch && (
                <button
                  type="button"
                  onClick={() => setVoucherSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="table-base">
              <thead className="table-head sticky top-0 z-10 bg-gray-50 shadow-xs">
                <tr>
                  <th className="table-th">Voucher #</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Narration</th>
                  <th className="table-th text-right">Amount</th>
                  <th className="table-th text-center w-14">Del</th>
                </tr>
              </thead>
              <tbody>
                {displayVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-td text-center text-gray-400 italic py-10">
                      No {activeTab === 'receipt' ? 'receipt' : 'payment'} vouchers posted yet.
                    </td>
                  </tr>
                ) : filteredVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-td text-center text-gray-400 italic py-10">
                      Koi voucher "{voucherSearch}" se match nahi hua.
                    </td>
                  </tr>
                ) : (
                  filteredVouchers.map((v) => (
                    <tr key={v.id} className="table-row">
                      <td className="table-td font-mono font-bold text-brand-600 text-xs">{v.voucherNumber}</td>
                      <td className="table-td text-gray-400 text-xs">
                        {new Date(v.voucherDate).toLocaleDateString()}
                      </td>
                      <td className="table-td text-gray-700 text-xs max-w-[200px] truncate">{v.narration}</td>
                      <td className="table-td text-right font-mono font-bold text-gray-900">Rs. {v.amount}</td>
                      <td className="table-td text-center">
                        <button
                          onClick={() => handleDelete(v.id, v.voucherNumber, activeTab)}
                          disabled={loading}
                          className="btn-ghost disabled:opacity-30"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" />
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

      {/* Confirmation Modal — avoids native window.confirm Electron input freeze */}
      <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
};
