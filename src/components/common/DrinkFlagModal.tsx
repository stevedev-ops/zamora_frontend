import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';

export interface FlaggedDrinkItem {
  id: string;
  productName: string;
  brand?: string;
  bottleSize?: string;
  quantity: number;
  lineTotal?: number;
  isFlagged?: boolean;
  flagNote?: string | null;
  flaggedByType?: string | null;
  flaggedAt?: string | null;
}

export interface DrinkFlagTarget {
  item: FlaggedDrinkItem;
  receiptNumber?: string;
}

export function DrinkFlagBadge({ item }: { item: FlaggedDrinkItem }) {
  if (!item.isFlagged) return null;

  const actorLabel =
    item.flaggedByType === 'CUSTOMER'
      ? 'Customer'
      : item.flaggedByType === 'OWNER'
      ? 'Shop Owner'
      : 'Marked';

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="inline-flex items-center gap-1 rounded bg-rose-100 border border-rose-300 px-1.5 py-0.5 font-bold text-rose-800">
        <span aria-hidden="true" className="text-sm leading-none">
          *
        </span>
        Marked by {actorLabel}
      </span>
      {item.flagNote && (
        <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 font-medium text-amber-900">
          {item.flagNote}
        </span>
      )}
    </div>
  );
}

export function DrinkFlagButton({
  item,
  onClick,
}: {
  item: FlaggedDrinkItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        item.isFlagged
          ? 'View, edit note, or remove * mark'
          : 'Put an asterisk (*) mark on this drink'
      }
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${
        item.isFlagged
          ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800'
      }`}
    >
      <span className="text-sm leading-none">*</span>
      <span>{item.isFlagged ? 'Marked' : 'Mark'}</span>
    </button>
  );
}

interface DrinkFlagModalProps {
  target: DrinkFlagTarget | null;
  onClose: () => void;
  onSave: (payload: { saleItemId: string; isFlagged: boolean; flagNote: string | null }) => Promise<void>;
}

/** Shared modal for Owner and Portal Customer to mark/unmark a drink with an asterisk (*) and optional note. */
export function DrinkFlagModal({ target, onClose, onSave }: DrinkFlagModalProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(target?.item.flagNote || '');
  }, [target]);

  if (!target) return null;

  const { item, receiptNumber } = target;
  const actorText =
    item.flaggedByType === 'CUSTOMER'
      ? 'Customer'
      : item.flaggedByType === 'OWNER'
      ? 'Shop Owner'
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        saleItemId: item.id,
        isFlagged: true,
        flagNote: note.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFlag = async () => {
    setSaving(true);
    try {
      await onSave({
        saleItemId: item.id,
        isFlagged: false,
        flagNote: null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={item.isFlagged ? 'Marked Drink (*)' : 'Mark Drink with Asterisk (*)'}
      subtitle={`${item.productName}${item.bottleSize ? ` (${item.bottleSize})` : ''} × ${item.quantity}${
        receiptNumber ? ` · Receipt ${receiptNumber}` : ''
      }`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {item.isFlagged && actorText && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            Currently marked with <strong>*</strong> by <strong>{actorText}</strong>. Both the shop
            owner and customer can see this mark.
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
            Reason / Note (optional)
          </label>
          <textarea
            rows={3}
            maxLength={240}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Wrong bottle recorded, price mistake, double entry, or confirm with owner..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Visible on both the shop owner account view and the customer portal.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {item.isFlagged && (
            <button
              type="button"
              disabled={saving}
              onClick={handleRemoveFlag}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              Remove * Mark
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : item.isFlagged ? 'Update * Mark' : 'Put * Mark'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

