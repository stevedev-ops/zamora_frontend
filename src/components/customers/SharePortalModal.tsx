import React, { useState } from 'react';
import { Check, Copy, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { Modal } from '../common/Modal';
import { api } from '../../api/client';
import { useToast } from '../common/Toast';

export function SharePortalModal({
  open,
  onClose,
  customerId,
  customerName,
  customerPhone,
  portalUrl: initialUrl,
  whatsappShareUrl: initialWaUrl,
  onRegenerated,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerPhone: string;
  portalUrl: string;
  whatsappShareUrl?: string;
  onRegenerated?: (newUrl: string) => void;
}) {
  const { showToast } = useToast();
  const [portalUrl, setPortalUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setPortalUrl(initialUrl);
  }, [initialUrl]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    showToast('Customer debt portal link copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendSms = async () => {
    setBusy(true);
    try {
      await api.post(`/customers/${customerId}/share`, { channel: 'SMS' });
      showToast(`Portal link sent via SMS to ${customerPhone}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send SMS', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ portalUrl: string }>(
        `/customers/${customerId}/portal-link/regenerate`
      );
      setPortalUrl(res.portalUrl);
      onRegenerated?.(res.portalUrl);
      showToast('Previous link revoked & new secure link generated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to regenerate link', 'error');
    } finally {
      setBusy(false);
    }
  };

  const waUrl =
    initialWaUrl && portalUrl === initialUrl
      ? initialWaUrl
      : `https://wa.me/${customerPhone.replace(/^\+/, '')}?text=${encodeURIComponent(
          `Hello ${customerName}, view your Zamora Liquor Store itemized debt statement securely here: ${portalUrl}`
        )}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share Customer Debt Portal"
      subtitle={`${customerName} · ${customerPhone} (OTP-protected)`}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
            Secure Customer Portal Link
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={portalUrl}
              className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            The customer must verify their phone number with a one-time OTP before viewing balances
            or drinks purchased.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            Share via WhatsApp
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={handleSendSms}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Send via SMS
          </button>
        </div>

        <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">Need to revoke the old link?</span>
          <button
            type="button"
            disabled={busy}
            onClick={handleRegenerate}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Revoke & Regenerate Link
          </button>
        </div>
      </div>
    </Modal>
  );
}

