import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight,
  Bell,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  MessageCircle,
  MessageSquareWarning,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import { api, downloadBinaryFile } from '../api/client';
import { ExportButtons } from '../components/common/ExportButtons';
import { buildExportQuery } from '../utils/export';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import {
  CustomerDebtTabModal,
  DebtTabCustomerInfo,
  DebtTabSaleInput,
} from '../components/customers/CustomerDebtTabModal';
import { useToast } from '../components/common/Toast';
import { formatDateTime, formatKsh, generateIdempotencyKey } from '../utils/format';

interface CustomerItem {
  id: string;
  accountNumber: string;
  fullName: string;
  phone: string;
  currentDebt: number;
  creditLimit: number;
  lastTransactionAt?: string | null;
  registeredAt?: string;
  portalUrl?: string | null;
}

interface LedgerTx {
  id: string;
  referenceNumber: string;
  customerId: string;
  transactionType: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  runningBalance: number;
  description: string;
  reason?: string | null;
  isReversed: boolean;
  createdAt: string;
  customer: { id: string; fullName: string; accountNumber: string };
  payment: { id: string; referenceNumber: string; method: string } | null;
  sale?: DebtTabSaleInput | null;
}

interface DebtTransferRow {
  id: string;
  referenceNumber: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  fromCustomer: { id: string; fullName: string; accountNumber: string };
  toCustomer: { id: string; fullName: string; accountNumber: string; phone: string };
}

interface ClarificationRow {
  id: string;
  message: string;
  status: 'OPEN' | 'RESOLVED';
  ownerResponse: string | null;
  createdAt: string;
  customer: { fullName: string; accountNumber: string; phone: string };
  debtTransaction: { referenceNumber: string; amount: number } | null;
}

export function DebtManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'ledger' | 'transfers' | 'clarifications'>('ledger');
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [transactions, setTransactions] = useState<LedgerTx[]>([]);
  const [transfers, setTransfers] = useState<DebtTransferRow[]>([]);
  const [clarifications, setClarifications] = useState<ClarificationRow[]>([]);
  const [customerFilter, setCustomerFilter] = useState('');
  const [debtorSearch, setDebtorSearch] = useState('');
  const [agingFilter, setAgingFilter] = useState<'ALL' | '0_7' | '8_30' | '30_PLUS'>('ALL');
  const [debtorsOpen, setDebtorsOpen] = useState(true);
  const [expandedDebtorId, setExpandedDebtorId] = useState<string | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [repayOpen, setRepayOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [acceptOtpTarget, setAcceptOtpTarget] = useState<DebtTransferRow | null>(null);
  const [reverseTarget, setReverseTarget] = useState<LedgerTx | null>(null);
  const [resolveTarget, setResolveTarget] = useState<ClarificationRow | null>(null);
  const [tabTarget, setTabTarget] = useState<{
    customer: DebtTabCustomerInfo;
    mode: 'add' | 'edit';
    saleId?: string | null;
  } | null>(null);

  const [repayForm, setRepayForm] = useState({
    customerId: '',
    amount: '',
    method: 'CASH',
    mpesaReference: '',
    notes: '',
  });

  const [transferForm, setTransferForm] = useState({
    fromCustomerId: '',
    toCustomerId: '',
    amount: '',
    reason: '',
  });
  const [lastTransferPrompt, setLastTransferPrompt] = useState<{
    confirmationUrl: string;
    devOtp?: string;
  } | null>(null);

  const [adjustForm, setAdjustForm] = useState({
    customerId: '',
    adjustmentKind: 'DEDUCT_ERROR' as 'ADD_DEBT' | 'DEDUCT_ERROR' | 'DISCOUNT_OR_WRITEOFF',
    amount: '',
    reason: '',
  });

  const [acceptOtpValue, setAcceptOtpValue] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [clarificationReply, setClarificationReply] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const txPath = customerFilter
        ? `/debt/transactions?customerId=${customerFilter}`
        : '/debt/transactions';
      const [custRes, txRes, trfRes, clarRes] = await Promise.all([
        api.get<{ customers: CustomerItem[] }>('/customers'),
        api.get<{ transactions: LedgerTx[] }>(txPath),
        api.get<{ transfers: DebtTransferRow[] }>('/debt/transfers'),
        api.get<{ requests: ClarificationRow[] }>('/debt/clarifications'),
      ]);
      setCustomers(custRes.customers);
      setTransactions(txRes.transactions);
      setTransfers(trfRes.transfers);
      setClarifications(clarRes.requests);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load debt ledger', 'error');
    } finally {
      setLoading(false);
    }
  }, [customerFilter, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (searchParams.get('action') === 'payment' && customers.length > 0) {
      const firstDebtor = customers.find((c) => c.currentDebt > 0) || customers[0];
      setRepayForm((f) => ({ ...f, customerId: firstDebtor?.id || '' }));
      setRepayOpen(true);
      setSearchParams({});
    }
  }, [searchParams, customers, setSearchParams]);

  const handleRepaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post<{ payment: { id: string; referenceNumber: string }; newBalance: number }>(
        '/debt/repayments',
        {
          customerId: repayForm.customerId,
          amount: Number(repayForm.amount),
          method: repayForm.method,
          mpesaReference: repayForm.mpesaReference || undefined,
          notes: repayForm.notes || undefined,
          idempotencyKey: generateIdempotencyKey('repay'),
        }
      );
      showToast(
        `Repayment ${res.payment.referenceNumber} recorded! New balance: ${formatKsh(
          res.newBalance
        )}`,
        'success'
      );
      setRepayOpen(false);
      setRepayForm({ customerId: '', amount: '', method: 'CASH', mpesaReference: '', notes: '' });
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Repayment failed', 'error');
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post<{ confirmationUrl: string; devOtp?: string }>(
        '/debt/transfers',
        {
          fromCustomerId: transferForm.fromCustomerId,
          toCustomerId: transferForm.toCustomerId,
          amount: Number(transferForm.amount),
          reason: transferForm.reason,
          idempotencyKey: generateIdempotencyKey('trf'),
        }
      );
      setLastTransferPrompt({ confirmationUrl: res.confirmationUrl, devOtp: res.devOtp });
      showToast('Debt transfer initiated. Awaiting receiving customer confirmation.', 'success');
      setTransferOpen(false);
      setTab('transfers');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Transfer initiation failed', 'error');
    }
  };

  const handleAcceptWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptOtpTarget) return;
    try {
      await api.post(`/debt/transfers/${acceptOtpTarget.id}/accept`, { otp: acceptOtpValue });
      showToast('Debt transfer accepted and balances updated!', 'success');
      setAcceptOtpTarget(null);
      setAcceptOtpValue('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'OTP verification failed', 'error');
    }
  };

  const handleCancelTransfer = async (id: string) => {
    try {
      await api.post(`/debt/transfers/${id}/cancel`);
      showToast('Pending debt transfer cancelled', 'info');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cancel failed', 'error');
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/debt/adjustments', {
        customerId: adjustForm.customerId,
        adjustmentKind: adjustForm.adjustmentKind,
        amount: Number(adjustForm.amount),
        reason: adjustForm.reason.trim() || undefined,
        idempotencyKey: generateIdempotencyKey('adj'),
      });
      showToast('Authorized debt adjustment posted to ledger', 'success');
      setAdjustOpen(false);
      setAdjustForm({ customerId: '', adjustmentKind: 'DEDUCT_ERROR', amount: '', reason: '' });
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Adjustment failed', 'error');
    }
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget) return;
    try {
      await api.post(`/debt/transactions/${reverseTarget.id}/reverse`, { reason: reverseReason });
      showToast('Transaction reversed cleanly with audit trail', 'success');
      setReverseTarget(null);
      setReverseReason('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reversal failed', 'error');
    }
  };

  const handleResolveClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget) return;
    try {
      await api.post(`/debt/clarifications/${resolveTarget.id}/resolve`, {
        ownerResponse: clarificationReply,
      });
      showToast('Clarification resolved and response recorded', 'success');
      setResolveTarget(null);
      setClarificationReply('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Resolve failed', 'error');
    }
  };

  const handleSendOverdueReminders = async () => {
    try {
      const res = await api.post<{ sentCount: number }>('/debt/reminders/overdue');
      showToast(`Sent overdue reminders to ${res.sentCount} customer(s)`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send reminders', 'error');
    }
  };

  const getAgingDays = (c: CustomerItem) => {
    const ref = c.lastTransactionAt || c.registeredAt;
    if (!ref) return 0;
    const diff = Date.now() - new Date(ref).getTime();
    return Math.max(0, Math.floor(diff / 86400000));
  };

  const getAgingBucket = (days: number): '0_7' | '8_30' | '30_PLUS' => {
    if (days <= 7) return '0_7';
    if (days <= 30) return '8_30';
    return '30_PLUS';
  };

  const formatWaReminderUrl = (c: CustomerItem, days: number) => {
    const raw = (c.phone || '').replace(/[^0-9+]/g, '');
    const waPhone = raw.startsWith('+254')
      ? raw.slice(1)
      : raw.startsWith('0') && raw.length === 10
        ? `254${raw.slice(1)}`
        : raw.replace(/^\+/, '');
    const portalLink = c.portalUrl
      ? c.portalUrl.startsWith('http')
        ? c.portalUrl
        : `${window.location.origin}${c.portalUrl}`
      : '';
    const lines = [
      `Hello ${c.fullName},`,
      `Friendly reminder from Zamora Liquor Store regarding your outstanding account balance of *${formatKsh(c.currentDebt)}*${days > 7 ? ` (${days} days since last activity)` : ''}.`,
      portalLink ? `View your drinks & statement anytime: ${portalLink}` : '',
      `Thank you!`,
    ].filter(Boolean);
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(lines.join('\n\n'))}`;
  };

  const debtors = customers.filter((c) => c.currentDebt > 0);
  const totalDebt = debtors.reduce((sum, c) => sum + c.currentDebt, 0);

  const agingCounts = debtors.reduce(
    (acc, d) => {
      const b = getAgingBucket(getAgingDays(d));
      acc[b] += 1;
      return acc;
    },
    { '0_7': 0, '8_30': 0, '30_PLUS': 0 }
  );

  const filteredDebtors = debtors.filter((d) => {
    const bucket = getAgingBucket(getAgingDays(d));
    if (agingFilter !== 'ALL' && bucket !== agingFilter) return false;
    const q = debtorSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      d.fullName.toLowerCase().includes(q) ||
      d.phone.toLowerCase().includes(q) ||
      d.accountNumber.toLowerCase().includes(q)
    );
  });

  if (loading) return <LoadingState label="Loading debt management ledger..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Debt Management Ledger</h1>
          <p className="text-sm text-slate-500">
            Immutable transaction ledger · Total Outstanding:{' '}
            <strong className="text-rose-600">{formatKsh(totalDebt)}</strong> across{' '}
            <strong>{debtors.length}</strong> customer(s)
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setRepayForm((f) => ({ ...f, customerId: debtors[0]?.id || customers[0]?.id || '' }));
              setRepayOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Wallet className="h-4 w-4" />
            Record Payment
          </button>
          <button
            onClick={() => {
              setTransferForm({
                fromCustomerId: debtors[0]?.id || '',
                toCustomerId: customers.find((c) => c.id !== debtors[0]?.id)?.id || '',
                amount: '',
                reason: '',
              });
              setTransferOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Transfer Debt
          </button>
          <button
            onClick={() => {
              setAdjustForm({
                customerId: customers[0]?.id || '',
                adjustmentKind: 'ADD_DEBT',
                amount: '',
                reason: '',
              });
              setAdjustOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-600"
          >
            <Plus className="h-4 w-4" />
            Add Debt
          </button>
          <button
            onClick={() => {
              setAdjustForm({
                customerId: customers[0]?.id || '',
                adjustmentKind: 'DEDUCT_ERROR',
                amount: '',
                reason: '',
              });
              setAdjustOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Adjustment
          </button>
          <button
            onClick={handleSendOverdueReminders}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            <Bell className="h-4 w-4" />
            Send Overdue Reminders
          </button>
        </div>
      </div>

      {lastTransferPrompt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-1">
          <p className="font-semibold">
            Debt Transfer Request Created — Waiting for Receiving Customer Acceptance
          </p>
          <p className="text-xs">
            Confirmation Link:{' '}
            <a
              href={lastTransferPrompt.confirmationUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono underline text-slate-900"
            >
              {lastTransferPrompt.confirmationUrl}
            </a>
          </p>
          {lastTransferPrompt.devOtp && (
            <p className="text-xs">
              Dev Mock SMS OTP: <strong className="font-mono">{lastTransferPrompt.devOtp}</strong>
            </p>
          )}
        </div>
      )}

      {/* Tabs & Customer filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('ledger')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${
              tab === 'ledger'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            Debt Ledger ({transactions.length})
          </button>
          <button
            onClick={() => setTab('transfers')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${
              tab === 'transfers'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            Debt Transfers ({transfers.length})
          </button>
          <button
            onClick={() => setTab('clarifications')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${
              tab === 'clarifications'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            Clarification Requests (
            {clarifications.filter((c) => c.status === 'OPEN').length} open)
          </button>
        </div>

        {tab === 'ledger' && (
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm sm:w-64"
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} ({formatKsh(c.currentDebt)})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Active Debtors Quick Tab Management */}
      {debtors.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setDebtorsOpen((v) => !v)}
                className="flex items-center gap-2 text-left"
              >
                {debtorsOpen ? (
                  <ChevronDown className="h-4 w-4 text-slate-600 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                )}
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Customers With Debt ({filteredDebtors.length}/{debtors.length})
                </h2>
              </button>
              <ExportButtons
                compact
                filenameBase="zamora-debtors"
                pdfPath={`/customers/export/pdf${buildExportQuery({
                  hasDebt: true,
                  search: debtorSearch.trim(),
                  aging: agingFilter !== 'ALL' ? agingFilter : undefined,
                })}`}
                excelPath={`/customers/export/excel${buildExportQuery({
                  hasDebt: true,
                  search: debtorSearch.trim(),
                  aging: agingFilter !== 'ALL' ? agingFilter : undefined,
                })}`}
                csvPath={`/customers/export/csv${buildExportQuery({
                  hasDebt: true,
                  search: debtorSearch.trim(),
                  aging: agingFilter !== 'ALL' ? agingFilter : undefined,
                })}`}
                localCsv={{
                  columns: [
                    { header: 'Account #', value: (r) => r.accountNumber },
                    { header: 'Customer Name', value: (r) => r.fullName },
                    { header: 'Phone', value: (r) => r.phone },
                    { header: 'Current Debt (KSh)', value: (r) => r.currentDebt },
                    { header: 'Credit Limit (KSh)', value: (r) => r.creditLimit },
                    { header: 'Days Idle', value: (r) => getAgingDays(r) },
                    { header: 'Aging Bucket', value: (r) => getAgingBucket(getAgingDays(r)) },
                  ],
                  rows: filteredDebtors,
                }}
              />
            </div>
            {debtorsOpen && (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={debtorSearch}
                    onChange={(e) => setDebtorSearch(e.target.value)}
                    placeholder="Lookup phone, name, CUST-#..."
                    className="w-full sm:w-52 rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { key: 'ALL', label: `All (${debtors.length})` },
                    { key: '0_7', label: `0–7d (${agingCounts['0_7']})` },
                    { key: '8_30', label: `8–30d (${agingCounts['8_30']})` },
                    { key: '30_PLUS', label: `30+d (${agingCounts['30_PLUS']})` },
                  ].map((pill) => (
                    <button
                      key={pill.key}
                      type="button"
                      onClick={() => setAgingFilter(pill.key as typeof agingFilter)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        agingFilter === pill.key
                          ? pill.key === '30_PLUS'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {debtorsOpen &&
            (filteredDebtors.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                No customers with debt match that search or aging filter.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {filteredDebtors.map((d) => {
                  const days = getAgingDays(d);
                  const bucket = getAgingBucket(days);
                  const isOpen = expandedDebtorId === d.id;
                  return (
                    <div
                      key={d.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/customers/${d.id}`}
                              className="font-semibold text-sm text-slate-900 hover:text-emerald-700 truncate"
                            >
                              {d.fullName}
                            </Link>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                bucket === '30_PLUS'
                                  ? 'bg-rose-100 text-rose-700'
                                  : bucket === '8_30'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {days === 0 ? 'Today' : `${days}d`}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-rose-600 tabular-nums">
                            {formatKsh(d.currentDebt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setTabTarget({
                                customer: {
                                  id: d.id,
                                  fullName: d.fullName,
                                  accountNumber: d.accountNumber,
                                  currentDebt: d.currentDebt,
                                  creditLimit: d.creditLimit,
                                },
                                mode: 'add',
                              })
                            }
                            title="Add, edit or remove drinks on this customer's debt tab"
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Drinks
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRepayForm({
                                customerId: d.id,
                                amount: String(d.currentDebt),
                                method: 'CASH',
                                mpesaReference: '',
                                notes: '',
                              });
                              setRepayOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Pay
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedDebtorId(isOpen ? null : d.id)}
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
                            aria-label={`View more details for ${d.fullName}`}
                            title="More details & WhatsApp reminder"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <div>
                            <p className="font-mono text-[11px]">{d.accountNumber} · {d.phone}</p>
                            <p className="text-[11px] text-slate-500">Limit: {formatKsh(d.creditLimit)}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={formatWaReminderUrl(d, days)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              WhatsApp
                            </a>
                            <Link
                              to={`/customers/${d.id}`}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Profile
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      )}

      {tab === 'ledger' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Showing {transactions.length} ledger entry(ies)
              {customerFilter ? ' (filtered by selected customer)' : ''}
            </p>
            <ExportButtons
              compact
              filenameBase="zamora-debt-ledger"
              pdfPath={`/debt/transactions/export/pdf${buildExportQuery({ customerId: customerFilter })}`}
              excelPath={`/debt/transactions/export/excel${buildExportQuery({ customerId: customerFilter })}`}
              csvPath={`/debt/transactions/export/csv${buildExportQuery({ customerId: customerFilter })}`}
              localCsv={{
                columns: [
                  { header: 'Date', value: (r) => r.createdAt },
                  { header: 'Ref #', value: (r) => r.referenceNumber },
                  { header: 'Customer', value: (r) => `${r.customer.fullName} (${r.customer.accountNumber})` },
                  { header: 'Type', value: (r) => r.transactionType },
                  { header: 'Direction', value: (r) => r.direction },
                  { header: 'Description', value: (r) => r.description },
                  { header: 'Amount (KSh)', value: (r) => r.amount },
                  { header: 'Running Balance (KSh)', value: (r) => r.runningBalance },
                ],
                rows: transactions,
              }}
            />
          </div>
          {/* Mobile Compact Dropdown Cards */}
          <div className="md:hidden space-y-2">
            {transactions.map((t) => {
              const custObj = customers.find((c) => c.id === t.customer.id);
              const isOpen = expandedTxId === t.id;
              return (
                <div
                  key={t.id}
                  className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2 ${
                    t.isReversed ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/customers/${t.customer.id}`}
                        className="font-semibold text-sm text-slate-900 truncate block"
                      >
                        {t.customer.fullName}
                      </Link>
                      <p className="text-xs text-slate-500 truncate">{t.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          t.direction === 'DEBIT' ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {t.direction === 'DEBIT' ? '+' : '-'}
                        {formatKsh(t.amount)}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        Bal {formatKsh(t.runningBalance)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedTxId(isOpen ? null : t.id)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                      aria-label="Toggle transaction details"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="font-mono">{t.referenceNumber}</span>
                        <span>{formatDateTime(t.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StatusBadge
                          label={t.transactionType}
                          variant={t.direction === 'DEBIT' ? 'rose' : 'emerald'}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          {t.sale && t.sale.status !== 'VOIDED' && (
                            <button
                              type="button"
                              onClick={() =>
                                setTabTarget({
                                  customer: {
                                    id: t.customer.id,
                                    fullName: t.customer.fullName,
                                    accountNumber: t.customer.accountNumber,
                                    currentDebt: custObj?.currentDebt ?? t.runningBalance,
                                    creditLimit: custObj?.creditLimit,
                                  },
                                  mode: 'edit',
                                  saleId: t.sale!.id,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                            >
                              <Pencil className="h-3 w-3" /> Edit Drinks
                            </button>
                          )}
                          {t.payment && (
                            <button
                              onClick={() =>
                                downloadBinaryFile(
                                  `/debt/payments/${t.payment!.id}/receipt.pdf`,
                                  `payment-${t.payment!.referenceNumber}.pdf`
                                )
                              }
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
                            >
                              <Download className="h-3.5 w-3.5" /> Receipt
                            </button>
                          )}
                          {!t.isReversed && t.transactionType !== 'REVERSAL' && (
                            <button
                              onClick={() => setReverseTarget(t)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Reverse
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop 5-Column Screen-Fit Ledger Table with Arrow Dropdown */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3 text-left">Customer</th>
                <th className="px-3 py-3 text-left">Entry</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transactions.map((t) => {
                const isOpen = expandedTxId === t.id;
                const custObj = customers.find((c) => c.id === t.customer.id);
                return (
                  <React.Fragment key={t.id}>
                    <tr
                      onClick={() => setExpandedTxId(isOpen ? null : t.id)}
                      className={`cursor-pointer hover:bg-slate-50 ${
                        t.isReversed ? 'opacity-60 bg-slate-50' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-slate-400">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/customers/${t.customer.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-slate-900 hover:underline block"
                        >
                          {t.customer.fullName}
                        </Link>
                        <span className="font-mono text-[11px] text-slate-500">
                          {t.referenceNumber} · {formatDateTime(t.createdAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusBadge
                            label={t.transactionType}
                            variant={t.direction === 'DEBIT' ? 'rose' : 'emerald'}
                          />
                          <span className="text-xs text-slate-600 truncate max-w-[260px]">
                            {t.description}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${
                          t.direction === 'DEBIT' ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {t.direction === 'DEBIT' ? '+' : '-'}
                        {formatKsh(t.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatKsh(t.runningBalance)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-10 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="space-y-0.5 text-slate-600">
                              <p className="font-medium text-slate-900">{t.description}</p>
                              {(t.reason || t.sale?.notes) && (
                                <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 inline-block">
                                  Note: {t.reason || t.sale?.notes}
                                </p>
                              )}
                              <p className="text-[11px] text-slate-500">
                                {t.customer.accountNumber} · Recorded {formatDateTime(t.createdAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {t.sale && t.sale.status !== 'VOIDED' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTabTarget({
                                      customer: {
                                        id: t.customer.id,
                                        fullName: t.customer.fullName,
                                        accountNumber: t.customer.accountNumber,
                                        currentDebt: custObj?.currentDebt ?? t.runningBalance,
                                        creditLimit: custObj?.creditLimit,
                                      },
                                      mode: 'edit',
                                      saleId: t.sale!.id,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                >
                                  <Pencil className="h-3 w-3" /> Edit Drinks
                                </button>
                              )}
                              {t.payment && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadBinaryFile(
                                      `/debt/payments/${t.payment!.id}/receipt.pdf`,
                                      `payment-${t.payment!.referenceNumber}.pdf`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  <Download className="h-3.5 w-3.5" /> Receipt PDF
                                </button>
                              )}
                              {!t.isReversed && t.transactionType !== 'REVERSAL' && (
                                <button
                                  type="button"
                                  onClick={() => setReverseTarget(t)}
                                  className="inline-flex items-center gap-1 rounded border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" /> Reverse Entry
                                </button>
                              )}
                            </div>
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
        </>
      )}

      {tab === 'transfers' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Showing {transfers.length} transfer(s)
              {customerFilter ? ' (filtered by selected customer)' : ''}
            </p>
            <ExportButtons
              compact
              filenameBase="zamora-debt-transfers"
              pdfPath={`/debt/transfers/export/pdf${buildExportQuery({ customerId: customerFilter })}`}
              excelPath={`/debt/transfers/export/excel${buildExportQuery({ customerId: customerFilter })}`}
              csvPath={`/debt/transfers/export/csv${buildExportQuery({ customerId: customerFilter })}`}
              localCsv={{
                columns: [
                  { header: 'Date', value: (r) => r.createdAt },
                  { header: 'Ref #', value: (r) => r.referenceNumber },
                  { header: 'From Customer', value: (r) => r.fromCustomer.fullName },
                  { header: 'To Customer', value: (r) => r.toCustomer.fullName },
                  { header: 'Amount (KSh)', value: (r) => r.amount },
                  { header: 'Status', value: (r) => r.status },
                  { header: 'Reason', value: (r) => r.reason || '' },
                ],
                rows: transfers,
              }}
            />
          </div>
          {/* Mobile Compact Dropdown Cards */}
          <div className="md:hidden space-y-2">
            {transfers.map((tr) => {
              const isOpen = expandedTransferId === tr.id;
              return (
                <div
                  key={tr.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 truncate">
                        {tr.fromCustomer.fullName} → {tr.toCustomer.fullName}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">{tr.referenceNumber}</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums shrink-0">
                      {formatKsh(tr.amount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpandedTransferId(isOpen ? null : tr.id)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                      aria-label={`View transfer ${tr.referenceNumber}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge
                          label={tr.status}
                          variant={
                            tr.status === 'COMPLETED'
                              ? 'emerald'
                              : tr.status === 'PENDING_ACCEPTANCE'
                              ? 'amber'
                              : 'rose'
                          }
                        />
                        {tr.reason && <span className="text-slate-600">{tr.reason}</span>}
                      </div>
                      {tr.status === 'PENDING_ACCEPTANCE' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAcceptOtpTarget(tr)}
                            className="flex-1 rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Verify OTP
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelTransfer(tr.id)}
                            className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop 5-Column Screen-Fit Transfers Table with Arrow Dropdown */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3 text-left">Transfer</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transfers.map((tr) => {
                const isOpen = expandedTransferId === tr.id;
                return (
                  <React.Fragment key={tr.id}>
                    <tr
                      onClick={() => setExpandedTransferId(isOpen ? null : tr.id)}
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
                        <p className="font-medium text-slate-900">
                          {tr.fromCustomer.fullName} → {tr.toCustomer.fullName}
                        </p>
                        <p className="font-mono text-xs text-slate-500">{tr.referenceNumber}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap">
                        {formatKsh(tr.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge
                          label={tr.status}
                          variant={
                            tr.status === 'COMPLETED'
                              ? 'emerald'
                              : tr.status === 'PENDING_ACCEPTANCE'
                              ? 'amber'
                              : 'rose'
                          }
                        />
                      </td>
                      <td
                        className="px-3 py-2.5 text-right whitespace-nowrap space-x-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tr.status === 'PENDING_ACCEPTANCE' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setAcceptOtpTarget(tr)}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Verify OTP
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelTransfer(tr.id)}
                              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-10 py-2.5 text-xs text-slate-600">
                          Reason: <strong>{tr.reason || '—'}</strong>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'clarifications' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Showing {clarifications.length} clarification request(s)
            </p>
            <ExportButtons
              compact
              filenameBase="zamora-debt-clarifications"
              pdfPath="/debt/clarifications/export/pdf"
              excelPath="/debt/clarifications/export/excel"
              csvPath="/debt/clarifications/export/csv"
              localCsv={{
                columns: [
                  { header: 'Date', value: (r) => r.createdAt },
                  { header: 'Customer', value: (r) => r.customer.fullName },
                  { header: 'Status', value: (r) => r.status },
                  { header: 'Message', value: (r) => r.message },
                  { header: 'Owner Response', value: (r) => r.ownerResponse || '' },
                ],
                rows: clarifications,
              }}
            />
          </div>
          {clarifications.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No clarification requests from customers yet.
            </div>
          ) : (
            clarifications.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MessageSquareWarning className="h-4 w-4 text-amber-600" />
                    <span className="font-bold text-slate-900">{c.customer.fullName}</span>
                    <StatusBadge
                      label={c.status}
                      variant={c.status === 'OPEN' ? 'amber' : 'emerald'}
                    />
                    <span className="text-xs text-slate-400">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700">{c.message}</p>
                  {c.ownerResponse && (
                    <p className="text-xs text-emerald-700 font-medium">
                      Owner response: {c.ownerResponse}
                    </p>
                  )}
                </div>
                {c.status === 'OPEN' && (
                  <button
                    onClick={() => setResolveTarget(c)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 shrink-0"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Resolve
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Record Repayment Modal */}
      <Modal
        open={repayOpen}
        onClose={() => setRepayOpen(false)}
        title="Record Debt Repayment"
        subtitle="Full or partial repayment creates an immutable ledger credit & receipt"
      >
        <form onSubmit={handleRepaySubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Customer
            </label>
            <select
              required
              value={repayForm.customerId}
              onChange={(e) => setRepayForm((f) => ({ ...f, customerId: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select Customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.accountNumber}) — Debt: {formatKsh(c.currentDebt)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Amount (KSh)
              </label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={repayForm.amount}
                onChange={(e) => setRepayForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Method
              </label>
              <select
                value={repayForm.method}
                onChange={(e) => setRepayForm((f) => ({ ...f, method: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="MPESA">M-Pesa</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          {repayForm.method === 'MPESA' && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                M-Pesa Reference Code
              </label>
              <input
                type="text"
                required
                value={repayForm.mpesaReference}
                onChange={(e) => setRepayForm((f) => ({ ...f, mpesaReference: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={repayForm.notes}
              onChange={(e) => setRepayForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Confirm Repayment
          </button>
        </form>
      </Modal>

      {/* Debt Transfer Modal */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Initiate Debt Transfer"
        subtitle="Requires receiving customer acceptance via OTP or confirmation link"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Original Customer (Owes Debt)
            </label>
            <select
              required
              value={transferForm.fromCustomerId}
              onChange={(e) => setTransferForm((f) => ({ ...f, fromCustomerId: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select Customer...</option>
              {debtors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} — Debt: {formatKsh(c.currentDebt)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Receiving Customer (Accepts Debt)
            </label>
            <select
              required
              value={transferForm.toCustomerId}
              onChange={(e) => setTransferForm((f) => ({ ...f, toCustomerId: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select Receiving Customer...</option>
              {customers
                .filter((c) => c.id !== transferForm.fromCustomerId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.accountNumber})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Transfer Amount (KSh)
            </label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={transferForm.amount}
              onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Reason for Transfer
            </label>
            <textarea
              required
              rows={2}
              value={transferForm.reason}
              onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Peter agreed to take responsibility for KSh 2,000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Send Transfer Acceptance Request
          </button>
        </form>
      </Modal>

      {/* Verify Transfer OTP Modal */}
      <Modal
        open={Boolean(acceptOtpTarget)}
        onClose={() => setAcceptOtpTarget(null)}
        title={`Confirm Transfer ${acceptOtpTarget?.referenceNumber || ''}`}
        subtitle={`Enter OTP sent to ${acceptOtpTarget?.toCustomer.fullName}`}
      >
        <form onSubmit={handleAcceptWithOtp} className="space-y-4">
          <input
            type="text"
            required
            placeholder="Enter 6-digit OTP"
            value={acceptOtpValue}
            onChange={(e) => setAcceptOtpValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg font-mono tracking-widest"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Finalize Debt Transfer
          </button>
        </form>
      </Modal>

      {/* Debt Adjustment Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Authorized Debt Adjustment"
        subtitle="Preserves full ledger history and notifies customer"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Customer
            </label>
            <select
              required
              value={adjustForm.customerId}
              onChange={(e) => setAdjustForm((f) => ({ ...f, customerId: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} — Current: {formatKsh(c.currentDebt)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Adjustment Type
            </label>
            <select
              value={adjustForm.adjustmentKind}
              onChange={(e) =>
                setAdjustForm((f) => ({
                  ...f,
                  adjustmentKind: e.target.value as
                    | 'ADD_DEBT'
                    | 'DEDUCT_ERROR'
                    | 'DISCOUNT_OR_WRITEOFF',
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="DEDUCT_ERROR">Deduct Incorrect Amount (-)</option>
              <option value="DISCOUNT_OR_WRITEOFF">Approved Discount / Write-off (-)</option>
              <option value="ADD_DEBT">Add Missing Debt (+)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Amount (KSh)
            </label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={adjustForm.amount}
              onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              {adjustForm.adjustmentKind === 'ADD_DEBT'
                ? 'Debt Note (Optional — e.g. This drink was bought for John)'
                : 'Reason (Mandatory)'}
            </label>
            <textarea
              required={adjustForm.adjustmentKind !== 'ADD_DEBT'}
              rows={2}
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={
                adjustForm.adjustmentKind === 'ADD_DEBT'
                  ? 'Optional note e.g. This drink was bought for John'
                  : 'Enter reason for this adjustment'
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply Adjustment
          </button>
        </form>
      </Modal>

      {/* Reverse Transaction Modal */}
      <Modal
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title={`Reverse ${reverseTarget?.referenceNumber || ''}`}
        subtitle="Creates a compensating reversal ledger entry without deleting history"
      >
        <form onSubmit={handleReverseSubmit} className="space-y-4">
          <textarea
            required
            rows={2}
            placeholder="Reason for reversing this transaction..."
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Post Reversal Transaction
          </button>
        </form>
      </Modal>

      {/* Resolve Clarification Modal */}
      <Modal
        open={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        title="Resolve Customer Clarification Request"
      >
        <form onSubmit={handleResolveClarification} className="space-y-4">
          <p className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
            Customer question: {resolveTarget?.message}
          </p>
          <textarea
            required
            rows={3}
            placeholder="Write your response to the customer..."
            value={clarificationReply}
            onChange={(e) => setClarificationReply(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Mark Resolved
          </button>
        </form>
      </Modal>

      <CustomerDebtTabModal
        open={Boolean(tabTarget)}
        onClose={() => setTabTarget(null)}
        customer={tabTarget?.customer ?? null}
        initialMode={tabTarget?.mode ?? 'add'}
        initialSaleId={tabTarget?.saleId ?? null}
        onSuccess={loadAll}
      />
    </div>
  );
}

