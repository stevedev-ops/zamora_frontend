import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Edit2,
  Pencil,
  Share2,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import { api, downloadBinaryFile } from '../api/client';
import { StatCard } from '../components/common/StatCard';
import { ExportButtons } from '../components/common/ExportButtons';
import {
  DrinkFlagBadge,
  DrinkFlagButton,
  DrinkFlagModal,
  DrinkFlagTarget,
} from '../components/common/DrinkFlagModal';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { LoadingState } from '../components/common/LoadingState';
import { SharePortalModal } from '../components/customers/SharePortalModal';
import {
  CustomerDebtTabModal,
  DebtTabSaleInput,
} from '../components/customers/CustomerDebtTabModal';
import { useToast } from '../components/common/Toast';
import { formatDate, formatDateTime, formatKsh, generateIdempotencyKey } from '../utils/format';

interface CustomerDetail {
  id: string;
  accountNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  notes: string | null;
  registeredAt: string;
  portalUrl: string;
  whatsappShareUrl: string;
  account: {
    currentBalance: number;
    creditLimit: number;
    totalPurchases: number;
    totalPayments: number;
    totalTransferredIn: number;
    totalTransferredOut: number;
    lastTransactionAt: string | null;
  };
  creditLimitHistory: Array<{
    id: string;
    limitAmount: number;
    previousLimit: number;
    reason: string | null;
    createdAt: string;
  }>;
  sales: Array<{
    id: string;
    receiptNumber: string;
    soldAt: string;
    status?: string;
    paymentMethod: string;
    discountAmount?: number;
    totalAmount: number;
    amountPaid: number;
    outstandingAmount: number;
    notes?: string | null;
    items: Array<{
      id: string;
      productId?: string;
      productName: string;
      brand: string;
      bottleSize: string;
      quantity: number;
      unitSellingPrice: number;
      lineTotal: number;
      isFlagged?: boolean;
      flagNote?: string | null;
      flaggedByType?: string | null;
      flaggedAt?: string | null;
    }>;
  }>;
  payments: Array<{
    id: string;
    referenceNumber: string;
    paymentType: string;
    method: string;
    mpesaReference: string | null;
    amount: number;
    paidAt: string;
    notes: string | null;
  }>;
  debtTransactions: Array<{
    id: string;
    referenceNumber: string;
    transactionType: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    runningBalance: number;
    description: string;
    isReversed: boolean;
    createdAt: string;
    sale?: DebtTabSaleInput | null;
  }>;
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ledger' | 'sales' | 'payments' | 'limits'>('ledger');

  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tabModalOpen, setTabModalOpen] = useState(false);
  const [tabInitialMode, setTabInitialMode] = useState<'add' | 'edit'>('add');
  const [tabInitialSaleId, setTabInitialSaleId] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<DrinkFlagTarget | null>(null);

  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    status: 'ACTIVE' as 'ACTIVE' | 'SUSPENDED' | 'INACTIVE',
    notes: '',
  });
  const [limitForm, setLimitForm] = useState({ limitAmount: '', reason: '' });
  const [payForm, setPayForm] = useState({
    amount: '',
    method: 'CASH',
    mpesaReference: '',
    notes: '',
  });

  const loadCustomer = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<{ customer: CustomerDetail }>(`/customers/${id}`);
      setCustomer(res.customer);
      setEditForm({
        fullName: res.customer.fullName,
        phone: res.customer.phone,
        email: res.customer.email || '',
        status: res.customer.status,
        notes: res.customer.notes || '',
      });
      setLimitForm({
        limitAmount: String(res.customer.account.creditLimit),
        reason: '',
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load customer', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.patch(`/customers/${id}`, {
        ...editForm,
        email: editForm.email || null,
        notes: editForm.notes || null,
      });
      showToast('Customer details updated', 'success');
      setEditOpen(false);
      await loadCustomer();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleSaveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.post(`/customers/${id}/credit-limit`, {
        limitAmount: Number(limitForm.limitAmount),
        reason: limitForm.reason,
      });
      showToast('Credit limit updated', 'success');
      setLimitOpen(false);
      await loadCustomer();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Credit limit update failed', 'error');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.post('/debt/repayments', {
        customerId: id,
        amount: Number(payForm.amount),
        method: payForm.method,
        mpesaReference: payForm.mpesaReference || undefined,
        notes: payForm.notes || undefined,
        idempotencyKey: generateIdempotencyKey('cust-pay'),
      });
      showToast('Payment recorded & ledger updated', 'success');
      setPayOpen(false);
      setPayForm({ amount: '', method: 'CASH', mpesaReference: '', notes: '' });
      await loadCustomer();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Payment failed', 'error');
    }
  };

  const handleDeleteCustomer = async () => {
    if (!id || !customer) return;
    if (customer.account.currentBalance > 0) {
      showToast('Cannot delete a customer who still owes debt.', 'error');
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/customers/${id}`);
      showToast(`${customer.fullName} deleted permanently`, 'success');
      navigate('/customers');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveDrinkFlag = async (payload: {
    saleItemId: string;
    isFlagged: boolean;
    flagNote: string | null;
  }) => {
    if (!id) return;
    try {
      await api.patch(`/customers/${id}/sale-items/${payload.saleItemId}/flag`, {
        isFlagged: payload.isFlagged,
        flagNote: payload.flagNote,
      });
      showToast(
        payload.isFlagged ? 'Drink marked with * (visible to customer too)' : 'Asterisk (*) mark removed',
        'success'
      );
      await loadCustomer();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update drink mark', 'error');
      throw err;
    }
  };

  if (loading || !customer) return <LoadingState label="Loading customer account..." />;

  const flaggedDrinkIds = new Set<string>();
  for (const s of customer.sales) {
    for (const item of s.items) {
      if (item.isFlagged) flaggedDrinkIds.add(item.id);
    }
  }
  for (const t of customer.debtTransactions) {
    for (const item of t.sale?.items ?? []) {
      if (item.isFlagged && item.id) flaggedDrinkIds.add(item.id);
    }
  }
  const flaggedDrinksCount = flaggedDrinkIds.size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <Link
            to="/customers"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Customers
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{customer.fullName}</h1>
            <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded font-semibold">
              {customer.accountNumber}
            </span>
            <StatusBadge
              label={customer.status}
              variant={customer.status === 'ACTIVE' ? 'emerald' : 'rose'}
            />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {customer.phone} {customer.email ? `· ${customer.email}` : ''} · Registered{' '}
            {formatDate(customer.registeredAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setTabInitialMode('add');
              setTabInitialSaleId(null);
              setTabModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-600"
          >
            <Pencil className="h-4 w-4" />
            Add / Edit Drinks
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Share2 className="h-4 w-4" />
            SHARE ACCOUNT
          </button>
          {customer.account.currentBalance > 0 && (
            <button
              onClick={() => {
                setPayForm({
                  amount: String(customer.account.currentBalance),
                  method: 'CASH',
                  mpesaReference: '',
                  notes: '',
                });
                setPayOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Wallet className="h-4 w-4" />
              Record Payment
            </button>
          )}
          <ExportButtons
            filenameBase={`statement-${customer.accountNumber}`}
            pdfPath={`/customers/${customer.id}/statement.pdf`}
            excelPath={`/customers/${customer.id}/statement/export/excel`}
            csvPath={`/customers/${customer.id}/statement/export/csv`}
            localCsv={{
              columns: [
                { header: 'Date', value: (r) => r.createdAt },
                { header: 'Reference #', value: (r) => r.referenceNumber },
                { header: 'Type', value: (r) => r.transactionType },
                { header: 'Direction', value: (r) => r.direction },
                { header: 'Description', value: (r) => r.description },
                { header: 'Amount (KSh)', value: (r) => r.amount },
                { header: 'Running Balance (KSh)', value: (r) => r.runningBalance },
              ],
              rows: customer.debtTransactions,
            }}
          />
          <button
            onClick={() => setLimitOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Credit Limit
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            disabled={customer.account.currentBalance > 0}
            onClick={() => setDeleteOpen(true)}
            title={
              customer.account.currentBalance > 0
                ? 'Cannot delete a customer with an active debt balance. Clear debt first.'
                : 'Delete customer permanently'
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Account Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Current Outstanding Debt"
          value={formatKsh(customer.account.currentBalance)}
          icon={Wallet}
          tone={customer.account.currentBalance > 0 ? 'rose' : 'emerald'}
        />
        <StatCard
          title="Credit Limit"
          value={formatKsh(customer.account.creditLimit)}
          icon={ShieldCheck}
        />
        <StatCard
          title="Total Purchases"
          value={formatKsh(customer.account.totalPurchases)}
          icon={Wallet}
        />
        <StatCard
          title="Total Payments"
          value={formatKsh(customer.account.totalPayments)}
          icon={Wallet}
          tone="emerald"
        />
        <StatCard
          title="Debt Transfers"
          value={`+${formatKsh(customer.account.totalTransferredIn)}`}
          subtitle={`Out: -${formatKsh(customer.account.totalTransferredOut)}`}
          icon={Share2}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {(
          [
            ['ledger', `Debt Ledger (${customer.debtTransactions.length})`],
            ['sales', `Purchases & Drinks (${customer.sales.length})`],
            ['payments', `Payments (${customer.payments.length})`],
            ['limits', `Credit Limit History (${customer.creditLimitHistory.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
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

      {flaggedDrinksCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">
          <span>
            <strong className="text-sm leading-none">*</strong>{' '}
            <strong>{flaggedDrinksCount}</strong> drink{flaggedDrinksCount === 1 ? '' : 's'} marked with an asterisk (*) for review.
          </span>
          {tab !== 'sales' && (
            <button
              type="button"
              onClick={() => setTab('sales')}
              className="font-bold text-rose-800 underline hover:text-rose-950"
            >
              View in Purchases &amp; Drinks
            </button>
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Ref</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {customer.debtTransactions.map((t) => (
                <tr key={t.id} className={t.isReversed ? 'opacity-60 bg-slate-50' : ''}>
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTime(t.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.referenceNumber}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge
                      label={t.transactionType}
                      variant={t.direction === 'DEBIT' ? 'rose' : 'emerald'}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    <div>{t.description}</div>
                    {t.isReversed && (
                      <span className="text-xs font-semibold text-amber-700">(Reversed)</span>
                    )}
                    {t.sale && t.sale.status !== 'VOIDED' && (
                      <div className="mt-1.5 space-y-1">
                        {t.sale.items.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {t.sale.items
                              .filter((item) => Boolean(item.id))
                              .map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() =>
                                    setFlagTarget({
                                      item: {
                                        ...item,
                                        id: item.id!,
                                      },
                                      receiptNumber: t.sale!.receiptNumber,
                                    })
                                  }
                                  title={
                                    item.isFlagged
                                      ? `Marked by ${item.flaggedByType === 'CUSTOMER' ? 'Customer' : 'Shop Owner'}${
                                          item.flagNote ? `: ${item.flagNote}` : ''
                                        }`
                                      : 'Put an asterisk (*) mark on this drink'
                                  }
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                    item.isFlagged
                                      ? 'border-rose-300 bg-rose-50 text-rose-800 font-semibold'
                                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-amber-300 hover:bg-amber-50'
                                  }`}
                                >
                                  <span className="font-bold">*</span>
                                  <span>
                                    {item.productName} ×{item.quantity}
                                  </span>
                                  {item.isFlagged && item.flagNote ? (
                                    <span className="text-amber-800">({item.flagNote})</span>
                                  ) : null}
                                </button>
                              ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setTabInitialMode('edit');
                            setTabInitialSaleId(t.sale!.id);
                            setTabModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          <Pencil className="h-3 w-3" /> Edit / Remove Drinks
                        </button>
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                      t.direction === 'DEBIT' ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {t.direction === 'DEBIT' ? '+' : '-'}
                    {formatKsh(t.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {formatKsh(t.runningBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sales' && (
        <div className="space-y-4">
          {customer.sales.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <span className="font-bold text-slate-900">{s.receiptNumber}</span>
                  <span className="ml-2 text-xs text-slate-500">{formatDateTime(s.soldAt)}</span>
                  <span className="ml-2">
                    <StatusBadge
                      label={s.status === 'VOIDED' ? 'VOIDED' : s.paymentMethod}
                      variant={s.status === 'VOIDED' ? 'rose' : 'slate'}
                    />
                  </span>
                  {s.notes && (
                    <span className="ml-2 inline-block rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                      Note: {s.notes}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span>
                    Total: <strong>{formatKsh(s.totalAmount)}</strong>
                  </span>
                  <span className="text-emerald-700">
                    Paid: <strong>{formatKsh(s.amountPaid)}</strong>
                  </span>
                  {s.outstandingAmount > 0 && (
                    <span className="text-rose-600">
                      Added to Debt: <strong>{formatKsh(s.outstandingAmount)}</strong>
                    </span>
                  )}
                  {s.status !== 'VOIDED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTabInitialMode('edit');
                        setTabInitialSaleId(s.id);
                        setTabModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      <Pencil className="h-3 w-3" /> Edit Drinks
                    </button>
                  )}
                  <button
                    onClick={() =>
                      downloadBinaryFile(
                        `/sales/${s.id}/receipt.pdf`,
                        `receipt-${s.receiptNumber}.pdf`
                      )
                    }
                    className="inline-flex items-center gap-1 text-slate-700 font-semibold hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                </div>
              </div>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-1 text-left">Drink</th>
                    <th className="py-1 text-right">Qty</th>
                    <th className="py-1 text-right">Unit Price</th>
                    <th className="py-1 text-right">Total</th>
                    <th className="py-1 text-right">Mark (*)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.items.map((item) => (
                    <tr key={item.id} className={item.isFlagged ? 'bg-rose-50/60' : ''}>
                      <td className="py-1.5 font-medium text-slate-900">
                        <div>
                          {item.isFlagged && (
                            <span
                              className="mr-1 font-extrabold text-rose-600"
                              title="Marked drink"
                            >
                              *
                            </span>
                          )}
                          {item.productName} ({item.brand}, {item.bottleSize})
                        </div>
                        <DrinkFlagBadge item={item} />
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatKsh(item.unitSellingPrice)}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">
                        {formatKsh(item.lineTotal)}
                      </td>
                      <td className="py-1.5 text-right">
                        {s.status !== 'VOIDED' && (
                          <DrinkFlagButton
                            item={item}
                            onClick={() =>
                              setFlagTarget({
                                item,
                                receiptNumber: s.receiptNumber,
                              })
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Ref</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">M-Pesa Ref</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {customer.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDateTime(p.paidAt)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.referenceNumber}</td>
                  <td className="px-4 py-2.5">{p.method}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.mpesaReference || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700 tabular-nums">
                    {formatKsh(p.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() =>
                        downloadBinaryFile(
                          `/debt/payments/${p.id}/receipt.pdf`,
                          `payment-${p.referenceNumber}.pdf`
                        )
                      }
                      className="text-xs font-semibold text-slate-700 hover:underline"
                    >
                      Download PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'limits' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Previous Limit</th>
                <th className="px-4 py-3 text-right">New Limit</th>
                <th className="px-4 py-3 text-left">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {customer.creditLimitHistory.map((cl) => (
                <tr key={cl.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {formatDateTime(cl.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatKsh(cl.previousLimit)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                    {formatKsh(cl.limitAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{cl.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SharePortalModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        customerId={customer.id}
        customerName={customer.fullName}
        customerPhone={customer.phone}
        portalUrl={customer.portalUrl}
        whatsappShareUrl={customer.whatsappShareUrl}
        onRegenerated={loadCustomer}
      />

      {/* Edit Customer Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer Profile">
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={editForm.fullName}
              onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Phone
            </label>
            <input
              type="text"
              required
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Status
            </label>
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  status: e.target.value as 'ACTIVE' | 'SUSPENDED' | 'INACTIVE',
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended (Credit Blocked)</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Save Changes
          </button>
        </form>
      </Modal>

      {/* Credit Limit Modal */}
      <Modal open={limitOpen} onClose={() => setLimitOpen(false)} title="Update Credit Limit">
        <form onSubmit={handleSaveLimit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              New Credit Limit (KSh)
            </label>
            <input
              type="number"
              required
              min="0"
              value={limitForm.limitAmount}
              onChange={(e) => setLimitForm((f) => ({ ...f, limitAmount: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Reason
            </label>
            <input
              type="text"
              required
              value={limitForm.reason}
              onChange={(e) => setLimitForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Verified regular payments"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Update Credit Limit
          </button>
        </form>
      </Modal>

      {/* Quick Repayment Modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record Debt Repayment"
        subtitle={`Current Debt: ${formatKsh(customer.account.currentBalance)}`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Amount (KSh)
            </label>
            <input
              type="number"
              required
              min="1"
              max={customer.account.currentBalance}
              step="0.01"
              value={payForm.amount}
              onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Payment Method
            </label>
            <select
              value={payForm.method}
              onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="CASH">Cash</option>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          {payForm.method === 'MPESA' && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                M-Pesa Reference
              </label>
              <input
                type="text"
                required
                value={payForm.mpesaReference}
                onChange={(e) => setPayForm((f) => ({ ...f, mpesaReference: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={payForm.notes}
              onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
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

      <CustomerDebtTabModal
        open={tabModalOpen}
        onClose={() => setTabModalOpen(false)}
        customer={
          customer
            ? {
                id: customer.id,
                fullName: customer.fullName,
                accountNumber: customer.accountNumber,
                currentDebt: customer.account.currentBalance,
                creditLimit: customer.account.creditLimit,
              }
            : null
        }
        initialMode={tabInitialMode}
        initialSaleId={tabInitialSaleId}
        existingSales={customer?.sales}
        onSuccess={loadCustomer}
      />

      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title={`Delete ${customer.fullName}?`}
        subtitle={`Account ${customer.accountNumber} · Current Debt: ${formatKsh(customer.account.currentBalance)}`}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-1">
            <p className="font-semibold">This will permanently remove the customer profile and debt ledger.</p>
            <p>
              Customers with an unpaid debt cannot be deleted. Past store sales &amp; revenue reports
              will remain intact.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting || customer.account.currentBalance > 0}
              onClick={handleDeleteCustomer}
              className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Confirm Delete Customer'}
            </button>
          </div>
        </div>
      </Modal>
      <DrinkFlagModal
        target={flagTarget}
        onClose={() => setFlagTarget(null)}
        onSave={handleSaveDrinkFlag}
      />
    </div>
  );
}

