import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { OutboxItem, outboxList } from '../offline/offlineDb';
import {
  discardOutboxItem,
  flushOutbox,
  getSyncMeta,
  restockAndRetryOfflineSale,
  retryOutboxItem,
  subscribeSyncState,
} from '../offline/syncManager';
import { api } from '../api/client';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface OfflineContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: number | null;
  pendingItems: OutboxItem[];
  pendingCount: number;
  failedCount: number;
  syncNow: () => Promise<{ synced: number; failed: number }>;
  retryItem: (id: string) => Promise<void>;
  restockAndRetrySale: (item: OutboxItem) => Promise<{
    restockedProducts: number;
    synced: number;
    failed: number;
    error?: string;
  }>;
  discardItem: (id: string) => Promise<void>;
  canInstallPwa: boolean;
  promptInstallPwa: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingItems, setPendingItems] = useState<OutboxItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const refreshOutbox = useCallback(async () => {
    const items = await outboxList();
    setPendingItems(items);
    const meta = getSyncMeta();
    setIsSyncing(meta.isSyncing);
    setLastSyncAt(meta.lastSyncAt);
  }, []);

  const syncNow = useCallback(async () => {
    const res = await flushOutbox();
    await refreshOutbox();
    return res;
  }, [refreshOutbox]);

  // Pre-warm owner offline data caches when online & authenticated
  const warmOfflineCache = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      await api.get('/auth/me');
    } catch {
      return;
    }
    try {
      await Promise.allSettled([
        api.get('/products?status=ACTIVE'),
        api.get('/products?activeOnly=true'),
        api.get('/products'),
        api.get('/customers?'),
        api.get('/customers'),
        api.get('/customers?status=ACTIVE'),
        api.get('/categories'),
        api.get('/settings'),
        api.get('/dashboard?period=daily'),
        api.get('/inventory'),
        api.get('/inventory?lowStockOnly=false'),
        api.get('/inventory/movements?limit=100'),
        api.get('/purchases'),
        api.get('/suppliers'),
        api.get('/expenses'),
        api.get('/debt/transactions?'),
        api.get('/debt/transfers'),
        api.get('/debt/clarifications'),
      ]);
    } catch {
      // ignore background warm failures
    }
  }, []);

  useEffect(() => {
    void refreshOutbox();
    const unsubscribe = subscribeSyncState(() => {
      void refreshOutbox();
    });

    const handleOnline = () => {
      setIsOnline(true);
      void flushOutbox().then(() => {
        void warmOfflineCache();
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TRIGGER_OUTBOX_SYNC') {
        void flushOutbox();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    // Try syncing and warming offline cache if online on boot
    let bootWarmTimer: number | undefined;
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void flushOutbox();
      bootWarmTimer = window.setTimeout(() => {
        void warmOfflineCache();
      }, 1500);
    }

    // Periodic gentle sync check every 30s when online and queue has pending items
    const timer = window.setInterval(() => {
      if (navigator.onLine) {
        void outboxList().then((items) => {
          if (items.some((i) => i.status === 'PENDING')) {
            void flushOutbox();
          }
        });
      }
    }, 30000);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
      window.clearInterval(timer);
      if (bootWarmTimer) window.clearTimeout(bootWarmTimer);
    };
  }, [refreshOutbox, warmOfflineCache]);

  const retryItem = async (id: string) => {
    await retryOutboxItem(id);
    await refreshOutbox();
  };

  const restockAndRetrySale = async (item: OutboxItem) => {
    const res = await restockAndRetryOfflineSale(item);
    await refreshOutbox();
    return res;
  };

  const discardItem = async (id: string) => {
    await discardOutboxItem(id);
    await refreshOutbox();
  };

  const promptInstallPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const pendingCount = pendingItems.filter((i) => i.status !== 'FAILED').length;
  const failedCount = pendingItems.filter((i) => i.status === 'FAILED').length;

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        lastSyncAt,
        pendingItems,
        pendingCount,
        failedCount,
        syncNow,
        retryItem,
        restockAndRetrySale,
        discardItem,
        canInstallPwa: Boolean(installPrompt),
        promptInstallPwa,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used inside OfflineProvider');
  return ctx;
}
