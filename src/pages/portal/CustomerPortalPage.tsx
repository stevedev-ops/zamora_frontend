import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  HelpCircle,
  Lock,
  Receipt,
  ShieldCheck,
  Smartphone,
  Wine,
} from 'lucide-react';
import { api, downloadBinaryFile } from '../../api/client';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/common/Modal';
import { LoadingState } from '../../components/common/LoadingState';
import { ReceiptModal, ReceiptSaleData } from '../../components/pos/ReceiptModal';
import { useToast } from '../../components/common/Toast';
import { formatDateTime, formatKsh } from '../../utils/format';

interface ChallengeData {
  valid: boolean;
  storeName: string;
  customerFirstName: string;
  accountNumber: string;
  maskedPhone: string;
  mpesaEnabled: boolean;
  requireOtp?: boolean;
}

interface PortalDashboardData {
  store: {
    storeName: string;
    storePhone: string;
    storeAddress: string;
    currency: string;
    mpesaEnabled: boolean;
    mpesaType?: string | null;
    mpesaPaybillOrTill: string | null;
    mpesaAccountReference?: string | null;
  };
  customer: {
    accountNumber: string;
    fullName: string;
    phone: string;
    email: string | null;
    registeredAt: string;
  };
  summary: {
    currentBalance: number;
    totalPurchases: number;
    totalPayments: number;
    totalTransferredIn: number;
    totalTransferredOut: number;
    lastTransactionAt: string | null;
  };
  pendingIncomingTransfers: Array<{
    id: string;
    referenceNumber: string;
    amount: number;
    reason: string;
    createdAt: string;
    fromCustomer: { fullName: string; accountNumber: string };
  }>;
  clarificationRequests: Array<{
    id: string;
    message: string;
    status: 'OPEN' | 'RESOLVED';
    ownerResponse: string | null;
    createdAt: string;
  }>;
  transactions: Array<{
    id: string;
    referenceNumber: string;
    transactionType: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    runningBalance: number;
    description: string;
    reason: string | null;
    isReversed: boolean;
    createdAt: string;
    sale: {
      id: string;
      receiptNumber: string;
      soldAt: string;
      subtotal: number;
      discountAmount: number;
      totalAmount: number;
      amountPaid: number;
      outstandingAmount: number;
      paymentMethod: string;
      notes?: string | null;
      items: Array<{
        id: string;
        productName: string;
        brand: string;
        bottleSize: string;
        quantity: number;
        unitSellingPrice: number;
        lineTotal: number;
      }>;
    } | null;
    payment: {
      id: string;
      referenceNumber: string;
      method: string;
      mpesaReference: string | null;
    } | null;
  }>;
}

export function CustomerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const { showToast } = useToast();

  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [portalSession, setPortalSession] = useState<string | null>(() =>
    token
      ? sessionStorage.getItem(`portal_session_${token}`) ||
        localStorage.getItem(`portal_session_${token}`)
      : null
  );
  const [dashboard, setDashboard] = useState<PortalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [receiptSale, setReceiptSale] = useState<ReceiptSaleData | null>(null);

  const [clarifyTarget, setClarifyTarget] = useState<{
    debtTransactionId?: string;
    saleId?: string;
    label: string;
  } | null>(null);
  const [clarifyMsg, setClarifyMsg] = useState('');

  const [mpesaOpen, setMpesaOpen] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaAmount, setMpesaAmount] = useState('');
  const [mpesaCheckoutId, setMpesaCheckoutId] = useState<string | null>(null);
  const [mpesaBusy, setMpesaBusy] = useState(false);

  const loadDashboard = useCallback(
    async (sessionJwt: string) => {
      const qs = new URLSearchParams();
      if (startDate) qs.set('startDate', startDate);
      if (endDate) qs.set('endDate', endDate);
      const data = await api.get<PortalDashboardData>(
        `/portal/me/dashboard?${qs.toString()}`,
        sessionJwt
      );
      setDashboard(data);
      setMpesaPhone(data.customer.phone);
      if (data.summary.currentBalance > 0) {
        setMpesaAmount(String(data.summary.currentBalance));
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    let active = true;
    async function init() {
      if (!token) return;
      try {
        const ch = await api.get<ChallengeData>(`/portal/${token}/challenge`);
        if (!active) return;
        setChallenge(ch);
        let activeSession = portalSession;

        if (activeSession) {
          try {
            await loadDashboard(activeSession);
            return;
          } catch (err) {
            const status = (err as { status?: number })?.status;
            if (status === 401 || status === 403) {
              sessionStorage.removeItem(`portal_session_${token}`);
              localStorage.removeItem(`portal_session_${token}`);
              activeSession = null;
              setPortalSession(null);
            } else {
              throw err;
            }
          }
        }

        if (!activeSession && ch.requireOtp !== true) {
          try {
            const openRes = await api.post<{ requiresOtp: false; sessionToken: string }>(
              `/portal/${token}/open`,
              {}
            );
            if (!active) return;
            if (openRes.sessionToken) {
              sessionStorage.setItem(`portal_session_${token}`, openRes.sessionToken);
              localStorage.setItem(`portal_session_${token}`, openRes.sessionToken);
              setPortalSession(openRes.sessionToken);
              await loadDashboard(openRes.sessionToken);
            }
          } catch {
            // Fall through to OTP gate when server enforces OTP
          }
        }
      } catch (err) {
        if (!active) return;
        setChallengeError(err instanceof Error ? err.message : 'Invalid portal link');
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [token, portalSession, loadDashboard]);

  const handleRequestOtp = async () => {
    if (!token) return;
    setVerifying(true);
    try {
      const res = await api.post<{ maskedPhone: string; devOtp?: string }>(
        `/portal/${token}/request-otp`
      );
      setOtpRequested(true);
      if (res.devOtp) setDevOtpHint(res.devOtp);
      showToast(`Verification code sent to ${res.maskedPhone}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send OTP', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setVerifying(true);
    try {
      const res = await api.post<{ sessionToken: string }>(`/portal/${token}/verify-otp`, {
        otp: otpInput,
      });
      sessionStorage.setItem(`portal_session_${token}`, res.sessionToken);
      localStorage.setItem(`portal_session_${token}`, res.sessionToken);
      setPortalSession(res.sessionToken);
      await loadDashboard(res.sessionToken);
      showToast('Account verified', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid OTP', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleViewReceipt = async (saleId: string) => {
    if (!portalSession) return;
    try {
      const res = await api.get<{ sale: ReceiptSaleData }>(
        `/portal/me/sales/${saleId}`,
        portalSession
      );
      setReceiptSale(res.sale);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load receipt', 'error');
    }
  };

  const handleSubmitClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalSession || !clarifyTarget) return;
    try {
      await api.post(
        '/portal/me/clarifications',
        {
          debtTransactionId: clarifyTarget.debtTransactionId,
          saleId: clarifyTarget.saleId,
          message: clarifyMsg,
        },
        portalSession
      );
      showToast('Clarification request sent to store owner', 'success');
      setClarifyTarget(null);
      setClarifyMsg('');
      await loadDashboard(portalSession);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not submit request', 'error');
    }
  };

  const handleTransferDecision = async (transferId: string, action: 'ACCEPT' | 'REJECT') => {
    if (!portalSession) return;
    try {
      await api.post(`/portal/me/transfers/${transferId}/respond`, { action }, portalSession);
      showToast(
        action === 'ACCEPT' ? 'Debt transfer accepted' : 'Debt transfer declined',
        action === 'ACCEPT' ? 'success' : 'info'
      );
      await loadDashboard(portalSession);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not process transfer', 'error');
    }
  };

  const handleInitiatePortalMpesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalSession) return;
    setMpesaBusy(true);
    try {
      const res = await api.post<{ checkoutRequestId: string; customerMessage: string }>(
        '/portal/me/mpesa/stkpush',
        { phoneNumber: mpesaPhone, amount: Number(mpesaAmount) },
        portalSession
      );
      setMpesaCheckoutId(res.checkoutRequestId);
      showToast(res.customerMessage, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'STK Push failed', 'error');
    } finally {
      setMpesaBusy(false);
    }
  };

  const handleSimulatePortalMpesa = async () => {
    if (!mpesaCheckoutId || !portalSession) return;
    setMpesaBusy(true);
    try {
      await api.post('/mpesa/simulate-callback', { checkoutRequestId: mpesaCheckoutId });
      showToast('M-Pesa payment received and balance updated!', 'success');
      setMpesaCheckoutId(null);
      setMpesaOpen(false);
      await loadDashboard(portalSession);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Simulation failed', 'error');
    } finally {
      setMpesaBusy(false);
    }
  };

  if (loading) return <LoadingState label="Verifying secure account link..." />;

  if (challengeError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center space-y-3 shadow-2xl">
          <Lock className="h-10 w-10 text-rose-600 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Link Unavailable</h1>
          <p className="text-sm text-slate-600">{challengeError}</p>
        </div>
      </div>
    );
  }

  // Step 1 & 2: OTP Verification Gate
  if (!portalSession || !dashboard) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-2xl space-y-5">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center mx-auto">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">{challenge?.storeName}</h1>
            <p className="text-sm text-slate-500">Customer Self-Service Debt Portal</p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm space-y-1">
            <p className="text-slate-600">
              Account Holder: <strong className="text-slate-900">{challenge?.customerFirstName}</strong>
            </p>
            <p className="text-slate-600">
              Account Number:{' '}
              <strong className="font-mono text-slate-900">{challenge?.accountNumber}</strong>
            </p>
            <p className="text-slate-600">
              Registered Phone: <strong className="font-mono">{challenge?.maskedPhone}</strong>
            </p>
          </div>

          {!otpRequested ? (
            <button
              type="button"
              disabled={verifying}
              onClick={handleRequestOtp}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {verifying ? 'Sending OTP...' : 'Send One-Time Verification Code (OTP)'}
            </button>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {devOtpHint && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  Mock SMS OTP (Dev Mode): <strong className="font-mono">{devOtpHint}</strong>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-xl font-mono tracking-widest"
                />
              </div>
              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {verifying ? 'Verifying...' : 'Verify & View My Statement'}
              </button>
              <button
                type="button"
                onClick={handleRequestOtp}
                className="w-full text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Resend Code
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white py-5 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center">
              <Wine className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{dashboard.store.storeName}</h1>
              <p className="text-xs text-slate-300">
                {dashboard.customer.fullName} ·{' '}
                <span className="font-mono">{dashboard.customer.accountNumber}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboard.store.mpesaEnabled && dashboard.summary.currentBalance > 0 && (
              <button
                onClick={() => setMpesaOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
              >
                <Smartphone className="h-4 w-4" />
                Pay via M-Pesa
              </button>
            )}
            <button
              onClick={() =>
                downloadBinaryFile(
                  `/portal/me/statement.pdf`,
                  `statement-${dashboard.customer.accountNumber}.pdf`,
                  portalSession
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/20 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
              Download PDF Statement
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
        {/* Pending Incoming Transfer Acceptance Banner */}
        {dashboard.pendingIncomingTransfers.map((tr) => (
          <div
            key={tr.id}
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <p className="text-sm font-bold text-amber-950">
                Pending Debt Transfer Request ({tr.referenceNumber})
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
                <strong>{tr.fromCustomer.fullName}</strong> wants to transfer{' '}
                <strong>{formatKsh(tr.amount)}</strong> debt to your account. Reason: {tr.reason}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleTransferDecision(tr.id, 'ACCEPT')}
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Accept Transfer
              </button>
              <button
                onClick={() => handleTransferDecision(tr.id, 'REJECT')}
                className="rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Decline
              </button>
            </div>
          </div>
        ))}

        {/* Prominent Current Debt Overview Banner */}
        <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 sm:p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
              Where Your Debt Stands Right Now
            </p>
            <p className="text-3xl sm:text-4xl font-extrabold tabular-nums mt-1 text-amber-400">
              {formatKsh(dashboard.summary.currentBalance)}
            </p>
            {dashboard.summary.lastTransactionAt && (
              <p className="text-xs text-slate-300 mt-1">
                Last updated: {formatDateTime(dashboard.summary.lastTransactionAt)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs sm:text-right">
            <div className="rounded-xl bg-white/10 px-3.5 py-2.5">
              <span className="text-slate-300 block">Total Taken</span>
              <strong className="text-sm text-white tabular-nums">
                {formatKsh(dashboard.summary.totalPurchases)}
              </strong>
            </div>
            <div className="rounded-xl bg-white/10 px-3.5 py-2.5">
              <span className="text-slate-300 block">Total Paid</span>
              <strong className="text-sm text-emerald-300 tabular-nums">
                {formatKsh(dashboard.summary.totalPayments)}
              </strong>
            </div>
          </div>
        </section>

        {/* Payment Method Configured by Store (Pochi la Biashara / Paybill / Till) */}
        {dashboard.store.mpesaEnabled && dashboard.store.mpesaPaybillOrTill && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                How to Pay via M-Pesa (
                {dashboard.store.mpesaType === 'POCHI_LA_BIASHARA'
                  ? 'Pochi la Biashara'
                  : dashboard.store.mpesaType === 'TILL' ||
                    (!dashboard.store.mpesaType && !dashboard.store.mpesaAccountReference)
                  ? 'Buy Goods Till'
                  : 'Paybill'}
                )
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emerald-950">
                <span>
                  {dashboard.store.mpesaType === 'POCHI_LA_BIASHARA'
                    ? 'Pochi Number:'
                    : dashboard.store.mpesaType === 'TILL' ||
                      (!dashboard.store.mpesaType && !dashboard.store.mpesaAccountReference)
                    ? 'Till Number:'
                    : 'Paybill Number:'}{' '}
                  <strong className="font-mono text-base font-bold">
                    {dashboard.store.mpesaPaybillOrTill}
                  </strong>
                </span>
                {(dashboard.store.mpesaType === 'PAYBILL' ||
                  (!dashboard.store.mpesaType && dashboard.store.mpesaAccountReference)) && (
                  <span>
                    Account Ref:{' '}
                    <strong className="font-mono font-bold">
                      {dashboard.store.mpesaAccountReference?.trim() ||
                        dashboard.customer.accountNumber}
                    </strong>
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-800 mt-1">
                {dashboard.store.mpesaType === 'POCHI_LA_BIASHARA'
                  ? 'Open M-Pesa → Pochi la Biashara / Send Money and send to the number above.'
                  : dashboard.store.mpesaType === 'TILL' ||
                    (!dashboard.store.mpesaType && !dashboard.store.mpesaAccountReference)
                  ? 'Open M-Pesa → Lipa na M-Pesa → Buy Goods and Services and enter the Till number above.'
                  : 'Open M-Pesa → Lipa na M-Pesa → Paybill and enter the Paybill & Account Ref above.'}
              </p>
            </div>
            {dashboard.summary.currentBalance > 0 && (
              <button
                type="button"
                onClick={() => setMpesaOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shrink-0"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Pay Now via M-Pesa
              </button>
            )}
          </section>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Current Outstanding Debt"
            value={formatKsh(dashboard.summary.currentBalance)}
            subtitle={
              dashboard.summary.lastTransactionAt
                ? `Last activity: ${formatDateTime(dashboard.summary.lastTransactionAt)}`
                : undefined
            }
            icon={Receipt}
            tone={dashboard.summary.currentBalance > 0 ? 'rose' : 'emerald'}
          />
          <StatCard
            title="Total Purchases"
            value={formatKsh(dashboard.summary.totalPurchases)}
            icon={Wine}
          />
          <StatCard
            title="Total Payments"
            value={formatKsh(dashboard.summary.totalPayments)}
            icon={ShieldCheck}
            tone="emerald"
          />
          <StatCard
            title="Transferred In"
            value={formatKsh(dashboard.summary.totalTransferredIn)}
            icon={ArrowDownLeft}
          />
          <StatCard
            title="Transferred Out"
            value={formatKsh(dashboard.summary.totalTransferredOut)}
            icon={ArrowUpRight}
          />
        </div>

        {/* Consolidated What You Drank Summary */}
        {(() => {
          const drinkTotals = new Map<
            string,
            { productName: string; brand: string; bottleSize: string; quantity: number; total: number }
          >();
          for (const tx of dashboard.transactions) {
            if (!tx.sale) continue;
            for (const item of tx.sale.items) {
              const key = `${item.productName}|${item.brand}|${item.bottleSize}`;
              const prev = drinkTotals.get(key);
              if (prev) {
                prev.quantity += Number(item.quantity);
                prev.total += Number(item.lineTotal);
              } else {
                drinkTotals.set(key, {
                  productName: item.productName,
                  brand: item.brand,
                  bottleSize: item.bottleSize,
                  quantity: Number(item.quantity),
                  total: Number(item.lineTotal),
                });
              }
            }
          }
          const summaryDrinks = Array.from(drinkTotals.values());
          if (summaryDrinks.length === 0) return null;
          return (
            <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Wine className="h-4 w-4 text-emerald-600" />
                  Drinks on Your Account ({summaryDrinks.reduce((s, d) => s + d.quantity, 0)} bottles/items)
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {summaryDrinks.map((d) => (
                  <div
                    key={`${d.productName}-${d.bottleSize}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {d.productName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {d.brand} · {d.bottleSize}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block rounded-full bg-slate-900 text-white text-[11px] font-bold px-2 py-0.5">
                        × {d.quantity}
                      </span>
                      <p className="text-xs font-semibold text-slate-800 tabular-nums mt-0.5">
                        {formatKsh(d.total)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Date Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">
            Chronological Account Statement & Drinks Purchased
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Filter by date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-slate-300 px-2.5 py-1.5"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-slate-300 px-2.5 py-1.5"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-slate-600 underline font-semibold"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Chronological Ledger with Exact Drinks Purchased */}
        <div className="space-y-4">
          {dashboard.transactions.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No transactions found in the selected period.
            </div>
          ) : (
            dashboard.transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {tx.referenceNumber}
                      </span>
                      <StatusBadge
                        label={tx.transactionType}
                        variant={tx.direction === 'DEBIT' ? 'rose' : 'emerald'}
                      />
                      <span className="text-xs text-slate-500">
                        {formatDateTime(tx.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{tx.description}</p>
                    {(tx.sale?.notes || tx.reason) && (
                      <p className="inline-block rounded-md bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                        Note: {tx.sale?.notes || tx.reason}
                      </p>
                    )}
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p
                      className={`text-base font-bold tabular-nums ${
                        tx.direction === 'DEBIT' ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {tx.direction === 'DEBIT' ? '+' : '-'}
                      {formatKsh(tx.amount)}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Running Balance: <strong>{formatKsh(tx.runningBalance)}</strong>
                    </p>
                  </div>
                </div>

                {/* EXACT DRINKS PURCHASED TABLE */}
                {tx.sale && tx.sale.items.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-800">
                        Purchase #{tx.sale.receiptNumber} · {formatDateTime(tx.sale.soldAt)}
                      </span>
                      <div className="flex gap-3 text-slate-600">
                        <span>
                          Total: <strong>{formatKsh(tx.sale.totalAmount)}</strong>
                        </span>
                        <span className="text-emerald-700">
                          Paid: <strong>{formatKsh(tx.sale.amountPaid)}</strong>
                        </span>
                        <span className="text-rose-600">
                          Added to debt: <strong>{formatKsh(tx.sale.outstandingAmount)}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-1.5 text-left">Product</th>
                            <th className="py-1.5 text-left">Brand / Size</th>
                            <th className="py-1.5 text-right">Qty</th>
                            <th className="py-1.5 text-right">Unit Price</th>
                            <th className="py-1.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {tx.sale.items.map((item) => (
                            <tr key={item.id}>
                              <td className="py-1.5 font-semibold text-slate-900">
                                {item.productName}
                              </td>
                              <td className="py-1.5 text-slate-600">
                                {item.brand} · {item.bottleSize}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatKsh(item.unitSellingPrice)}
                              </td>
                              <td className="py-1.5 text-right font-semibold tabular-nums">
                                {formatKsh(item.lineTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-3 pt-1 text-xs">
                  {tx.sale && (
                    <button
                      onClick={() => handleViewReceipt(tx.sale!.id)}
                      className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:underline"
                    >
                      <Receipt className="h-3.5 w-3.5" /> View / Print Receipt
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setClarifyTarget({
                        debtTransactionId: tx.id,
                        saleId: tx.sale?.id,
                        label: `${tx.referenceNumber} (${formatKsh(tx.amount)})`,
                      })
                    }
                    className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline"
                  >
                    <HelpCircle className="h-3.5 w-3.5" /> Request Clarification
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Receipt Modal */}
      <ReceiptModal
        sale={receiptSale}
        open={Boolean(receiptSale)}
        onClose={() => setReceiptSale(null)}
        portalSession={portalSession}
      />

      {/* Clarification Modal */}
      <Modal
        open={Boolean(clarifyTarget)}
        onClose={() => setClarifyTarget(null)}
        title="Request Transaction Clarification"
        subtitle={clarifyTarget?.label}
      >
        <form onSubmit={handleSubmitClarification} className="space-y-4">
          <textarea
            required
            rows={3}
            value={clarifyMsg}
            onChange={(e) => setClarifyMsg(e.target.value)}
            placeholder="Describe your question about this transaction..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Submit Question to Store Owner
          </button>
        </form>
      </Modal>

      {/* M-Pesa Repayment Modal */}
      <Modal
        open={mpesaOpen}
        onClose={() => setMpesaOpen(false)}
        title="Pay Debt via M-Pesa"
        subtitle={`Current Balance: ${formatKsh(dashboard.summary.currentBalance)}`}
      >
        <form onSubmit={handleInitiatePortalMpesa} className="space-y-4">
          {dashboard.store.mpesaPaybillOrTill && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <p className="font-semibold">
                {dashboard.store.mpesaType === 'POCHI_LA_BIASHARA'
                  ? `Pochi la Biashara: ${dashboard.store.mpesaPaybillOrTill}`
                  : dashboard.store.mpesaType === 'TILL' ||
                    (!dashboard.store.mpesaType && !dashboard.store.mpesaAccountReference)
                  ? `M-Pesa Till Number: ${dashboard.store.mpesaPaybillOrTill}`
                  : `M-Pesa Paybill: ${dashboard.store.mpesaPaybillOrTill}`}
              </p>
              {(dashboard.store.mpesaType === 'PAYBILL' ||
                (!dashboard.store.mpesaType && dashboard.store.mpesaAccountReference)) && (
                <p className="text-emerald-800 mt-0.5">
                  Account Reference:{' '}
                  <strong className="font-mono">
                    {dashboard.store.mpesaAccountReference?.trim() || dashboard.customer.accountNumber}
                  </strong>
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              M-Pesa Phone Number
            </label>
            <input
              type="text"
              required
              value={mpesaPhone}
              onChange={(e) => setMpesaPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Amount to Pay (KSh)
            </label>
            <input
              type="number"
              required
              min="1"
              max={dashboard.summary.currentBalance}
              step="0.01"
              value={mpesaAmount}
              onChange={(e) => setMpesaAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <button
            type="submit"
            disabled={mpesaBusy}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {mpesaBusy ? 'Sending STK Push...' : 'Send M-Pesa STK Push'}
          </button>

          {mpesaCheckoutId && (
            <button
              type="button"
              disabled={mpesaBusy}
              onClick={handleSimulatePortalMpesa}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Simulate M-Pesa Payment Confirmation ({mpesaCheckoutId.slice(0, 14)}...)
            </button>
          )}
        </form>
      </Modal>
    </div>
  );
}

