import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeftRight, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { LoadingState } from '../../components/common/LoadingState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useToast } from '../../components/common/Toast';
import { formatDateTime, formatKsh } from '../../utils/format';

interface PublicTransferInfo {
  id: string;
  referenceNumber: string;
  amount: number;
  reason: string;
  status: string;
  expired: boolean;
  createdAt: string;
  fromCustomer: { fullName: string; accountNumber: string };
  toCustomer: { fullName: string; accountNumber: string; maskedPhone: string };
}

export function TransferConfirmPage() {
  const { confirmationToken } = useParams<{ confirmationToken: string }>();
  const { showToast } = useToast();

  const [transfer, setTransfer] = useState<PublicTransferInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!confirmationToken) return;
    try {
      const res = await api.get<{ transfer: PublicTransferInfo }>(
        `/portal/transfer-confirm/${confirmationToken}`
      );
      setTransfer(res.transfer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer link not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [confirmationToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRespond = async (action: 'ACCEPT' | 'REJECT') => {
    if (!confirmationToken) return;
    setBusy(true);
    try {
      await api.post(`/portal/transfer-confirm/${confirmationToken}/respond`, { action, otp });
      showToast(
        action === 'ACCEPT' ? 'Debt transfer accepted!' : 'Debt transfer declined',
        action === 'ACCEPT' ? 'success' : 'info'
      );
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading debt transfer details..." />;

  if (error || !transfer) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center">
          <p className="font-bold text-rose-600">{error || 'Invalid transfer link'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center mx-auto">
            <ArrowLeftRight className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Debt Transfer Confirmation</h1>
          <p className="text-xs text-slate-500">
            Reference <span className="font-mono">{transfer.referenceNumber}</span> ·{' '}
            {formatDateTime(transfer.createdAt)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">From Customer</span>
            <strong className="text-slate-900">{transfer.fromCustomer.fullName}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">To Customer</span>
            <strong className="text-slate-900">{transfer.toCustomer.fullName}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Transfer Amount</span>
            <strong className="text-rose-600 text-base tabular-nums">
              {formatKsh(transfer.amount)}
            </strong>
          </div>
          <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
            <strong>Reason:</strong> {transfer.reason}
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-xs text-slate-500">Status</span>
            <StatusBadge
              label={transfer.status}
              variant={
                transfer.status === 'COMPLETED'
                  ? 'emerald'
                  : transfer.status === 'PENDING_ACCEPTANCE'
                  ? 'amber'
                  : 'rose'
              }
            />
          </div>
        </div>

        {transfer.status === 'PENDING_ACCEPTANCE' && !transfer.expired && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Enter OTP sent to {transfer.toCustomer.maskedPhone}
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit OTP"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-center text-lg font-mono tracking-widest"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy || !otp.trim()}
                onClick={() => handleRespond('ACCEPT')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Accept Debt
              </button>
              <button
                type="button"
                disabled={busy || !otp.trim()}
                onClick={() => handleRespond('REJECT')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

