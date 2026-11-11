import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 shadow-lg text-sm font-medium ${
              t.variant === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : t.variant === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            {t.variant === 'success' && (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            {t.variant === 'error' && (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            {t.variant === 'info' && <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

