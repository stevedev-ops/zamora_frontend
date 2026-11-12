import { useCallback, useEffect, useState } from 'react';
import { Banknote, Calendar, CreditCard, RefreshCw, Smartphone, Wallet } from 'lucide-react';
import { api } from '../../api/client';
import { ExportButtons } from '../common/ExportButtons';
import { LoadingState } from '../common/LoadingState';
import { StatusBadge } from '../common/StatusBadge';
import { useToast } from '../common/Toast';
import { buildExportQuery } from '../../utils/export';
import { formatDateTime, formatKsh } from '../../utils/format';

export interface DailyClosingSummaryData {
  date: string;
  totalSold: number;
  salesCount: number;
  itemsSold: number;
  grossProfit: number;
  discountsGiven: number;
  splitSalesCount: number;
  breakdown: {
    cash: { amount: number; count: number; pureCount: number };
    mpesa: { amount: number; count: number; pureCount: number };
    debt: { amount: number; count: number; pureCount: number };
  };
  repayments: {
    total: number;
    cash: number;
    mpesa: number;
    count: number;
    rows: Array<{
      id: string;
      referenceNumber: string;
      customerName: string;
      accountNumber: string | null;
      method: string;
      mpesaReference: string | null;
      amount: number;
      paidAt: string;
    }>;
  };
  expenses: {
    total: number;
    cash: number;
    mpesa: number;
    count: number;
    rows: Array<{
      id: string;
      referenceNumber: string;
      category: string;
      title: string;
      amount: number;
      paymentMethod: string;
      payee: string | null;
      expenseDate: string;
    }>;
  };
  reconciliation: {
    totalCashCollected: number;
    totalMpesaCollected: number;
    totalMoneyIn: number;
    netCashInDrawer: number;
    netMpesaBalance: number;
  };
  sales: Array<{
    id: string;
    receiptNumber: string;
    customerName: string;
    accountNumber: string | null;
    paymentMethod: string;
    totalAmount: number;
    cashAmount: number;
    mpesaAmount: number;
    amountPaid: number;
    outstandingAmount: number;
    grossProfit: number;
    mpesaReference: string | null;
    notes: string | null;
    itemCount: number;
    itemsSummary: string;
    soldAt: string;
  }>;
}

function getLocalTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DailyClosingPanel({ compact = false }: { compact?: boolean }) {
  const { showToast } = useToast();
  const [date, setDate] = useState(getLocalTodayIsoDate);
  const [data, setData] = useState<DailyClosingSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tzOffsetMinutes = new Date().getTimezoneOffset();

  const loadClosing = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const qs = buildExportQuery({ date, tzOffsetMinutes: String(tzOffsetMinutes) });
        const res = await api.get<DailyClosingSummaryData>(`/reports/closing${qs}`);
        setData(res);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to load closing summary', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date, tzOffsetMinutes, showToast]
  );

  useEffect(() => {
    loadClosing(false);
  }, [loadClosing]);

  const exportQuery = buildExportQuery({ date, tzOffsetMinutes: String(tzOffsetMinutes) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-500" />
          <label className="text-xs font-semibold uppercase text-slate-600">Closing Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || getLocalTodayIsoDate())}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
          />
          <button
            type="button"
            disabled={refreshing}
            onClick={() => loadClosing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <ExportButtons
          compact={compact}
          filenameBase={`zamora-closing-${date}`}
          pdfPath={`/reports/closing/export/pdf${exportQuery}`}
          excelPath={`/reports/closing/export/excel${exportQuery}`}
          csvPath={`/reports/closing/export/csv${exportQuery}`}
        />
      </div>

      {loading || !data ? (
        <LoadingState label="Calculating closing totals..." />
      ) : (
        <>
          {/* Hero: Total Sold & Cash / M-Pesa / Debt Breakdown */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Total Sold ({data.date})
                </p>
                <p className="text-3xl font-extrabold tabular-nums text-white mt-1">
                  {formatKsh(data.totalSold)}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  {data.salesCount} sale(s) · {data.itemsSold} bottle(s) sold · Gross Profit:{' '}
                  <strong className="text-emerald-300">{formatKsh(data.grossProfit)}</strong>
                </p>
              </div>
              {data.splitSalesCount > 0 && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-amber-300">
                  Includes {data.splitSalesCount} split payment sale(s)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 p-3.5">
                <div className="flex items-center justify-between text-emerald-300 text-xs font-semibold uppercase">
                  <span>Cash Sales</span>
                  <Banknote className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold tabular-nums text-white mt-1">
                  {formatKsh(data.breakdown.cash.amount)}
                </p>
                <p className="text-[11px] text-emerald-200/80 mt-0.5">
                  {data.breakdown.cash.count} sale(s)
                </p>
              </div>

              <div className="rounded-xl bg-sky-500/15 border border-sky-400/30 p-3.5">
                <div className="flex items-center justify-between text-sky-300 text-xs font-semibold uppercase">
                  <span>M-Pesa Sales</span>
                  <Smartphone className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold tabular-nums text-white mt-1">
                  {formatKsh(data.breakdown.mpesa.amount)}
                </p>
                <p className="text-[11px] text-sky-200/80 mt-0.5">
                  {data.breakdown.mpesa.count} sale(s)
                </p>
              </div>

              <div className="rounded-xl bg-rose-500/15 border border-rose-400/30 p-3.5">
                <div className="flex items-center justify-between text-rose-300 text-xs font-semibold uppercase">
                  <span>Debt (Credit) Sales</span>
                  <CreditCard className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold tabular-nums text-white mt-1">
                  {formatKsh(data.breakdown.debt.amount)}
                </p>
                <p className="text-[11px] text-rose-200/80 mt-0.5">
                  {data.breakdown.debt.count} sale(s)
                </p>
              </div>
            </div>
          </div>

          {/* Drawer & Repayments Reconciliation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                <span>Debt Repayments Today</span>
                <Wallet className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-lg font-bold tabular-nums text-slate-900 mt-1">
                {formatKsh(data.repayments.total)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Cash: <strong>{formatKsh(data.repayments.cash)}</strong> · M-Pesa:{' '}
                <strong>{formatKsh(data.repayments.mpesa)}</strong>
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-xs font-semibold uppercase text-emerald-800">
                Expected Cash in Drawer
              </p>
              <p className="text-lg font-bold tabular-nums text-emerald-950 mt-1">
                {formatKsh(data.reconciliation.netCashInDrawer)}
              </p>
              <p className="text-[11px] text-emerald-800 mt-1">
                Collected: {formatKsh(data.reconciliation.totalCashCollected)} − Cash Expenses:{' '}
                {formatKsh(data.expenses.cash)}
              </p>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
              <p className="text-xs font-semibold uppercase text-sky-800">
                Expected M-Pesa Received
              </p>
              <p className="text-lg font-bold tabular-nums text-sky-950 mt-1">
                {formatKsh(data.reconciliation.totalMpesaCollected)}
              </p>
              <p className="text-[11px] text-sky-800 mt-1">
                After M-Pesa Expenses ({formatKsh(data.expenses.mpesa)}):{' '}
                <strong>{formatKsh(data.reconciliation.netMpesaBalance)}</strong>
              </p>
            </div>
          </div>

          {/* Itemized Sales Today */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Sales Breakdown ({data.sales.length})
              </h3>
              <span className="text-xs text-slate-500">
                Expenses today: {formatKsh(data.expenses.total)} ({data.expenses.count})
              </span>
            </div>
            {data.sales.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No completed sales recorded on {data.date}.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Receipt #</th>
                      <th className="px-3 py-2 text-left">Customer / Note</th>
                      <th className="px-3 py-2 text-left">Method</th>
                      <th className="px-3 py-2 text-right">Cash</th>
                      <th className="px-3 py-2 text-right">M-Pesa</th>
                      <th className="px-3 py-2 text-right">Debt</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.sales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="font-mono font-semibold text-slate-900">
                            {s.receiptNumber}
                          </span>
                          <p className="text-[10px] text-slate-400">{formatDateTime(s.soldAt)}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{s.customerName}</p>
                          <p className="text-[11px] text-slate-500 truncate max-w-[240px]">
                            {s.itemsSummary}
                          </p>
                          {s.notes && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              Note: {s.notes}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusBadge
                            label={s.paymentMethod === 'CREDIT' ? 'DEBT' : s.paymentMethod}
                            variant={
                              s.paymentMethod === 'CASH'
                                ? 'emerald'
                                : s.paymentMethod === 'MPESA'
                                ? 'blue'
                                : s.paymentMethod === 'CREDIT'
                                ? 'rose'
                                : 'amber'
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {s.cashAmount > 0 ? formatKsh(s.cashAmount) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-700">
                          {s.mpesaAmount > 0 ? formatKsh(s.mpesaAmount) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                          {s.outstandingAmount > 0 ? formatKsh(s.outstandingAmount) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                          {formatKsh(s.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
