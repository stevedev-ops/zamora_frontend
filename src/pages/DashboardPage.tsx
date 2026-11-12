import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  DollarSign,
  PackagePlus,
  Pencil,
  PlusCircle,
  Scale,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { ExportButtons } from '../components/common/ExportButtons';
import { EditSaleModal } from '../components/sales/EditSaleModal';
import { formatDateTime, formatKsh } from '../utils/format';

interface DashboardResponse {
  kpis: {
    closingDateLabel?: string;
    totalSalesToday: number;
    salesCountToday: number;
    cashSalesToday?: number;
    mpesaSalesToday?: number;
    debtSalesToday?: number;
    debtRepaymentsCashToday?: number;
    debtRepaymentsMpesaToday?: number;
    debtRepaymentsTotalToday?: number;
    totalSalesThisMonth: number;
    salesCountThisMonth: number;
    totalPurchasesThisMonth: number;
    totalPurchasesAllTime: number;
    grossProfitToday: number;
    grossProfitThisMonth: number;
    totalOutstandingDebt: number;
    paymentsReceivedToday: number;
    paymentsReceivedThisMonth: number;
    totalPaymentsReceived: number;
    activeCustomersCount: number;
    customersWithDebtCount: number;
    totalStockValueAtCost: number;
    lowStockCount: number;
  };
  lowStockProducts: Array<{
    id: string;
    name: string;
    brand: string;
    bottleSize: string;
    categoryName: string;
    currentStock: number;
    minStockAlert: number;
  }>;
  recentSales: Array<{
    id: string;
    receiptNumber: string;
    customerName: string;
    paymentMethod: string;
    totalAmount: number;
    amountPaid: number;
    outstandingAmount: number;
    grossProfit: number;
    itemCount: number;
    soldAt: string;
  }>;
  recentPayments: Array<{
    id: string;
    referenceNumber: string;
    customerName: string;
    paymentType: string;
    method: string;
    amount: number;
    paidAt: string;
  }>;
  recentDebtTransactions: Array<{
    id: string;
    referenceNumber: string;
    customerId: string;
    customerName: string;
    transactionType: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    runningBalance: number;
    description: string;
    createdAt: string;
  }>;
  chart: {
    period: 'daily' | 'weekly' | 'monthly';
    series: Array<{
      label: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      cashCollected: number;
      creditSales: number;
    }>;
  };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const res = await api.get<DashboardResponse>(
        `/dashboard?period=${period}&tzOffsetMinutes=${tzOffsetMinutes}`
      );
      setData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, showToast]);

  useEffect(() => {
    load();
    const handleSynced = () => {
      void load();
    };
    window.addEventListener('zamora:synced', handleSynced);
    return () => window.removeEventListener('zamora:synced', handleSynced);
  }, [load]);

  if (loading && !data) return <LoadingState label="Loading store overview..." />;
  if (!data) return null;

  const { kpis } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Store Overview</h1>
          <p className="text-sm text-slate-500">
            Real-time sales, profit, inventory valuation, and customer debt metrics
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/pos')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            New Sale
          </button>
          <button
            onClick={() => navigate('/products?action=new')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Product
          </button>
          <button
            onClick={() => navigate('/customers?action=new')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Customer
          </button>
          <button
            onClick={() => navigate('/debt?action=payment')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Wallet className="h-3.5 w-3.5" />
            Record Payment
          </button>
          <button
            onClick={() => navigate('/debt')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Scale className="h-3.5 w-3.5" />
            Manage Debt
          </button>
          <button
            onClick={() => navigate('/reports')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            View Reports
          </button>
        </div>
      </div>

      {/* Today's Closing Breakdown (Cash vs M-Pesa vs Debt) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Today&apos;s Closing Breakdown{' '}
              {kpis.closingDateLabel ? `(${kpis.closingDateLabel})` : ''}
            </h2>
            <p className="text-xs text-slate-500">
              Total Sold: <strong className="text-slate-900">{formatKsh(kpis.totalSalesToday)}</strong> across{' '}
              {kpis.salesCountToday} sale(s) · Split across Cash, M-Pesa, and Debt
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/reports?tab=closing')}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Full Closing Summary
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-emerald-800">Cash Sales Today</p>
            <p className="text-lg font-bold tabular-nums text-emerald-950">
              {formatKsh(kpis.cashSalesToday ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-sky-800">M-Pesa Sales Today</p>
            <p className="text-lg font-bold tabular-nums text-sky-950">
              {formatKsh(kpis.mpesaSalesToday ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-rose-800">Debt Sales Today</p>
            <p className="text-lg font-bold tabular-nums text-rose-950">
              {formatKsh(kpis.debtSalesToday ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-slate-600">
              Debt Repayments Today
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-900">
              {formatKsh(kpis.debtRepaymentsTotalToday ?? 0)}
            </p>
            <p className="text-[11px] text-slate-500">
              Cash {formatKsh(kpis.debtRepaymentsCashToday ?? 0)} · M-Pesa{' '}
              {formatKsh(kpis.debtRepaymentsMpesaToday ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Sales Today"
          value={formatKsh(kpis.totalSalesToday)}
          subtitle={`${kpis.salesCountToday} sale(s) today`}
          icon={ShoppingCart}
          tone="navy"
        />
        <StatCard
          title="Sales This Month"
          value={formatKsh(kpis.totalSalesThisMonth)}
          subtitle={`${kpis.salesCountThisMonth} sale(s) this month`}
          icon={DollarSign}
        />
        <StatCard
          title="Gross Profit Today"
          value={formatKsh(kpis.grossProfitToday)}
          subtitle={`This month: ${formatKsh(kpis.grossProfitThisMonth)}`}
          icon={TrendingUp}
          tone="emerald"
        />
        <StatCard
          title="Outstanding Customer Debt"
          value={formatKsh(kpis.totalOutstandingDebt)}
          subtitle={`${kpis.customersWithDebtCount} customer(s) with balance`}
          icon={Scale}
          tone={kpis.totalOutstandingDebt > 0 ? 'rose' : 'emerald'}
        />
        <StatCard
          title="Payments Received"
          value={formatKsh(kpis.totalPaymentsReceived)}
          subtitle={`Today: ${formatKsh(kpis.paymentsReceivedToday)} · Month: ${formatKsh(
            kpis.paymentsReceivedThisMonth
          )}`}
          icon={Wallet}
          tone="emerald"
        />
        <StatCard
          title="Stock Purchases (Month)"
          value={formatKsh(kpis.totalPurchasesThisMonth)}
          subtitle={`All time: ${formatKsh(kpis.totalPurchasesAllTime)}`}
          icon={PackagePlus}
        />
        <StatCard
          title="Stock Value at Cost"
          value={formatKsh(kpis.totalStockValueAtCost)}
          subtitle={`${kpis.lowStockCount} low-stock item(s)`}
          icon={Boxes}
          tone={kpis.lowStockCount > 0 ? 'amber' : 'default'}
        />
        <StatCard
          title="Active Customers"
          value={String(kpis.activeCustomersCount)}
          subtitle={`${kpis.customersWithDebtCount} currently owe debt`}
          icon={Users}
        />
      </div>

      {/* Sales & Gross Profit Chart + Low Stock Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Sales & Gross Profit Trend</h2>
              <p className="text-xs text-slate-500">Revenue vs FIFO Gross Profit</p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                    period === p
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chart.series}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f172a" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val: number) => formatKsh(val)}
                  contentStyle={{ borderRadius: '8px', borderColor: '#cbd5e1', fontSize: '12px' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#0f172a"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#revGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="grossProfit"
                  name="Gross Profit"
                  stroke="#059669"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#profGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock Products */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">Low-Stock Alerts</h2>
            </div>
            <div className="flex items-center gap-2">
              <ExportButtons
                compact
                filenameBase="zamora-low-stock"
                pdfPath="/inventory/export/pdf?lowStockOnly=true"
                excelPath="/inventory/export/excel?lowStockOnly=true"
                csvPath="/inventory/export/csv?lowStockOnly=true"
                localCsv={{
                  columns: [
                    { header: 'Product', value: (r) => r.name },
                    { header: 'Size', value: (r) => r.bottleSize },
                    { header: 'Category', value: (r) => r.categoryName },
                    { header: 'Current Stock', value: (r) => r.currentStock },
                    { header: 'Min Alert', value: (r) => r.minStockAlert },
                  ],
                  rows: data.lowStockProducts,
                }}
              />
              <button
                onClick={() => navigate('/inventory')}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
              >
                Inventory <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
          {data.lowStockProducts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 py-8">
              All products are above their minimum stock threshold.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-72">
              {data.lowStockProducts.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.bottleSize} · {item.categoryName}
                    </p>
                  </div>
                  <StatusBadge
                    label={`${item.currentStock} / ${item.minStockAlert}`}
                    variant={item.currentStock === 0 ? 'rose' : 'amber'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Sales, Payments & Debt Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">Recent Sales</h2>
            <div className="flex items-center gap-2">
              <ExportButtons
                compact
                filenameBase="zamora-sales"
                pdfPath="/sales/export/pdf"
                excelPath="/sales/export/excel"
                csvPath="/sales/export/csv"
                localCsv={{
                  columns: [
                    { header: 'Receipt #', value: (r) => r.receiptNumber },
                    { header: 'Date', value: (r) => r.soldAt },
                    { header: 'Customer', value: (r) => r.customerName },
                    { header: 'Method', value: (r) => r.paymentMethod },
                    { header: 'Total (KSh)', value: (r) => r.totalAmount },
                    { header: 'Paid (KSh)', value: (r) => r.amountPaid },
                    { header: 'Debt (KSh)', value: (r) => r.outstandingAmount },
                  ],
                  rows: data.recentSales,
                }}
              />
              <button
                onClick={() => navigate('/pos')}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Open POS
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentSales.length === 0 && (
              <p className="text-xs text-slate-500 py-6 text-center">No sales recorded yet.</p>
            )}
            {data.recentSales.map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {s.receiptNumber} · {s.customerName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.paymentMethod} · {s.itemCount} item(s) · {formatDateTime(s.soldAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="font-bold tabular-nums text-slate-900">
                      {formatKsh(s.totalAmount)}
                    </p>
                    {s.outstandingAmount > 0 && (
                      <p className="text-[11px] font-semibold text-rose-600 tabular-nums">
                        Debt +{formatKsh(s.outstandingAmount)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingSaleId(s.id)}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                    title="Edit or remove drinks on this receipt"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">Recent Payments</h2>
            <div className="flex items-center gap-2">
              <ExportButtons
                compact
                filenameBase="zamora-recent-payments"
                localCsv={{
                  columns: [
                    { header: 'Ref #', value: (r) => r.referenceNumber },
                    { header: 'Customer', value: (r) => r.customerName },
                    { header: 'Type', value: (r) => r.paymentType },
                    { header: 'Method', value: (r) => r.method },
                    { header: 'Amount (KSh)', value: (r) => r.amount },
                    { header: 'Paid At', value: (r) => r.paidAt },
                  ],
                  rows: data.recentPayments,
                }}
              />
              <button
                onClick={() => navigate('/debt')}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Record Payment
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentPayments.length === 0 && (
              <p className="text-xs text-slate-500 py-6 text-center">No payments recorded yet.</p>
            )}
            {data.recentPayments.map((p) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {p.referenceNumber} · {p.customerName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.method} · {p.paymentType === 'DEBT_REPAYMENT' ? 'Repayment' : 'POS'} ·{' '}
                    {formatDateTime(p.paidAt)}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-emerald-700 shrink-0">
                  +{formatKsh(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Debt Ledger Transactions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">Recent Debt Activity</h2>
            <div className="flex items-center gap-2">
              <ExportButtons
                compact
                filenameBase="zamora-debt-ledger"
                pdfPath="/debt/transactions/export/pdf"
                excelPath="/debt/transactions/export/excel"
                csvPath="/debt/transactions/export/csv"
                localCsv={{
                  columns: [
                    { header: 'Date', value: (r) => r.createdAt },
                    { header: 'Ref #', value: (r) => r.referenceNumber },
                    { header: 'Customer', value: (r) => r.customerName },
                    { header: 'Type', value: (r) => r.transactionType },
                    { header: 'Direction', value: (r) => r.direction },
                    { header: 'Description', value: (r) => r.description },
                    { header: 'Amount (KSh)', value: (r) => r.amount },
                    { header: 'Running Balance (KSh)', value: (r) => r.runningBalance },
                  ],
                  rows: data.recentDebtTransactions,
                }}
              />
              <button
                onClick={() => navigate('/debt')}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Full Ledger
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentDebtTransactions.length === 0 && (
              <p className="text-xs text-slate-500 py-6 text-center">No debt activity yet.</p>
            )}
            {data.recentDebtTransactions.map((t) => (
              <div key={t.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {t.customerName} · {t.transactionType}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{t.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`font-bold tabular-nums ${
                      t.direction === 'DEBIT' ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {t.direction === 'DEBIT' ? '+' : '-'}
                    {formatKsh(t.amount)}
                  </span>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Bal: {formatKsh(t.runningBalance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <EditSaleModal
        open={editingSaleId !== null}
        saleId={editingSaleId}
        onClose={() => setEditingSaleId(null)}
        onSuccess={load}
      />
    </div>
  );
}

