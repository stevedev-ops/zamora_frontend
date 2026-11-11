import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-lg',
  children,
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div
        className={`relative w-full ${maxWidth} rounded-t-2xl sm:rounded-xl bg-white shadow-2xl border border-slate-200 max-h-[92vh] sm:max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 sm:px-5 py-3.5 sm:py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
