import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  CloudOff,
  Download,
  Home,
  LayoutGrid,
  Menu,
  RefreshCw,
  Scale,
  ShoppingCart,
  Trash2,
  Users,
  Wifi,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useOffline } from '../../context/OfflineContext';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const {
    isOnline,
    isSyncing,
    pendingItems,
    pendingCount,
    failedCount,
    syncNow,
    retryItem,
    restockAndRetrySale,
    discardItem,
    canInstallPwa,
    promptInstallPwa,
  } = useOffline();
  const { showToast } = useToast();

  const handleRestockAndRetry = async (item: (typeof pendingItems)[number]) => {
    setReconcilingId(item.id);
    try {
      const res = await restockAndRetrySale(item);
      if (res.error) {
        showToast(res.error, 'error');
      } else if (res.synced > 0) {
        showToast(
          `Restocked ${res.restockedProducts} product(s) & synced offline sale cleanly`,
          'success'
        );
      } else {
        showToast('Reconciled stock; check remaining items in queue', 'info');
      }
    } finally {
      setReconcilingId(null);
    }
  };

  const handleManualSync = async () => {
    const res = await syncNow();
    if (res.synced > 0) {
      showToast(
        `Synced ${res.synced} offline action${res.synced === 1 ? '' : 's'} to server`,
        'success'
      );
    } else if (res.failed > 0) {
      showToast(`${res.failed} queued action(s) need review in the sync queue`, 'error');
    } else if (!navigator.onLine) {
      showToast('Still offline. Actions will sync automatically when connected.', 'error');
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 overflow-x-hidden">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print lg:hidden sticky top-0 z-20 flex items-center justify-between h-14 px-3 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg hover:bg-slate-800 shrink-0"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold text-sm truncate">Zamora Liquor</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {canInstallPwa && (
              <button
                type="button"
                onClick={() => void promptInstallPwa()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2 py-1 text-[11px] font-medium text-emerald-300"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </button>
            )}
            <button
              type="button"
              onClick={() => setQueueModalOpen(true)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                !isOnline
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : failedCount > 0
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : pendingCount > 0
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {!isOnline ? (
                <CloudOff className="h-3.5 w-3.5" />
              ) : isSyncing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              <span>
                {!isOnline
                  ? `Offline${pendingCount > 0 ? ` (${pendingCount})` : ''}`
                  : isSyncing
                    ? 'Syncing...'
                    : pendingCount > 0
                      ? `${pendingCount} Pending`
                      : failedCount > 0
                        ? `${failedCount} Failed`
                        : 'Online'}
              </span>
            </button>
          </div>
        </header>

        {/* Sticky offline/pending notice banner (visible desktop & mobile when offline or items queued) */}
        {(!isOnline || pendingCount > 0 || failedCount > 0) && (
          <div
            className={`no-print px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-2 border-b ${
              !isOnline
                ? 'bg-amber-50 text-amber-900 border-amber-200'
                : failedCount > 0
                  ? 'bg-rose-50 text-rose-900 border-rose-200'
                  : 'bg-sky-50 text-sky-900 border-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {!isOnline ? (
                <CloudOff className="h-4 w-4 shrink-0 text-amber-600" />
              ) : failedCount > 0 ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              ) : (
                <RefreshCw
                  className={`h-4 w-4 shrink-0 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`}
                />
              )}
              <span>
                {!isOnline
                  ? `Working offline — sales, customers & debt edits saved locally${
                      pendingCount > 0 ? ` (${pendingCount} waiting for internet)` : ''
                    }.`
                  : failedCount > 0
                    ? `${failedCount} offline item(s) could not sync and need attention.`
                    : `${pendingCount} offline item(s) ready to push to server.`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isOnline && pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleManualSync()}
                  disabled={isSyncing}
                  className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setQueueModalOpen(true)}
                className="rounded-md border border-current/25 px-2.5 py-1 text-[11px] font-semibold hover:bg-black/5"
              >
                View Queue ({pendingItems.length})
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-3 sm:p-5 lg:p-6 pb-24 lg:pb-6 max-w-[1600px] w-full mx-auto min-w-0">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex items-center justify-around h-16 px-1 shadow-[0_-2px_10px_rgba(15,23,42,0.06)]">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
                isActive ? 'text-emerald-600' : 'text-slate-500'
              }`
            }
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </NavLink>
          <NavLink
            to="/pos"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
                isActive ? 'text-emerald-600' : 'text-slate-500'
              }`
            }
          >
            <ShoppingCart className="h-5 w-5" />
            <span>POS</span>
          </NavLink>
          <NavLink
            to="/customers"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
                isActive ? 'text-emerald-600' : 'text-slate-500'
              }`
            }
          >
            <Users className="h-5 w-5" />
            <span>Customers</span>
          </NavLink>
          <NavLink
            to="/debt"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
                isActive ? 'text-emerald-600' : 'text-slate-500'
              }`
            }
          >
            <Scale className="h-5 w-5" />
            <span>Debt</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500"
          >
            <LayoutGrid className="h-5 w-5" />
            <span>More</span>
          </button>
        </nav>
      </div>

      {/* Offline Outbox Modal */}
      <Modal
        open={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        title="Offline Sync & Connection Status"
        subtitle={
          isOnline
            ? 'Connected — offline records sync automatically.'
            : 'Currently offline — actions saved safely in this device.'
        }
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="flex items-center gap-2.5">
              {isOnline ? (
                <Wifi className="h-5 w-5 text-emerald-600" />
              ) : (
                <CloudOff className="h-5 w-5 text-amber-600" />
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {isOnline ? 'Internet Connected' : 'Offline Mode Active'}
                </p>
                <p className="text-xs text-slate-500">
                  {pendingItems.length} item{pendingItems.length === 1 ? '' : 's'} in outbox
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={!isOnline || isSyncing || pendingItems.length === 0}
              onClick={() => void handleManualSync()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
          </div>

          {pendingItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              All changes are up to date with the server.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 ${
                    item.status === 'FAILED'
                      ? 'border-rose-200 bg-rose-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.summary}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(item.createdAt).toLocaleString()} · Status: {item.status}
                      </p>
                      {item.lastError && (
                        <p className="text-xs text-rose-700 mt-1 font-medium">{item.lastError}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {item.status === 'FAILED' &&
                        item.kind === 'CREATE_SALE' &&
                        /insufficient stock|missing batch coverage/i.test(item.lastError || '') && (
                          <button
                            type="button"
                            disabled={!isOnline || reconcilingId === item.id}
                            onClick={() => void handleRestockAndRetry(item)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                            title="Add missing stock units on server and retry this queued sale"
                          >
                            {reconcilingId === item.id ? 'Restocking...' : 'Restock & Retry'}
                          </button>
                        )}
                      {item.status === 'FAILED' && (
                        <button
                          type="button"
                          onClick={() => void retryItem(item.id)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void discardItem(item.id)}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-100"
                        title="Discard queued item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
