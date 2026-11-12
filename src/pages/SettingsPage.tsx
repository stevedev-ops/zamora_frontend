import React, { useCallback, useEffect, useState } from 'react';
import { Database, KeyRound, Save } from 'lucide-react';
import { api, downloadBinaryFile } from '../api/client';
import { ExportButtons } from '../components/common/ExportButtons';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { formatDateTime } from '../utils/format';

interface StoreSettings {
  storeName: string;
  storePhone: string;
  storeEmail: string | null;
  storeAddress: string;
  currency: string;
  receiptFooter: string;
  mpesaEnabled: boolean;
  mpesaPaybillOrTill: string | null;
  mpesaAccountReference: string | null;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  portalRequireOtp: boolean;
  defaultCreditLimit: number;
  lowStockDefaultAlert: number;
  overdueDaysThreshold: number;
}

interface AuditRow {
  id: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

interface NotificationRow {
  id: string;
  channel: string;
  recipient: string;
  eventType: string;
  subject: string | null;
  message: string;
  status: string;
  provider: string;
  createdAt: string;
}

export function SettingsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'store' | 'security' | 'audit' | 'notifications'>('store');
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const loadAll = useCallback(async () => {
    try {
      const [sRes, aRes, nRes] = await Promise.all([
        api.get<{ settings: StoreSettings }>('/settings'),
        api.get<{ logs: AuditRow[] }>('/settings/audit-logs?limit=100'),
        api.get<{ notifications: NotificationRow[] }>('/settings/notifications?limit=100'),
      ]);
      setSettings(sRes.settings);
      setAuditLogs(aRes.logs);
      setNotifications(nRes.notifications);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      const payload = {
        storeName: settings.storeName.trim(),
        storePhone: settings.storePhone.trim(),
        storeEmail: settings.storeEmail?.trim() || null,
        storeAddress: settings.storeAddress.trim(),
        currency: settings.currency.trim() || 'KSh',
        receiptFooter: settings.receiptFooter.trim(),
        mpesaEnabled: settings.mpesaEnabled,
        mpesaPaybillOrTill: settings.mpesaPaybillOrTill?.trim() || null,
        mpesaAccountReference: settings.mpesaAccountReference?.trim() || null,
        smsEnabled: settings.smsEnabled,
        whatsappEnabled: settings.whatsappEnabled,
        defaultCreditLimit: Number(settings.defaultCreditLimit) || 0,
        lowStockDefaultAlert: Number(settings.lowStockDefaultAlert) || 0,
        overdueDaysThreshold: Math.max(1, Number(settings.overdueDaysThreshold) || 14),
        portalRequireOtp: settings.portalRequireOtp,
      };
      const res = await api.patch<{ settings: StoreSettings }>('/settings', payload);
      setSettings(res.settings);
      showToast('Store settings saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Owner password updated successfully', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Password change failed', 'error');
    }
  };

  if (loading || !settings) return <LoadingState label="Loading settings..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings, Backups & Audit Logs</h1>
          <p className="text-sm text-slate-500">
            Configure store identity, M-Pesa/SMS integrations, password, backups, and security logs
          </p>
        </div>
        <button
          onClick={() =>
            downloadBinaryFile(
              '/settings/backup',
              `zamora-backup-${new Date().toISOString().slice(0, 10)}.json`
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Database className="h-4 w-4" />
          Download Full DB Backup (JSON)
        </button>
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {(
          [
            ['store', 'Store & Integrations'],
            ['security', 'Password & Security'],
            ['audit', `Audit Logs (${auditLogs.length})`],
            ['notifications', `Notifications (${notifications.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap ${
              tab === k
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'store' && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 max-w-3xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Store Name
              </label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Store Phone
              </label>
              <input
                type="text"
                required
                value={settings.storePhone}
                onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Store Email
              </label>
              <input
                type="email"
                value={settings.storeEmail || ''}
                onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Store Address
              </label>
              <input
                type="text"
                required
                value={settings.storeAddress}
                onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                M-Pesa Till / Paybill Number
              </label>
              <input
                type="text"
                value={settings.mpesaPaybillOrTill || ''}
                onChange={(e) => setSettings({ ...settings, mpesaPaybillOrTill: e.target.value })}
                placeholder="e.g. Till 123456 or Paybill 522533"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Buy Goods Till Number or Paybill shown on receipts &amp; customer debt portal.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                M-Pesa Account Reference (Paybill)
              </label>
              <input
                type="text"
                value={settings.mpesaAccountReference || ''}
                onChange={(e) =>
                  setSettings({ ...settings, mpesaAccountReference: e.target.value })
                }
                placeholder="e.g. ZAMORA (optional for Till)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Account ref for Paybill payments; leave blank when using a Buy Goods Till Number.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Default Customer Credit Limit (KSh)
              </label>
              <input
                type="number"
                min="0"
                value={settings.defaultCreditLimit}
                onChange={(e) =>
                  setSettings({ ...settings, defaultCreditLimit: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Overdue Reminder Threshold (Days)
              </label>
              <input
                type="number"
                min="1"
                value={settings.overdueDaysThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, overdueDaysThreshold: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Currency Label
              </label>
              <input
                type="text"
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Receipt Footer Message
            </label>
            <input
              type="text"
              value={settings.receiptFooter}
              onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={settings.mpesaEnabled}
                onChange={(e) => setSettings({ ...settings, mpesaEnabled: e.target.checked })}
              />
              Enable M-Pesa STK Push
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={settings.smsEnabled}
                onChange={(e) => setSettings({ ...settings, smsEnabled: e.target.checked })}
              />
              Enable SMS Notifications
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={settings.whatsappEnabled}
                onChange={(e) => setSettings({ ...settings, whatsappEnabled: e.target.checked })}
              />
              Enable WhatsApp Integration
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(settings.portalRequireOtp)}
                onChange={(e) => setSettings({ ...settings, portalRequireOtp: e.target.checked })}
              />
              <span>
                Require SMS OTP verification before customers open portal links{' '}
                <span className="text-xs text-slate-500 font-normal">
                  (off = opens debt balance & drinks directly)
                </span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Save className="h-4 w-4" /> Save Settings
          </button>
        </form>
      )}

      {tab === 'security' && (
        <form
          onSubmit={handleChangePassword}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 max-w-md"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-slate-700" />
            <h2 className="text-base font-bold text-slate-900">Change Owner Password</h2>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Current Password
            </label>
            <input
              type="password"
              required
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={pwForm.newPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Update Password
          </button>
        </form>
      )}

      {tab === 'audit' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Showing latest {auditLogs.length} audit entries</p>
            <ExportButtons
              compact
              filenameBase="zamora-audit-logs"
              pdfPath="/settings/audit-logs/export/pdf"
              excelPath="/settings/audit-logs/export/excel"
              csvPath="/settings/audit-logs/export/csv"
              localCsv={{
                columns: [
                  { header: 'Timestamp', value: (r) => r.createdAt },
                  { header: 'Actor', value: (r) => r.user?.name || r.actorType },
                  { header: 'Action', value: (r) => r.action },
                  { header: 'Entity Type', value: (r) => r.entityType },
                  { header: 'Entity ID', value: (r) => r.entityId || '' },
                ],
                rows: auditLogs,
              }}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Timestamp</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {log.user ? log.user.name : log.actorType}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge label={log.action} variant="slate" />
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-600">
                    {log.entityType} {log.entityId ? `· ${log.entityId.slice(0, 8)}...` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing latest {notifications.length} notification logs
            </p>
            <ExportButtons
              compact
              filenameBase="zamora-notifications"
              pdfPath="/settings/notifications/export/pdf"
              excelPath="/settings/notifications/export/excel"
              csvPath="/settings/notifications/export/csv"
              localCsv={{
                columns: [
                  { header: 'Date', value: (r) => r.createdAt },
                  { header: 'Channel', value: (r) => r.channel },
                  { header: 'Recipient', value: (r) => r.recipient },
                  { header: 'Event', value: (r) => r.eventType },
                  { header: 'Status', value: (r) => r.status },
                  { header: 'Message', value: (r) => r.message },
                ],
                rows: notifications,
              }}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Channel</th>
                <th className="px-4 py-3 text-left">Recipient</th>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">Message</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTime(n.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold">{n.channel}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{n.recipient}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge label={n.eventType} variant="blue" />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700 max-w-md">{n.message}</td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge
                      label={n.status}
                      variant={n.status === 'SENT' ? 'emerald' : 'rose'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}

