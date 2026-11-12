import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Scale, Search, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { formatKsh } from '../../utils/format';
import { useToast } from '../common/Toast';

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  bottleSize: string;
  barcode?: string | null;
  sellingPrice: number;
  currentStock: number;
}

export interface CustomerOption {
  id: string;
  fullName: string;
  accountNumber?: string;
}

export interface EditableItem {
  productId: string;
  productName: string;
  brand: string;
  bottleSize: string;
  unitSellingPrice: number;
  quantity: number;
}

export interface EditableSaleShare {
  id?: string;
  customerId?: string | null;
  payerName: string;
  shareTotal: number;
  cashAmount: number;
  mpesaAmount: number;
  paidAmount: number;
  debtAmount: number;
  notes?: string | null;
}

export interface EditableSaleItemInput {
  id?: string;
  productId?: string;
  productName: string;
  brand?: string;
  bottleSize?: string;
  quantity: number;
  unitSellingPrice: number;
  lineTotal: number;
  isFlagged?: boolean;
  flagNote?: string | null;
  flaggedByType?: string | null;
  flaggedAt?: string | null;
}

export interface EditableSaleInput {
  id: string;
  receiptNumber: string;
  customerId?: string | null;
  customer?: { id?: string; fullName: string; accountNumber?: string } | null;
  soldAt?: string;
  status?: string;
  paymentMethod?: string;
  subtotal?: number;
  discountAmount?: number;
  totalAmount: number;
  cashAmount?: number;
  mpesaAmount?: number;
  mpesaReference?: string | null;
  amountPaid?: number;
  outstandingAmount?: number;
  notes?: string | null;
  items: EditableSaleItemInput[];
  shares?: EditableSaleShare[];
}

export interface ShareFormRow {
  customerId: string;
  payerName: string;
  cashAmount: string;
  mpesaAmount: string;
  debtAmount: string;
  notes: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Adds `p` to `list` or increments its quantity by 1. */
export function addProductToEditableList(
  p: CatalogProduct,
  list: EditableItem[],
  setList: React.Dispatch<React.SetStateAction<EditableItem[]>>
) {
  const existing = list.find((x) => x.productId === p.id);
  if (existing) {
    setList(list.map((x) => (x.productId === p.id ? { ...x, quantity: x.quantity + 1 } : x)));
  } else {
    setList([
      ...list,
      {
        productId: p.id,
        productName: p.name,
        brand: p.brand,
        bottleSize: p.bottleSize,
        unitSellingPrice: Number(p.sellingPrice),
        quantity: 1,
      },
    ]);
  }
}

/** Increments or removes an item row by its array index. */
export function adjustEditableQtyAtIndex(
  idx: number,
  delta: number,
  list: EditableItem[],
  setList: React.Dispatch<React.SetStateAction<EditableItem[]>>
) {
  setList(
    list
      .map((x, i) => (i === idx ? { ...x, quantity: x.quantity + delta } : x))
      .filter((x) => x.quantity > 0)
  );
}

/** Proportionally scales split-payer shares so their sum matches `targetTotal`. */
export function scaleSharesToTotal(rows: ShareFormRow[], targetTotal: number): ShareFormRow[] {
  const targetCents = Math.max(0, Math.round(targetTotal * 100));
  if (rows.length === 0) return rows;

  const currentTotals = rows.map((r) => {
    const c = Math.max(0, Math.round(Number(r.cashAmount || 0) * 100));
    const m = Math.max(0, Math.round(Number(r.mpesaAmount || 0) * 100));
    const d = Math.max(0, Math.round(Number(r.debtAmount || 0) * 100));
    return { c, m, d, sum: c + m + d };
  });

  const grandCents = currentTotals.reduce((s, r) => s + r.sum, 0);
  if (grandCents === 0) {
    const even = Math.floor(targetCents / rows.length);
    let rem = targetCents - even * rows.length;
    return rows.map((r, i) => {
      const shareCents = even + (i === 0 ? rem : 0);
      rem = i === 0 ? 0 : rem;
      const amtStr = (shareCents / 100).toFixed(2);
      return r.customerId
        ? { ...r, cashAmount: '0.00', mpesaAmount: '0.00', debtAmount: amtStr }
        : { ...r, cashAmount: amtStr, mpesaAmount: '0.00', debtAmount: '0.00' };
    });
  }

  let running = 0;
  const scaled = currentTotals.map((t, idx) => {
    const rowTarget =
      idx === currentTotals.length - 1
        ? targetCents - running
        : Math.round((targetCents * t.sum) / grandCents);
    running += rowTarget;

    if (t.sum === 0) {
      return rows[idx].customerId
        ? { c: 0, m: 0, d: rowTarget }
        : { c: rowTarget, m: 0, d: 0 };
    }

    const c = Math.round((rowTarget * t.c) / t.sum);
    const m = Math.round((rowTarget * t.m) / t.sum);
    const d = rowTarget - c - m;
    return { c, m, d };
  });

  return rows.map((r, idx) => ({
    ...r,
    cashAmount: (scaled[idx].c / 100).toFixed(2),
    mpesaAmount: (scaled[idx].m / 100).toFixed(2),
    debtAmount: (scaled[idx].d / 100).toFixed(2),
  }));
}

interface SaleEditorFormProps {
  sale: EditableSaleInput;
  products: CatalogProduct[];
  customers?: CustomerOption[];
  onSuccess?: () => void | Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function SaleEditorForm({
  sale,
  products,
  customers = [],
  onSuccess,
  onCancel,
  submitLabel = 'Save Changes',
}: SaleEditorFormProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<EditableItem[]>([]);
  const [discount, setDiscount] = useState('0');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [searchAdd, setSearchAdd] = useState('');
  const [overrideLimit, setOverrideLimit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Payment fields for single-payer / walk-in receipts
  const [editPaymentAmounts, setEditPaymentAmounts] = useState(false);
  const [cashPaid, setCashPaid] = useState('0');
  const [mpesaPaid, setMpesaPaid] = useState('0');
  const [mpesaRef, setMpesaRef] = useState('');
  const manualPayRef = useRef(false);

  // Multi-person split shares
  const [shareRows, setShareRows] = useState<ShareFormRow[]>([]);

  const isMultiShare = (sale.shares?.length ?? 0) > 1;
  const isWalkIn = !sale.customerId && !isMultiShare;

  useEffect(() => {
    setDiscount(String(Number(sale.discountAmount || 0)));
    setNote(sale.notes || '');
    setReason('');
    setSearchAdd('');
    setOverrideLimit(false);
    setCashPaid(Number(sale.cashAmount ?? 0).toFixed(2));
    setMpesaPaid(Number(sale.mpesaAmount ?? 0).toFixed(2));
    setMpesaRef(sale.mpesaReference || '');
    setEditPaymentAmounts(isWalkIn);
    manualPayRef.current = false;

    setItems(
      sale.items.map((it) => {
        const matchedProduct =
          products.find((p) => p.id === it.productId) ||
          products.find((p) => p.name.toLowerCase() === it.productName.toLowerCase());
        return {
          productId: it.productId || matchedProduct?.id || '',
          productName: it.productName,
          brand: it.brand || matchedProduct?.brand || '',
          bottleSize: it.bottleSize || matchedProduct?.bottleSize || '',
          unitSellingPrice: Number(it.unitSellingPrice),
          quantity: Number(it.quantity),
        };
      })
    );

    if (sale.shares && sale.shares.length > 1) {
      setShareRows(
        sale.shares.map((sh) => ({
          customerId: sh.customerId || '',
          payerName: sh.payerName || '',
          cashAmount: Number(sh.cashAmount || 0).toFixed(2),
          mpesaAmount: Number(sh.mpesaAmount || 0).toFixed(2),
          debtAmount: Number(sh.debtAmount || 0).toFixed(2),
          notes: sh.notes || '',
        }))
      );
    } else {
      setShareRows([]);
    }
  }, [sale, products, isWalkIn]);

  const filteredAddProducts = useMemo(() => {
    const q = searchAdd.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [products, searchAdd]);

  const subtotal = items.reduce((s, it) => s + it.unitSellingPrice * it.quantity, 0);
  const discountVal =
    items.length === 0 ? 0 : Math.min(subtotal, Math.max(0, Number(discount || 0)));
  const updatedTotal = Math.max(0, round2(subtotal - discountVal));
  const originalTotal = Number(sale.totalAmount || 0);
  const originalPaid = Number(sale.amountPaid ?? 0);

  // Keep Walk-in Cash / M-Pesa synced automatically to updatedTotal unless user edited them directly
  useEffect(() => {
    if (!isWalkIn || manualPayRef.current) return;
    if (items.length === 0) {
      setCashPaid('0.00');
      setMpesaPaid('0.00');
      return;
    }
    const oldCash = Number(sale.cashAmount ?? 0);
    const oldMpesa = Number(sale.mpesaAmount ?? 0);
    const oldPaid = oldCash + oldMpesa;
    if (sale.paymentMethod === 'MPESA' || (oldMpesa > 0 && oldCash === 0)) {
      setCashPaid('0.00');
      setMpesaPaid(updatedTotal.toFixed(2));
    } else if (sale.paymentMethod === 'CASH' || (oldCash > 0 && oldMpesa === 0) || oldPaid <= 0) {
      setCashPaid(updatedTotal.toFixed(2));
      setMpesaPaid('0.00');
    } else {
      const scaledCash = round2((updatedTotal * oldCash) / oldPaid);
      setCashPaid(scaledCash.toFixed(2));
      setMpesaPaid(round2(updatedTotal - scaledCash).toFixed(2));
    }
  }, [updatedTotal, items.length, isWalkIn, sale.cashAmount, sale.mpesaAmount, sale.paymentMethod]);

  const shareRowTotals = shareRows.map((r) => {
    const c = Math.max(0, Number(r.cashAmount || 0));
    const m = Math.max(0, Number(r.mpesaAmount || 0));
    const d = Math.max(0, Number(r.debtAmount || 0));
    return { c, m, d, sum: round2(c + m + d) };
  });
  const splitSum = round2(shareRowTotals.reduce((s, x) => s + x.sum, 0));
  const splitDiff = round2(updatedTotal - splitSum);

  const cashVal = Math.max(0, Number(cashPaid || 0));
  const mpesaVal = Math.max(0, Number(mpesaPaid || 0));
  const singlePaidVal = editPaymentAmounts
    ? round2(cashVal + mpesaVal)
    : items.length === 0
      ? 0
      : Math.min(updatedTotal, originalPaid);
  const projectedDebt = isMultiShare
    ? round2(shareRowTotals.reduce((s, x) => s + x.d, 0))
    : isWalkIn
      ? 0
      : Math.max(0, round2(updatedTotal - singlePaidVal));
  const debtDelta = round2(projectedDebt - Number(sale.outstandingAmount || 0));

  const updateShareField = (idx: number, patch: Partial<ShareFormRow>) => {
    setShareRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.some((it) => !it.productId)) {
      showToast('Some older items could not be matched to an active product.', 'error');
      return;
    }

    if (items.length > 0 && isMultiShare && Math.abs(splitDiff) > 0.01) {
      showToast(
        `Split shares total (${formatKsh(splitSum)}) must equal updated receipt total (${formatKsh(
          updatedTotal
        )}). Click "Scale Shares to Match Total" or adjust shares.`,
        'error'
      );
      return;
    }

    if (items.length > 0 && isWalkIn && Math.abs(round2(cashVal + mpesaVal) - updatedTotal) > 0.01) {
      showToast(
        `Walk-in Cash + M-Pesa (${formatKsh(cashVal + mpesaVal)}) must equal updated total (${formatKsh(
          updatedTotal
        )}).`,
        'error'
      );
      return;
    }

    if (items.length > 0 && !isWalkIn && !isMultiShare && editPaymentAmounts) {
      if (cashVal + mpesaVal > updatedTotal + 0.01) {
        showToast('Combined Cash and M-Pesa cannot exceed the updated total.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        items: items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
        discountAmount: discountVal,
        notes: note.trim() ? note.trim() : null,
        reason: reason.trim() || undefined,
        allowCreditLimitOverride: overrideLimit,
        mpesaReference: mpesaRef.trim() || null,
      };

      if (items.length > 0 && isMultiShare) {
        payload.splitShares = shareRows.map((sh) => ({
          customerId: sh.customerId || null,
          payerName: sh.payerName.trim() || null,
          cashAmount: Math.max(0, Number(sh.cashAmount || 0)),
          mpesaAmount: Math.max(0, Number(sh.mpesaAmount || 0)),
          debtAmount: Math.max(0, Number(sh.debtAmount || 0)),
          notes: sh.notes.trim() || null,
        }));
      } else if (items.length > 0 && editPaymentAmounts) {
        payload.cashAmount = cashVal;
        payload.mpesaAmount = mpesaVal;
      }

      const res = await api.patch<{ offlineQueued?: boolean }>(`/sales/${sale.id}/items`, payload);

      showToast(
        res.offlineQueued
          ? 'Receipt edit saved offline and queued for sync.'
          : items.length === 0
            ? `Voided ${sale.receiptNumber} and returned all drinks to stock.`
            : `Updated ${sale.receiptNumber} (${formatKsh(updatedTotal)}).`,
        'success'
      );
      await Promise.resolve(onSuccess?.());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update receipt', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drinks list */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Drinks on Receipt ({items.reduce((s, it) => s + it.quantity, 0)})
          </p>
          {items.length === 0 && (
            <span className="text-[11px] font-semibold text-rose-600">
              Will void receipt & return all drinks to stock
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            All drinks removed from this receipt. Click{' '}
            <strong>Void Receipt &amp; Restore Stock</strong> below to void it, adjust any debt or
            payments, and return the bottles to inventory.
          </div>
        ) : (
          items.map((it, idx) => (
            <div
              key={`${it.productId || it.productName}-${idx}`}
              className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{it.productName}</p>
                <p className="text-xs text-slate-500">
                  {formatKsh(it.unitSellingPrice)} × {it.quantity} ={' '}
                  <span className="font-semibold text-slate-700">
                    {formatKsh(it.unitSellingPrice * it.quantity)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => adjustEditableQtyAtIndex(idx, -1, items, setItems)}
                  className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-semibold">{it.quantity}</span>
                <button
                  type="button"
                  onClick={() => adjustEditableQtyAtIndex(idx, 1, items, setItems)}
                  className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  className="h-7 w-7 rounded-md text-rose-500 hover:bg-rose-50 flex items-center justify-center ml-1"
                  title="Remove drink"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}

        {/* Quick Search to add drink */}
        <div className="pt-2 border-t border-slate-200">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchAdd}
              onChange={(e) => setSearchAdd(e.target.value)}
              placeholder="Type to add another drink to this receipt..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>
          {filteredAddProducts.length > 0 && (
            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
              {filteredAddProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.currentStock <= 0}
                  onClick={() => {
                    addProductToEditableList(p, items, setItems);
                    setSearchAdd('');
                  }}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs hover:border-emerald-400 disabled:opacity-40"
                >
                  <span className="truncate font-medium text-slate-800">
                    + {p.name} ({p.bottleSize})
                  </span>
                  <span className="font-semibold text-emerald-700 shrink-0 ml-2">
                    {formatKsh(p.sellingPrice)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Multi-person split shares editor */}
      {isMultiShare && items.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-amber-700" />
              <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                Multi-Person Split Payers ({shareRows.length})
              </p>
            </div>
            <div className="flex items-center gap-2">
              {Math.abs(splitDiff) > 0.01 && (
                <button
                  type="button"
                  onClick={() => setShareRows((prev) => scaleSharesToTotal(prev, updatedTotal))}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                >
                  <Scale className="h-3 w-3" /> Scale Shares to Match Total
                </button>
              )}
              {shareRows.length < 10 && (
                <button
                  type="button"
                  onClick={() =>
                    setShareRows((prev) => [
                      ...prev,
                      {
                        customerId: '',
                        payerName: '',
                        cashAmount: '0.00',
                        mpesaAmount: '0.00',
                        debtAmount: '0.00',
                        notes: '',
                      },
                    ])
                  }
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                >
                  + Payer
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
            {shareRows.map((row, idx) => (
              <div key={idx} className="rounded-lg border border-amber-200 bg-white p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-600">Person {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Share: {formatKsh(shareRowTotals[idx]?.sum ?? 0)}
                    </span>
                    {shareRows.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setShareRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700"
                        title="Remove payer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {customers.length > 0 ? (
                    <select
                      value={row.customerId}
                      onChange={(e) => {
                        const cust = customers.find((c) => c.id === e.target.value);
                        updateShareField(idx, {
                          customerId: e.target.value,
                          payerName: cust ? cust.fullName : row.payerName,
                          ...(e.target.value ? {} : { debtAmount: '0.00' }),
                        });
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs bg-white"
                    >
                      <option value="">Walk-in Payer (No Debt)</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName} {c.accountNumber ? `(${c.accountNumber})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    type="text"
                    value={row.payerName}
                    onChange={(e) => updateShareField(idx, { payerName: e.target.value })}
                    placeholder="Payer name"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500">Cash</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.cashAmount}
                      onChange={(e) => updateShareField(idx, { cashAmount: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">M-Pesa</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.mpesaAmount}
                      onChange={(e) => updateShareField(idx, { mpesaAmount: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Debt</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!row.customerId}
                      value={row.debtAmount}
                      onChange={(e) => updateShareField(idx, { debtAmount: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-200">
            <span className="text-amber-900">
              Shares Total: <strong>{formatKsh(splitSum)}</strong>
            </span>
            <span
              className={`font-bold ${
                Math.abs(splitDiff) > 0.01 ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {Math.abs(splitDiff) > 0.01
                ? `Remaining to allocate: ${formatKsh(splitDiff)}`
                : 'Matches updated total'}
            </span>
          </div>
        </div>
      )}

      {/* Payment editing for Walk-in OR optional payment override on Single-Customer sale */}
      {!isMultiShare && items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">
              {isWalkIn ? 'Walk-in Payment Breakdown' : 'Receipt Payment Breakdown'}
            </p>
            {!isWalkIn && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPaymentAmounts}
                  onChange={(e) => {
                    setEditPaymentAmounts(e.target.checked);
                    manualPayRef.current = e.target.checked;
                  }}
                  className="rounded border-slate-300 text-emerald-600"
                />
                Adjust Cash / M-Pesa paid
              </label>
            )}
          </div>

          {!isWalkIn && !editPaymentAmounts && updatedTotal < originalPaid && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
              Updated total ({formatKsh(updatedTotal)}) is below previous payment (
              {formatKsh(originalPaid)}). Cash/M-Pesa paid on this receipt will auto-adjust down to{' '}
              <strong>{formatKsh(updatedTotal)}</strong>.
            </p>
          )}

          {(isWalkIn || editPaymentAmounts) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  Cash Paid (KSh)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashPaid}
                  onChange={(e) => {
                    manualPayRef.current = true;
                    setCashPaid(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  M-Pesa Paid (KSh)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mpesaPaid}
                  onChange={(e) => {
                    manualPayRef.current = true;
                    setMpesaPaid(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  M-Pesa Ref
                </label>
                <input
                  type="text"
                  value={mpesaRef}
                  onChange={(e) => setMpesaRef(e.target.value)}
                  placeholder="Optional code"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Optional Note (visible on portal/receipt)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Swapped wrong bottle"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Discount (KSh)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Adjustment Reason (optional)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Wrong drink rung up or customer returned unopened bottle"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {!isWalkIn && (
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={overrideLimit}
            onChange={(e) => setOverrideLimit(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Allow exceeding customer credit limit if needed
        </label>
      )}

      <div className="rounded-xl bg-slate-900 text-white p-3.5 grid grid-cols-3 gap-2 text-center sm:text-left">
        <div>
          <p className="text-[11px] text-slate-400">Original Total</p>
          <p className="text-sm font-semibold">{formatKsh(originalTotal)}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400">Updated Total</p>
          <p className="text-sm font-bold text-white">{formatKsh(updatedTotal)}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400">
            {isWalkIn ? 'Total Change' : 'Debt Change'}
          </p>
          <p
            className={`text-sm font-bold ${
              (isWalkIn ? updatedTotal - originalTotal : debtDelta) > 0
                ? 'text-amber-400'
                : (isWalkIn ? updatedTotal - originalTotal : debtDelta) < 0
                  ? 'text-emerald-400'
                  : 'text-slate-300'
            }`}
          >
            {(() => {
              const d = isWalkIn ? round2(updatedTotal - originalTotal) : debtDelta;
              return d >= 0 ? `+${formatKsh(d)}` : formatKsh(d);
            })()}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || (items.length > 0 && isMultiShare && Math.abs(splitDiff) > 0.01)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            items.length === 0
              ? 'bg-rose-600 hover:bg-rose-700'
              : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          {submitting
            ? 'Saving...'
            : items.length === 0
              ? 'Void Receipt & Restore Stock'
              : submitLabel}
        </button>
      </div>
    </form>
  );
}

