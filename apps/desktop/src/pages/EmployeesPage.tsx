import React, { useEffect, useState } from 'react';
import {
  UserCheck,
  ShieldAlert,
  Phone,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  X,
  User,
  Coins,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  FileText
} from 'lucide-react';
import { api } from '../api/client.js';

interface EmployeeAdvanceItem {
  id: string;
  date: string;
  amount: string;
  type: 'GIVEN' | 'DEDUCTED';
  notes?: string;
}

interface EmployeeSalaryPayment {
  id: number;
  voucherNumber: string;
  date: string;
  amount: string;
  narration?: string;
}

interface Employee {
  id: number;
  name: string;
  phone: string;
  address?: string;
  jobTitle: string;
  salary: string;
  joiningDate: string;
  openingBalance?: string;
  currentAdvance?: string;
  advances?: EmployeeAdvanceItem[];
  notes?: string;
  totalSalaryPaid?: string;
  lastSalaryPaidDate?: string | null;
  lastSalaryPaidAmount?: string | null;
  salaryPayments?: EmployeeSalaryPayment[];
}

interface CashAccount {
  id: number;
  accountName: string;
  accountType: string;
  currentBalance: string;
}

export const EmployeesPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [salary, setSalary] = useState('30000.00');
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [address, setAddress] = useState('');

  // Advance modal state
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceEmp, setAdvanceEmp] = useState<Employee | null>(null);
  const [advanceType, setAdvanceType] = useState<'GIVEN' | 'DEDUCTED'>('GIVEN');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [advanceCashAccountId, setAdvanceCashAccountId] = useState('');
  const [advanceNotes, setAdvanceNotes] = useState('');

  // History modal state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyEmp, setHistoryEmp] = useState<Employee | null>(null);

  const loadData = async () => {
    try {
      const [empData, accData] = await Promise.all([
        api.get<Employee[]>('/parties/employees'),
        api.get<CashAccount[]>('/vouchers/accounts').catch(() => [] as CashAccount[]),
      ]);
      setEmployees(empData);
      setCashAccounts(accData);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setJobTitle('');
    setSalary('30000.00');
    setOpeningBalance('0.00');
    setJoiningDate(new Date().toISOString().split('T')[0]);
    setAddress('');
  };

  const handleEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setName(emp.name);
    setPhone(emp.phone);
    setJobTitle(emp.jobTitle);
    setSalary(emp.salary);
    setOpeningBalance(emp.openingBalance || '0.00');
    setJoiningDate(emp.joiningDate ? emp.joiningDate.split('T')[0] : new Date().toISOString().split('T')[0]);
    setAddress(emp.address || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (emp: Employee) => {
    if (!window.confirm(`Delete employee "${emp.name}"?`)) return;
    try {
      setLoading(true);
      await api.delete(`/parties/employees/${emp.id}`);
      setStatusMsg(`Employee ${emp.name} deleted.`);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const payload = {
        name,
        phone,
        jobTitle,
        salary,
        openingBalance,
        joiningDate,
        address
      };
      if (editingId) {
        await api.put(`/parties/employees/${editingId}`, payload);
        setStatusMsg(`${name} updated.`);
      } else {
        await api.post('/parties/employees', payload);
        setStatusMsg(`${name} registered.`);
      }
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  // Open Advance Modal
  const openAdvanceModal = (emp: Employee, defaultType: 'GIVEN' | 'DEDUCTED' = 'GIVEN') => {
    setAdvanceEmp(emp);
    setAdvanceType(defaultType);
    setAdvanceAmount('');
    setAdvanceDate(new Date().toISOString().split('T')[0]);
    setAdvanceCashAccountId(cashAccounts.length > 0 ? String(cashAccounts[0].id) : '');
    setAdvanceNotes('');
    setIsAdvanceModalOpen(true);
  };

  // Submit Advance / Deduction
  const handleAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceEmp) return;
    if (!advanceAmount || parseFloat(advanceAmount) <= 0) {
      alert('Barahe karam durust raqam likhein.');
      return;
    }
    setLoading(true);
    setStatusMsg(null);
    try {
      await api.post(`/parties/employees/${advanceEmp.id}/advance`, {
        date: advanceDate,
        amount: advanceAmount,
        type: advanceType,
        cashBankAccountId: advanceCashAccountId ? Number(advanceCashAccountId) : undefined,
        notes: advanceNotes,
      });
      setStatusMsg(
        advanceType === 'GIVEN'
          ? `Rs. ${advanceAmount} advance ${advanceEmp.name} ko diya gaya.`
          : `Rs. ${advanceAmount} advance ${advanceEmp.name} se wapas / deduct hua.`
      );
      setIsAdvanceModalOpen(false);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Advance save failed');
    } finally {
      setLoading(false);
    }
  };

  // Open History Modal
  const openHistoryModal = (emp: Employee) => {
    setHistoryEmp(emp);
    setIsHistoryModalOpen(true);
  };

  // Delete an advance entry
  const handleDeleteAdvance = async (empId: number, advanceId: string) => {
    if (!window.confirm('Kya aap yeh advance record delete karna chahte hain?')) return;
    try {
      setLoading(true);
      await api.delete(`/parties/employees/${empId}/advance/${advanceId}`);
      setStatusMsg('Advance record deleted.');
      const updated = await api.get<Employee[]>('/parties/employees');
      setEmployees(updated);
      const found = updated.find((x) => x.id === empId);
      if (found) setHistoryEmp(found);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const totalPayroll = employees.reduce((a, e) => a + parseFloat(e.salary || '0'), 0);
  const totalPaidSalary = employees.reduce((a, e) => a + parseFloat(e.totalSalaryPaid || '0'), 0);
  const totalAdvances = employees.reduce((a, e) => a + parseFloat(e.currentAdvance || '0'), 0);

  return (
    <div className="page-wrapper">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            <UserCheck className="w-5 h-5 text-brand-600" /> Employee &amp; Staff Registry
          </h1>
          <p className="page-subtitle">
            Mulazmeen ka record, Mahana Tankhwah aur Advance Hisaab Kitaab
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Naya Mulazim Add Karein
        </button>
      </div>

      <div className="alert-warning">
        <ShieldAlert className="w-4 h-4 flex-shrink-0" />
        <span>
          Mulazmeen ke accounts sirf tankhwah aur staff advance ke record ke liye hain. System login credentials ke liye nahi.
        </span>
      </div>

      {statusMsg && (
        <div className="alert-success">
          <CheckCircle className="w-4 h-4" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card p-3">
          <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Kul Mulazmeen</span>
          <div className="text-xl font-bold text-brand-600 mt-1">{employees.length}</div>
        </div>
        <div className="card p-3">
          <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Monthly Payroll (Package)</span>
          <div className="text-lg font-bold font-mono text-amber-600 mt-1">Rs. {totalPayroll.toFixed(2)}</div>
        </div>
        <div className="card p-3 bg-emerald-50/50 border-emerald-200">
          <span className="text-[10px] text-emerald-700 uppercase font-bold tracking-wide">Kul Ada Shuda Tankhwah</span>
          <div className="text-lg font-bold font-mono text-emerald-800 mt-1">Rs. {totalPaidSalary.toFixed(2)}</div>
        </div>
        <div className="card p-3 bg-rose-50/50 border-rose-200">
          <span className="text-[10px] text-rose-700 uppercase font-bold tracking-wide">Kul Staff Advance (Khara)</span>
          <div className="text-lg font-bold font-mono text-rose-700 mt-1">Rs. {totalAdvances.toFixed(2)}</div>
        </div>
        <div className="card p-3">
          <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Faal Mulazmeen (Active)</span>
          <div className="text-xl font-bold text-sky-600 mt-1">{employees.length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead className="table-head">
            <tr>
              <th className="table-th">Employee Name</th>
              <th className="table-th">Role / Job Title</th>
              <th className="table-th">Contact</th>
              <th className="table-th text-right">Package (Monthly)</th>
              <th className="table-th text-right text-emerald-700">Ada Shuda Tankhwah</th>
              <th className="table-th text-right">Opening Bal</th>
              <th className="table-th text-right">Baqi Advance</th>
              <th className="table-th text-center w-52">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-td text-center text-gray-400 italic py-10">
                  Abhi koi mulazim register nahi hai. Naya mulazim add karne ke liye upar button dabayein.
                </td>
              </tr>
            ) : (
              employees.map((emp) => {
                const adv = parseFloat(emp.currentAdvance || '0');
                const op = parseFloat(emp.openingBalance || '0');
                const paidSalary = parseFloat(emp.totalSalaryPaid || '0');
                return (
                  <tr key={emp.id} className="table-row">
                    <td className="table-td font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-xs">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{emp.name}</span>
                      </div>
                    </td>
                    <td className="table-td">
                      <span className="badge-blue">{emp.jobTitle}</span>
                    </td>
                    <td className="table-td text-gray-500">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {emp.phone}
                      </div>
                    </td>
                    <td className="table-td text-right font-mono font-bold text-gray-900">
                      Rs. {emp.salary}
                    </td>
                    <td className="table-td text-right font-mono font-bold">
                      {paidSalary > 0 ? (
                        <div>
                          <span className="px-2 py-0.5 rounded-md text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                            Rs. {emp.totalSalaryPaid}
                          </span>
                          {emp.lastSalaryPaidDate && (
                            <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                              Ada: {emp.lastSalaryPaidDate}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Rs. 0.00</span>
                      )}
                    </td>
                    <td className="table-td text-right font-mono text-gray-600 text-xs">
                      Rs. {op.toFixed(2)}
                    </td>
                    <td className="table-td text-right font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded-md text-xs ${adv > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'text-gray-500'}`}>
                        Rs. {adv.toFixed(2)}
                      </span>
                    </td>
                    <td className="table-td text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openAdvanceModal(emp, 'GIVEN')}
                          className="px-2 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1"
                          title="Advance do ya katauti darj karein"
                        >
                          <Coins className="w-3 h-3" /> Advance
                        </button>
                        <button
                          type="button"
                          onClick={() => openHistoryModal(emp)}
                          className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                          title="Advance History / Tafseel Dekhein"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(emp)}
                          className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                          title="Edit Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(emp)}
                          disabled={loading}
                          className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-rose-600 transition-colors"
                          title="Delete Mulazim"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg card overflow-hidden animate-fade-in shadow-xl">
            <div className="card-header flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">
                  {editingId ? 'Mulazim Ki Tafseel Edit Karein' : 'Naya Mulazim Shamil Karein'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="btn-ghost p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Mulazim Ka Naam *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Muhammad Ali"
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="03001234567"
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Job Title / Ohda *</label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Munshi, Helper, Driver"
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Mahana Tankhwah (Rs.) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    className="form-input font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">
                    Opening Balance / Pehle Ka Advance (Rs.)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className="form-input font-mono text-xs"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Purana khara advance agar koi ho</p>
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-gray-700">Joining Date</label>
                  <input
                    type="date"
                    required
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <label className="form-label text-xs font-semibold text-gray-700">Address (Pata) - Optional</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rehaish / Shehar"
                    className="form-input text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex-1 justify-center"
                >
                  {loading ? 'Saving…' : editingId ? 'Update Karein' : 'Save Karein'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advance Modal: Advance Do / Katauti */}
      {isAdvanceModalOpen && advanceEmp && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md card overflow-hidden animate-fade-in shadow-xl">
            <div className="card-header flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Advance Hisaab: {advanceEmp.name}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Mojooda Baqi Advance: <strong className="text-rose-600">Rs. {advanceEmp.currentAdvance || '0.00'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="btn-ghost p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdvanceSubmit} className="p-5 space-y-4">
              {/* Type Switch: GIVEN vs DEDUCTED */}
              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Advance Ki Noiyat</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setAdvanceType('GIVEN')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      advanceType === 'GIVEN'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-600" />
                    <span>Advance Diya (Cash Out)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvanceType('DEDUCTED')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      advanceType === 'DEDUCTED'
                        ? 'bg-green-50 border-green-300 text-green-700 shadow-xs'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4 text-green-600" />
                    <span>Katauti / Wapsi Aaya</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Raqam (Rs.) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 5000"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="form-input font-mono text-base font-bold"
                />
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Tareekh (Date) *</label>
                <input
                  type="date"
                  required
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="form-input text-xs"
                />
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-gray-700">
                  Cash / Bank Register (Optional)
                </label>
                <select
                  value={advanceCashAccountId}
                  onChange={(e) => setAdvanceCashAccountId(e.target.value)}
                  className="form-select text-xs mt-1"
                >
                  <option value="">— Sirf Mulazim ke Khate me darj karein (No Cash deduction) —</option>
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountName} ({a.accountType}) — Rs. {a.currentBalance}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {advanceType === 'GIVEN'
                    ? 'Agar register select karenge to cash se raqam nikal jayegi.'
                    : 'Agar register select karenge to cash me raqam jama ho jayegi.'}
                </p>
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-gray-700">Tafseel / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Ghar ke zaroorat ke liye advance, salary se katauti"
                  value={advanceNotes}
                  onChange={(e) => setAdvanceNotes(e.target.value)}
                  className="form-input text-xs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`btn-primary flex-1 justify-center ${advanceType === 'GIVEN' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {loading ? 'Saving…' : advanceType === 'GIVEN' ? 'Advance Save Karein' : 'Katauti Save Karein'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advance History / Tafseel Modal */}
      {isHistoryModalOpen && historyEmp && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl card overflow-hidden animate-fade-in shadow-xl max-h-[85vh] flex flex-col">
            <div className="card-header flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {historyEmp.name} - Advance History &amp; Hisaab
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Role: {historyEmp.jobTitle} | Tankhwah: Rs. {historyEmp.salary}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="btn-ghost p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
                <div>
                  <span className="text-gray-500">Opening Balance:</span>
                  <div className="font-mono font-bold text-sm text-gray-800">
                    Rs. {parseFloat(historyEmp.openingBalance || '0').toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Kul Advance Diya:</span>
                  <div className="font-mono font-bold text-sm text-rose-600">
                    Rs. {((historyEmp.advances || [])
                      .filter((a) => a.type === 'GIVEN')
                      .reduce((sum, a) => sum + parseFloat(a.amount || '0'), 0)).toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Mojooda Baqi Advance:</span>
                  <div className="font-mono font-bold text-sm text-brand-700">
                    Rs. {parseFloat(historyEmp.currentAdvance || '0').toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs font-bold text-gray-700">Tamam Advance &amp; Katauti Entries:</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsHistoryModalOpen(false);
                    openAdvanceModal(historyEmp, 'GIVEN');
                  }}
                  className="btn-primary text-xs py-1 px-2.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Naya Advance / Katauti
                </button>
              </div>

              {/* List */}
              {(!historyEmp.advances || historyEmp.advances.length === 0) ? (
                <div className="text-center py-8 text-gray-400 italic text-xs border border-dashed rounded-xl">
                  Abhi tak koi advance record darj nahi hai.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyEmp.advances.map((adv) => (
                    <div
                      key={adv.id}
                      className="p-3 rounded-xl border border-gray-200 bg-white flex items-center justify-between text-xs hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          adv.type === 'GIVEN' ? 'bg-rose-100 text-rose-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {adv.type === 'GIVEN' ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ArrowDownLeft className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">
                            {adv.type === 'GIVEN' ? 'Advance Diya' : 'Katauti / Wapsi'}
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {adv.date}
                            </span>
                            {adv.notes && (
                              <span className="text-gray-600 italic">— {adv.notes}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`font-mono font-bold text-sm ${
                          adv.type === 'GIVEN' ? 'text-rose-600' : 'text-green-600'
                        }`}>
                          {adv.type === 'GIVEN' ? '+ Rs. ' : '- Rs. '}
                          {parseFloat(adv.amount).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdvance(historyEmp.id, adv.id)}
                          className="text-gray-400 hover:text-rose-600 p-1"
                          title="Entry Delete Karein"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Paid Salaries section */}
              <div className="pt-3 border-t border-gray-200">
                <span className="text-xs font-bold text-gray-700">💵 Tankhwah Adaigi Record (Salary Payments via Voucher):</span>
                {(!historyEmp.salaryPayments || historyEmp.salaryPayments.length === 0) ? (
                  <div className="text-center py-4 text-gray-400 italic text-xs border border-dashed rounded-xl mt-2">
                    Is mulazim ko abhi tak koi salary voucher se ada nahi ki gayi.
                  </div>
                ) : (
                  <div className="space-y-2 mt-2">
                    {historyEmp.salaryPayments.map((sp) => (
                      <div
                        key={sp.id}
                        className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-700 font-bold text-xs">
                            Rs
                          </div>
                          <div>
                            <div className="font-semibold text-emerald-950 flex items-center gap-2">
                              <span>Monthly Salary Paid</span>
                              <span className="badge-blue text-[10px]">{sp.voucherNumber}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                {sp.date}
                              </span>
                              {sp.narration && (
                                <span className="text-gray-600 italic">— {sp.narration}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-sm text-emerald-700">
                          Rs. {parseFloat(sp.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="btn-secondary text-xs"
              >
                Band Karein
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
