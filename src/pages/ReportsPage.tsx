import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, downloadBinaryFile } from '../api/client';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { DailyClosingPanel } from '../components/reports/DailyClosingPanel';
import { formatDateTime, formatKsh } from '../utils/format';

interface ReportResponse {
  period: { label: string; startDate: string; endDate: string };
  profitAndLoss: {
    salesCount: number;
    subtotalSales: number;
    totalDiscounts: number;
    netSalesRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    grossMarginPercent: number;
    totalOperatingExpenses: number;
    expensesByCategory: Array<{ category: string; amount: number }>;
    netOperatingProfit: number;
    netMarginPercent: number;
    cashVsCredit: {
      posCashCollected: number;
      posMpesaCollected: number;
      posTotalCollected: number;
      creditSalesIssued: number;
      debtRepaymentsCash: number;
      debtRepaymentsMpesa: number;
      debtRepaymentsOther: number;
      totalDebtRepayments: number;
      totalActualCashCollected: number;
      totalOutstandingCustomerDebt: number;
    };
  };
  trends: Array<{
    date: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    cashCollected: number;
    creditIssued: number;
  }>;
  productProfitability: Array<{
    productId: string;
    productName: string;
    brand: string;
    bottleSize: string;
    categoryName: string;
    currentPurchasePrice: number;
    currentSellingPrice: number;
    unitsSold: number;
    totalRevenue: number;
    cogs: number;
    grossProfit: number;
    profitMarginPercent: number;
  }>;
  bestSellingProducts: Array<{
    productName: string;
    unitsSold: number;
    grossProfit: number;
  }>;
  customerDebtReport: {
    totalOutstandingDebt: number;
    debtorsCount: number;
    rows: Array<{
      id: string;
      accountNumber: string;
      fullName: string;
      phone: string;
      currentBalance: number;
      creditLimit: number;
      totalPurchases: number;
      totalPayments: number;
      daysSinceLastTx: number;
    }>;
  };
  repaymentsReport: {
    totalRepayments: number;
    count: number;
    rows: Array<{
      id: string;
      referenceNumber: string;
      customerName: string;
      method: string;
      mpesaReference: string | null;
      amount: number;
      paidAt: string;
    }>;
  };
  stockValuationReport: {
    totalUnits: number;
    totalCostValue: number;
    totalRetailValue: number;
    potentialGrossProfit: number;
    byCategory: Array<{
      category: string;
      units: number;
      costValue: number;
      retailValue: number;
    }>;
  };
  stockMovements: Array<{
    id: string;
    productName: string;
    movementType: string;
    quantityChange: number;
    totalCostValue: number;
    reason: string | null;
    createdAt: string;
  }>;
}

const PRESETS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['this_week', 'This Week'],
  ['this_month', 'This Month'],
  ['last_month', 'Last Month'],
  ['this_year', 'This Year'],
  ['custom', 'Custom Range'],
] as const;

export function ReportsPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTabParam = searchParams.get('tab');
  const initialTab: 'pnl' | 'closing' | 'products' | 'debt' | 'stock' =
    initialTabParam === 'closing' ||
    initialTabParam === 'products' ||
    initialTabParam === 'debt' ||
    initialTabParam === 'stock'
      ? initialTabParam
      : 'pnl';
  const [preset, setPreset] = useState<string>('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tab, setTab] = useState<'pnl' | 'closing' | 'products' | 'debt' | 'stock'>(initialTab);
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ preset });
      if (preset === 'custom' && startDate) qs.set('startDate', startDate);
      if (preset === 'custom' && endDate) qs.set('endDate', endDate);
      const res = await api.get<ReportResponse>(`/reports?${qs.toString()}`);
      setData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load financial reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [preset, startDate, endDate, showToast]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const exportQuery = () => {
    const qs = new URLSearchParams({ preset, type: tab });
    if (preset === 'custom' && startDate) qs.set('startDate', startDate);
    if (preset === 'custom' && endDate) qs.set('endDate', endDate);
    return qs.toString();
  };

  if (loading && !data) return <LoadingState label="Generating financial reports..." />;
  if (!data) return null;

  const { profitAndLoss: pnl } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financial Reports & Analytics</h1>
          <p className="text-sm text-slate-500">
            Period: <strong>{data.period.label}</strong> · FIFO historical costing & cash vs credit
            reconciliation
          </p>
        </div>
        {tab !== 'closing' && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                downloadBinaryFile(`/reports/export/pdf?${exportQuery()}`, `zamora-${tab}-report.pdf`)
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Download className="h-4 w-4" /> Export PDF
            </button>
            <button
              onClick={() =>
                downloadBinaryFile(
                  `/reports/export/excel?${exportQuery()}`,
                  'zamora-financial-report.xlsx'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
            <button
              onClick={() =>
                downloadBinaryFile(`/reports/export/csv?${exportQuery()}`, `zamora-${tab}-report.csv`)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Period Filter Bar */}
      {tab !== 'closing' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                preset === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1 text-xs"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1 text-xs"
              />
            </div>
          )}
        </div>
      )}

      {/* Report Section Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {(
          [
            ['closing', 'Closing Summary'],
            ['pnl', 'Profit & Loss (P&L)'],
            ['products', 'Product Profitability'],
            ['debt', 'Customer Debt & Repayments'],
            ['stock', 'Stock Valuation & Movements'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              setSearchParams(key === 'pnl' ? {} : { tab: key });
            }}
            className={`rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap ${
              tab === key
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'closing' && <DailyClosingPanel />}

      {tab === 'pnl' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Net Sales Revenue"
              value={formatKsh(pnl.netSalesRevenue)}
              subtitle={`${pnl.salesCount} sale(s) · Discounts: ${formatKsh(pnl.totalDiscounts)}`}
              icon={Download}
              tone="navy"
            />
            <StatCard
              title="Cost of Goods Sold (FIFO)"
              value={formatKsh(pnl.costOfGoodsSold)}
              icon={Download}
            />
            <StatCard
              title="Gross Profit"
              value={formatKsh(pnl.grossProfit)}
              subtitle={`Margin: ${pnl.grossMarginPercent}%`}
              icon={Download}
              tone="emerald"
            />
            <StatCard
              title="Net Operating Profit"
              value={formatKsh(pnl.netOperatingProfit)}
              subtitle={`Expenses: ${formatKsh(pnl.totalOperatingExpenses)}`}
              icon={Download}
              tone={pnl.netOperatingProfit >= 0 ? 'emerald' : 'rose'}
            />
          </div>

          {/* Cash Collected vs Credit Issued Reconciliation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Profit & Loss Statement ({data.period.label})
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Gross Sales</span>
                  <span className="tabular-nums font-medium">{formatKsh(pnl.subtotalSales)}</span>
                </div>
                <div className="flex justify-between text-amber-700">
                  <span>Less: Discounts</span>
                  <span className="tabular-nums">-{formatKsh(pnl.totalDiscounts)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-slate-100 pt-2">
                  <span>Net Sales Revenue</span>
                  <span className="tabular-nums">{formatKsh(pnl.netSalesRevenue)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Less: Cost of Goods Sold (Historical FIFO)</span>
                  <span className="tabular-nums">-{formatKsh(pnl.costOfGoodsSold)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 border-t border-slate-200 pt-2">
                  <span>Gross Profit ({pnl.grossMarginPercent}%)</span>
                  <span className="tabular-nums">{formatKsh(pnl.grossProfit)}</span>
                </div>
                <div className="pt-2">
                  <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                    Operating Expenses
                  </p>
                  {pnl.expensesByCategory.length === 0 ? (
                    <p className="text-xs text-slate-400">No operating expenses in this period.</p>
                  ) : (
                    pnl.expensesByCategory.map((e) => (
                      <div key={e.category} className="flex justify-between text-xs text-slate-600">
                        <span>{e.category}</span>
                        <span className="tabular-nums">-{formatKsh(e.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between font-bold text-base border-t border-slate-300 pt-2">
                  <span>Net Operating Profit</span>
                  <span
                    className={`tabular-nums ${
                      pnl.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {formatKsh(pnl.netOperatingProfit)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Cash Collected vs Credit Sales Reconciliation
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">POS Cash Collected</span>
                  <span className="tabular-nums font-medium">
                    {formatKsh(pnl.cashVsCredit.posCashCollected)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">POS M-Pesa Collected</span>
                  <span className="tabular-nums font-medium">
                    {formatKsh(pnl.cashVsCredit.posMpesaCollected)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Debt Repayments (Cash / M-Pesa / Other)</span>
                  <span className="tabular-nums font-medium">
                    {formatKsh(pnl.cashVsCredit.totalDebtRepayments)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 border-t border-slate-200 pt-2">
                  <span>Total Actual Cash & M-Pesa Collected</span>
                  <span className="tabular-nums">
                    {formatKsh(pnl.cashVsCredit.totalActualCashCollected)}
                  </span>
                </div>
                <div className="flex justify-between text-rose-600 pt-2 border-t border-slate-100">
                  <span>Credit Sales Issued (Unpaid at Sale)</span>
                  <span className="tabular-nums font-semibold">
                    {formatKsh(pnl.cashVsCredit.creditSalesIssued)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-rose-700">
                  <span>Total Current Outstanding Customer Debt</span>
                  <span className="tabular-nums">
                    {formatKsh(pnl.cashVsCredit.totalOutstandingCustomerDebt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4">
              Daily Revenue, Gross Profit & Cash Collected
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatKsh(v)} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="grossProfit"
                    name="Gross Profit"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="cashCollected"
                    name="POS Paid"
                    fill="#0284c7"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4">Most Profitable Products</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.productProfitability.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="productName" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatKsh(v)} />
                  <Legend />
                  <Bar dataKey="totalRevenue" name="Revenue" fill="#0f172a" />
                  <Bar dataKey="grossProfit" name="Gross Profit" fill="#059669" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="md:hidden space-y-2">
            {data.productProfitability.map((p) => {
              const rowKey = `prod-${p.productId}`;
              const isOpen = expandedRowKey === rowKey;
              return (
                <div
                  key={p.productId}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 truncate">{p.productName}</p>
                      <p className="text-[11px] text-slate-500">
                        {p.unitsSold} sold ·{' '}
                        <span className="font-bold text-emerald-700">{formatKsh(p.grossProfit)}</span>
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 shrink-0">
                      {p.profitMarginPercent}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedRowKey(isOpen ? null : rowKey)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">Revenue</p>
                        <p className="font-semibold tabular-nums">{formatKsh(p.totalRevenue)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">COGS</p>
                        <p className="tabular-nums text-slate-600">{formatKsh(p.cogs)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">Sell / Buy</p>
                        <p className="tabular-nums text-slate-600">
                          {formatKsh(p.currentSellingPrice)} / {formatKsh(p.currentPurchasePrice)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white text-xs uppercase">
                <tr>
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3 text-left">Product</th>
                  <th className="px-3 py-3 text-right">Units Sold</th>
                  <th className="px-3 py-3 text-right">Revenue</th>
                  <th className="px-3 py-3 text-right">Gross Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.productProfitability.map((p) => {
                  const rowKey = `prod-${p.productId}`;
                  const isOpen = expandedRowKey === rowKey;
                  return (
                    <React.Fragment key={p.productId}>
                      <tr
                        onClick={() => setExpandedRowKey(isOpen ? null : rowKey)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-3 py-2.5 text-slate-400">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-900">{p.productName}</p>
                          <p className="text-xs text-slate-500">
                            {p.bottleSize} · {p.categoryName}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {p.unitsSold}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatKsh(p.totalRevenue)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatKsh(p.grossProfit)} ({p.profitMarginPercent}%)
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="px-10 py-2.5 text-xs text-slate-600">
                            <div className="flex flex-wrap gap-5">
                              <span>Current Cost: <strong>{formatKsh(p.currentPurchasePrice)}</strong></span>
                              <span>Selling Price: <strong>{formatKsh(p.currentSellingPrice)}</strong></span>
                              <span>Historical COGS: <strong>{formatKsh(p.cogs)}</strong></span>
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
        </div>
      )}

      {tab === 'debt' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="Total Outstanding Debt"
              value={formatKsh(data.customerDebtReport.totalOutstandingDebt)}
              subtitle={`${data.customerDebtReport.debtorsCount} customer(s)`}
              icon={Download}
              tone="rose"
            />
            <StatCard
              title="Repayments Collected (Period)"
              value={formatKsh(data.repaymentsReport.totalRepayments)}
              subtitle={`${data.repaymentsReport.count} repayment(s)`}
              icon={Download}
              tone="emerald"
            />
            <StatCard
              title="Credit Issued (Period)"
              value={formatKsh(pnl.cashVsCredit.creditSalesIssued)}
              icon={Download}
              tone="amber"
            />
          </div>

          <div className="md:hidden space-y-2">
            {data.customerDebtReport.rows.map((c) => {
              const rowKey = `debt-${c.id}`;
              const isOpen = expandedRowKey === rowKey;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 truncate">{c.fullName}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {c.accountNumber} · {c.daysSinceLastTx}d
                      </p>
                    </div>
                    <p className="font-bold text-sm text-rose-600 tabular-nums shrink-0">
                      {formatKsh(c.currentBalance)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpandedRowKey(isOpen ? null : rowKey)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">Purchases</p>
                        <p className="tabular-nums">{formatKsh(c.totalPurchases)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">Paid</p>
                        <p className="font-semibold text-emerald-700 tabular-nums">{formatKsh(c.totalPayments)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">Limit</p>
                        <p className="tabular-nums">{formatKsh(c.creditLimit)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">
              Customer Debt Balances
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white text-xs uppercase">
                <tr>
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3 text-left">Customer</th>
                  <th className="px-3 py-3 text-right">Current Debt</th>
                  <th className="px-3 py-3 text-right">Credit Limit</th>
                  <th className="px-3 py-3 text-right">Inactive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.customerDebtReport.rows.map((c) => {
                  const rowKey = `debt-${c.id}`;
                  const isOpen = expandedRowKey === rowKey;
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        onClick={() => setExpandedRowKey(isOpen ? null : rowKey)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-3 py-2.5 text-slate-400">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-slate-900">{c.fullName}</span>{' '}
                          <span className="font-mono text-xs text-slate-500">({c.accountNumber})</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-rose-600 tabular-nums">
                          {formatKsh(c.currentBalance)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatKsh(c.creditLimit)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.daysSinceLastTx}d</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="px-10 py-2.5 text-xs text-slate-600">
                            <div className="flex flex-wrap gap-5">
                              <span>Total Purchases: <strong>{formatKsh(c.totalPurchases)}</strong></span>
                              <span>Total Paid: <strong className="text-emerald-700">{formatKsh(c.totalPayments)}</strong></span>
                              {c.phone && <span>Phone: <strong>{c.phone}</strong></span>}
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
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-6">
          <div className="md:hidden space-y-2.5">
            <p className="text-xs font-bold text-slate-700">
              By Category (Cost: {formatKsh(data.stockValuationReport.totalCostValue)} · Retail:{' '}
              {formatKsh(data.stockValuationReport.totalRetailValue)})
            </p>
            {data.stockValuationReport.byCategory.map((cat) => (
              <div
                key={cat.category}
                className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm flex items-center justify-between gap-2"
              >
                <div>
                  <p className="font-semibold text-sm text-slate-900">{cat.category}</p>
                  <p className="text-xs text-slate-500">{cat.units} bottles in stock</p>
                </div>
                <div className="text-right text-xs">
                  <p className="tabular-nums text-slate-600">Cost: {formatKsh(cat.costValue)}</p>
                  <p className="font-bold text-emerald-700 tabular-nums">
                    Retail: {formatKsh(cat.retailValue)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">
              Stock Valuation by Category (Cost: {formatKsh(data.stockValuationReport.totalCostValue)}{' '}
              · Retail: {formatKsh(data.stockValuationReport.totalRetailValue)})
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Units</th>
                  <th className="px-4 py-3 text-right">Cost Valuation</th>
                  <th className="px-4 py-3 text-right">Retail Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.stockValuationReport.byCategory.map((cat) => (
                  <tr key={cat.category}>
                    <td className="px-4 py-2.5 font-semibold">{cat.category}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{cat.units}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatKsh(cat.costValue)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 tabular-nums">
                      {formatKsh(cat.retailValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            <p className="text-xs font-bold text-slate-700">Stock Movements in Period</p>
            {data.stockMovements.map((m) => {
              const rowKey = `mov-${m.id}`;
              const isOpen = expandedRowKey === rowKey;
              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 truncate">{m.productName}</p>
                      <p className="text-[11px] text-slate-500">{m.movementType}</p>
                    </div>
                    <span className="font-bold text-sm tabular-nums shrink-0">
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedRowKey(isOpen ? null : rowKey)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                      <div className="flex justify-between">
                        <span>{formatDateTime(m.createdAt)}</span>
                        <span className="font-semibold tabular-nums">{formatKsh(m.totalCostValue)}</span>
                      </div>
                      {m.reason && <p className="text-slate-500 italic">{m.reason}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">
              Stock Movements in Period
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white text-xs uppercase">
                <tr>
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3 text-left">Product &amp; Date</th>
                  <th className="px-3 py-3 text-left">Movement</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3 text-right">Cost Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.stockMovements.map((m) => {
                  const rowKey = `mov-${m.id}`;
                  const isOpen = expandedRowKey === rowKey;
                  return (
                    <React.Fragment key={m.id}>
                      <tr
                        onClick={() => setExpandedRowKey(isOpen ? null : rowKey)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-3 py-2.5 text-slate-400">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-900">{m.productName}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge
                            label={m.movementType}
                            variant={m.quantityChange > 0 ? 'emerald' : 'slate'}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                          {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatKsh(m.totalCostValue)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="px-10 py-2 text-xs text-slate-600">
                            Reason / Ref: {m.reason || '—'}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

