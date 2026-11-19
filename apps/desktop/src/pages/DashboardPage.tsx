import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  ShoppingCart,
  Boxes,
  Percent,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  RefreshCw,
  Receipt,
  Calendar,
  CalendarDays,
  BarChart3,
  DollarSign,
  Package,
  Users,
  Truck,
  Clock,
} from 'lucide-react';
import { api } from '../api/client.js';

interface DashboardMetrics {
  sales: {
    today: string;
    thisWeek?: string;
    thisMonth: string;
    countToday: number;
    countWeek?: number;
    countMonth?: number;
  };
  purchases: { today: string; thisMonth: string; countToday: number };
  inventory: {
    ownStockBaseQty: string;
    ownStockValuation: string;
    consignmentStockBaseQty: string;
    totalPhysicalBaseQty: string;
  };
  receivables: { totalCustomerReceivables: string };
  payables: {
    ownPurchasesPayable: string;
    consignmentProceedsPayable: string;
    totalPayables: string;
  };
  liquidity: { cashInTill: string; bankBalance: string; totalLiquidFunds: string };
  commissionEarned: string;
  recentSales: Array<{
    id: number;
    invoiceNumber: string;
    invoiceDate: string;
    netInvoiceAmount: string;
    customer: { name: string };
  }>;
  systemStatus: {
    isServerHealthy: boolean;
    isDbConnected: boolean;
    pendingSyncEventsCount: number;
    serverTime: string;
  };
}

/* ── Stat Card variants ── */
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  sub2?: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;   // tailwind gradient classes
  textColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label, value, sub, sub2, icon: Icon, gradient, textColor = 'text-white',
}) => (
  <div className={`stat-card bg-gradient-to-br ${gradient} text-white relative`}>
    {/* faint icon watermark */}
    <Icon className="absolute right-3 top-3 w-10 h-10 opacity-20" />
    <span className="stat-card-label">{label}</span>
    <span className={`stat-card-value ${textColor}`}>{value}</span>
    {sub && <span className="stat-card-sub">{sub}</span>}
    {sub2 && <span className="text-[10px] opacity-60 -mt-1">{sub2}</span>}
  </div>
);

/* ── Period card (Today / Weekly / Monthly) ── */
interface PeriodCardProps {
  label: string;
  amount: string;
  invoices: number;
  profit?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const PeriodCard: React.FC<PeriodCardProps> = ({
  label, amount, invoices, profit, icon: Icon, accentColor,
}) => (
  <div className="card p-4 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentColor}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
    </div>
    <span className="text-2xl font-bold font-mono text-gray-900">
      {parseFloat(amount) === 0
        ? <span className="text-gray-400">0.00</span>
        : amount}
    </span>
    <span className="text-[11px] text-gray-400">
      {invoices} invoice{invoices !== 1 ? 's' : ''}
    </span>
    {profit !== undefined && (
      <span className="text-[11px] text-gray-500">
        Profit:&nbsp;
        <span className={parseFloat(profit) >= 0 ? 'text-brand-400 font-semibold' : 'text-rose-400 font-semibold'}>
          {profit}
        </span>
      </span>
    )}
  </div>
);

/* ── Finance pill (Receivables / Payables / Cash / Net Worth) ── */
interface FinancePillProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  valueColor: string;
  iconBg: string;
}

const FinancePill: React.FC<FinancePillProps> = ({
  label, value, sub, icon: Icon, valueColor, iconBg,
}) => (
  <div className="card p-4 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div className="min-w-0">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{label}</span>
      <div className={`font-mono font-bold text-base ${valueColor} leading-tight truncate`}>
        {value}
      </div>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
    </div>
  </div>
);

export const DashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<DashboardMetrics>('/dashboard/metrics');
      setMetrics(data);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard metrics';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !metrics) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-gray-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
        <span>Loading live metrics…</span>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      {/* ── Title Row ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            <BarChart3 className="w-5 h-5 text-brand-400" />
            Business Dashboard
          </h1>
          <p className="page-subtitle">
            Live wholesale &amp; commodity metrics &nbsp;•&nbsp; Auto-refresh every 30 s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">
            <Clock className="w-3 h-3 inline mr-1" />
            {lastRefresh.toLocaleTimeString()}
          </span>
          <button onClick={fetchMetrics} className="btn-secondary">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {metrics && (
        <>
          {/* ════ ROW 1 — 4 Colourful KPI Cards ════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Apna Maal (Own Stock)"
              value={metrics.inventory.ownStockBaseQty}
              sub={`Rs. ${metrics.inventory.ownStockValuation} valuation`}
              sub2={`${metrics.inventory.totalPhysicalBaseQty} KG total`}
              icon={Boxes}
              gradient="from-orange-500 to-red-600"
            />
            <StatCard
              label="Amanat Maal (Consignment)"
              value={metrics.inventory.consignmentStockBaseQty}
              sub="Commission Maal (Custody)"
              sub2="Supplier owned"
              icon={Package}
              gradient="from-teal-500 to-emerald-600"
            />
            <StatCard
              label="Total Sales"
              value={`Rs. ${metrics.sales.thisMonth}`}
              sub={`${metrics.sales.countToday} invoices today`}
              sub2="0% vs last period"
              icon={TrendingUp}
              gradient="from-sky-500 to-blue-600"
            />
            <StatCard
              label="Commission Earned"
              value={`Rs. ${metrics.commissionEarned}`}
              sub="Consignment agent fee"
              sub2="Realized this period"
              icon={Percent}
              gradient="from-pink-500 to-rose-600"
            />
          </div>

          {/* ════ ROW 2 — Today / Weekly / Monthly ════ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PeriodCard
              label="Today's Sales"
              amount={metrics.sales.today}
              invoices={metrics.sales.countToday}
              profit="0.00"
              icon={Receipt}
              accentColor="bg-brand-600"
            />
            <PeriodCard
              label="Weekly Sales"
              amount={metrics.sales.thisWeek || metrics.sales.today}
              invoices={metrics.sales.countWeek ?? metrics.sales.countToday}
              profit="0.00"
              icon={CalendarDays}
              accentColor="bg-sky-600"
            />
            <PeriodCard
              label="Monthly Sales"
              amount={metrics.sales.thisMonth}
              invoices={metrics.sales.countMonth ?? metrics.sales.countToday}
              profit="0.00"
              icon={Calendar}
              accentColor="bg-violet-600"
            />
          </div>

          {/* ════ ROW 3 — 4 Finance Pills ════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <FinancePill
              label="Pending Receivables"
              value={`Rs. ${metrics.receivables.totalCustomerReceivables}`}
              sub={`Customer AR`}
              icon={Users}
              valueColor="text-rose-400"
              iconBg="bg-rose-600"
            />
            <FinancePill
              label="Payables"
              value={`Rs. ${metrics.payables.totalPayables}`}
              sub={`${metrics.payables.ownPurchasesPayable} own + ${metrics.payables.consignmentProceedsPayable} consignment`}
              icon={Truck}
              valueColor="text-amber-400"
              iconBg="bg-amber-600"
            />
            <FinancePill
              label="Cash in Hand"
              value={`Rs. ${metrics.liquidity.cashInTill}`}
              sub="Available balance"
              icon={Wallet}
              valueColor={
                parseFloat(metrics.liquidity.cashInTill) >= 0
                  ? 'text-brand-400'
                  : 'text-rose-400'
              }
              iconBg="bg-brand-600"
            />
            <FinancePill
              label="Net Worth"
              value={`Rs. ${metrics.liquidity.totalLiquidFunds}`}
              sub="Assets − Liabilities"
              icon={BarChart3}
              valueColor="text-sky-400"
              iconBg="bg-sky-600"
            />
          </div>

          {/* ════ ROW 4 — Stock breakdown + Recent Sales ════ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Stock split card */}
            <div className="card p-4 space-y-3 lg:col-span-2">
              <h3 className="section-title">
                <Boxes className="w-4 h-4 text-brand-400" />
                Stock Ownership
              </h3>
              <div className="space-y-3">
                {/* Own stock */}
                <div className="p-3 rounded-xl bg-brand-600/10 border border-brand-600/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">Own Stock (Shop Asset)</span>
                    <span className="badge-green">FIFO</span>
                  </div>
                  <div className="text-xl font-bold text-brand-400 font-mono">
                    {metrics.inventory.ownStockBaseQty}
                    <span className="text-xs text-gray-500 ml-1">KG</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Value:&nbsp;
                    <span className="text-gray-800 font-bold font-mono">
                      Rs. {metrics.inventory.ownStockValuation}
                    </span>
                  </div>
                </div>
                {/* Consignment stock */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">Consignment (Custody)</span>
                    <span className="badge-amber">Supplier</span>
                  </div>
                  <div className="text-xl font-bold text-amber-400 font-mono">
                    {metrics.inventory.consignmentStockBaseQty}
                    <span className="text-xs text-gray-500 ml-1">KG</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Zero asset recognition — proceeds payable
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Sales table */}
            <div className="card lg:col-span-3 overflow-hidden">
              <div className="card-header">
                <h3 className="section-title">
                  <Receipt className="w-4 h-4 text-brand-400" />
                  Recent Sales
                </h3>
                <span className="text-[10px] text-gray-400">Latest transactions</span>
              </div>
              <table className="table-base">
                <thead className="table-head">
                  <tr>
                    <th className="table-th">Invoice #</th>
                    <th className="table-th">Customer</th>
                    <th className="table-th">Date</th>
                    <th className="table-th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(!metrics.recentSales || metrics.recentSales.length === 0) ? (
                    <tr>
                      <td colSpan={4} className="table-td text-center text-gray-400 italic py-8">
                        No sales posted yet today.
                      </td>
                    </tr>
                  ) : (
                    metrics.recentSales.slice(0, 8).map((s) => (
                      <tr key={s.id} className="table-row">
                        <td className="table-td font-mono font-bold text-brand-400 text-[11px]">
                          {s.invoiceNumber}
                        </td>
                        <td className="table-td text-gray-800 font-medium">{s.customer?.name}</td>
                        <td className="table-td text-gray-400 text-[10px]">
                          {new Date(s.invoiceDate).toLocaleDateString()}
                        </td>
                        <td className="table-td text-right font-mono font-bold text-gray-900">
                          Rs. {s.netInvoiceAmount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ════ ROW 5 — Purchases row ════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 flex items-center gap-3 col-span-2 lg:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Today's Purchases</span>
                <div className="font-mono font-bold text-base text-gray-900 leading-tight">
                  Rs. {metrics.purchases.today}
                </div>
                <span className="text-[10px] text-gray-400">
                  {metrics.purchases.countToday} order{metrics.purchases.countToday !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3 col-span-2 lg:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Monthly Purchases</span>
                <div className="font-mono font-bold text-base text-gray-900 leading-tight">
                  Rs. {metrics.purchases.thisMonth}
                </div>
                <span className="text-[10px] text-gray-400">This month</span>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3 col-span-2 lg:col-span-2">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Bank Balance</span>
                <div className="font-mono font-bold text-base text-sky-400 leading-tight">
                  Rs. {metrics.liquidity.bankBalance}
                </div>
                <span className="text-[10px] text-gray-400">
                  Cash till: Rs. {metrics.liquidity.cashInTill}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
