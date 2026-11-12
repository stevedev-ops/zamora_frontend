import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Pencil, Plus, Search, Trash2, Wine } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { formatKsh } from '../../utils/format';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';
import {
  addProductToEditableList,
  adjustEditableQtyAtIndex,
  CatalogProduct,
  CustomerOption,
  EditableItem,
  EditableSaleItemInput,
  EditableSaleShare,
  SaleEditorForm,
} from '../sales/SaleEditorForm';

export type DebtTabSaleItemInput = EditableSaleItemInput;

export interface DebtTabSaleInput {
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
  items: DebtTabSaleItemInput[];
  shares?: EditableSaleShare[];
}

export interface DebtTabCustomerInfo {
  id: string;
  fullName: string;
  accountNumber?: string;
  currentDebt: number;
  creditLimit?: number;
}

export interface CustomerProfileSalesPayload {
  customer?: { sales?: DebtTabSaleInput[] } | null;
  sales?: DebtTabSaleInput[];
}

/** Extracts `sales` regardless of whether an endpoint/cache wraps them under `customer`. */
export function extractCustomerProfileSales(
  payload?: CustomerProfileSalesPayload | null
): DebtTabSaleInput[] {
  return payload?.customer?.sales ?? payload?.sales ?? [];
}

interface CustomerDebtTabModalProps {
  open: boolean;
  onClose: () => void;
  customer: DebtTabCustomerInfo | null;
  initialMode?: 'add' | 'edit';
  initialSaleId?: string | null;
  existingSales?: DebtTabSaleInput[];
  onSuccess?: () => void;
}

export function CustomerDebtTabModal({
  open,
  onClose,
  customer,
  initialMode = 'add',
  initialSaleId = null,
  existingSales,
  onSuccess,
}: CustomerDebtTabModalProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'add' | 'edit'>(initialMode);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [sales, setSales] = useState<DebtTabSaleInput[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Add-to-tab state
  const [searchAdd, setSearchAdd] = useState('');
  const [addItems, setAddItems] = useState<EditableItem[]>([]);
  const [addDiscount, setAddDiscount] = useState('');
  const [addNote, setAddNote] = useState('');
  const [overrideLimit, setOverrideLimit] = useState(false);

  // Selected receipt to edit
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');

  useEffect(() => {
    if (!open || !customer) return;

    setMode(initialSaleId ? 'edit' : initialMode);
    setAddItems([]);
    setAddDiscount('');
    setAddNote('');
    setSearchAdd('');
    setOverrideLimit(false);

    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      try {
        const [prodRes, profileRes, custListRes] = await Promise.all([
          api.get<{ products: CatalogProduct[] }>('/products?activeOnly=true'),
          !customer.id.startsWith('tmp-')
            ? api
                .get<CustomerProfileSalesPayload>(`/customers/${customer.id}`)
                .catch(() => ({ sales: existingSales ?? [] }))
            : Promise.resolve({ sales: existingSales ?? [] }),
          api.get<{ customers: CustomerOption[] }>('/customers').catch(() => ({ customers: [] })),
        ]);
        if (cancelled) return;

        const catalog = prodRes.products || [];
        setProducts(catalog);
        setCustomers(custListRes.customers || []);
        const fetchedSales = extractCustomerProfileSales(profileRes);
        const rawSales = (fetchedSales.length > 0 ? fetchedSales : existingSales || []).filter(
          (s) => s.status !== 'VOIDED'
        );
        setSales(rawSales);

        const targetSale =
          (initialSaleId ? rawSales.find((s) => s.id === initialSaleId) : null) ||
          rawSales.find((s) => Number(s.outstandingAmount ?? s.totalAmount) > 0) ||
          rawSales[0];

        setSelectedSaleId(targetSale?.id || '');
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to load drink catalog', 'error');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id, initialMode, initialSaleId]);

  const filteredAddProducts = useMemo(() => {
    const q = searchAdd.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .slice(0, 24);
  }, [products, searchAdd]);

  // Calculations for Add Mode
  const addSubtotal = addItems.reduce((s, it) => s + it.unitSellingPrice * it.quantity, 0);
  const addDiscountVal = Math.min(addSubtotal, Math.max(0, Number(addDiscount || 0)));
  const addTotal = Math.max(0, addSubtotal - addDiscountVal);
  const projectedBalanceAfterAdd = Number(customer?.currentDebt || 0) + addTotal;

  const selectedSale = sales.find((s) => s.id === selectedSaleId) || null;

  const handleAddDrinksSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    if (addItems.length === 0) {
      showToast('Select at least one drink to add to debt', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ offlineQueued?: boolean }>('/sales', {
        customerId: customer.id,
        items: addItems.map((it) => ({ productId: it.productId, quantity: it.quantity })),
        discountAmount: addDiscountVal,
        paymentMethod: 'CREDIT',
        notes: addNote.trim() || undefined,
        allowCreditLimitOverride: overrideLimit,
      });

      showToast(
        res.offlineQueued
          ? `Added ${formatKsh(addTotal)} to ${customer.fullName}'s offline tab (will sync online).`
          : `Added drinks (${formatKsh(addTotal)}) to ${customer.fullName}'s debt.`,
        'success'
      );
      await Promise.resolve(onSuccess?.());
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to add drinks to debt', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!customer) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Manage Drink Tab — ${customer.fullName}`}
      subtitle={`${customer.accountNumber ? `${customer.accountNumber} · ` : ''}Current Debt: ${formatKsh(
        customer.currentDebt
      )}`}
      maxWidth="max-w-2xl"
    >
      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 mb-4">
        <button
          type="button"
          onClick={() => setMode('add')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold transition-colors ${
            mode === 'add'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Plus className="h-4 w-4 text-emerald-600" />
          Add More Drinks
        </button>
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold transition-colors ${
            mode === 'edit'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Pencil className="h-4 w-4 text-amber-600" />
          Edit / Remove Drinks {sales.length > 0 ? `(${sales.length})` : ''}
        </button>
      </div>

      {loadingData ? (
        <div className="py-10 text-center text-sm text-slate-500">Loading drinks catalog...</div>
      ) : mode === 'add' ? (
        <form onSubmit={handleAddDrinksSubmit} className="space-y-4">
          {/* Drink Search */}
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchAdd}
              onChange={(e) => setSearchAdd(e.target.value)}
              placeholder="Search drink by name, brand or barcode..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Drink Picker Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {filteredAddProducts.map((p) => {
              const inCart = addItems.find((x) => x.productId === p.id);
              const outOfStock = p.currentStock <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => addProductToEditableList(p, addItems, setAddItems)}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                    outOfStock
                      ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                      : inCart
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {p.brand} · {p.bottleSize} · Stock: {p.currentStock}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-900 block">
                      {formatKsh(p.sellingPrice)}
                    </span>
                    {inCart && (
                      <span className="inline-block rounded bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 mt-0.5">
                        +{inCart.quantity}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Drinks Cart */}
          {addItems.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Drinks Being Added ({addItems.reduce((s, x) => s + x.quantity, 0)})
              </p>
              {addItems.map((it, idx) => (
                <div
                  key={`${it.productId || it.productName}-${idx}`}
                  className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{it.productName}</p>
                    <p className="text-xs text-slate-500">
                      {formatKsh(it.unitSellingPrice)} each · Line:{' '}
                      {formatKsh(it.unitSellingPrice * it.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => adjustEditableQtyAtIndex(idx, -1, addItems, setAddItems)}
                      className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{it.quantity}</span>
                    <button
                      type="button"
                      onClick={() => adjustEditableQtyAtIndex(idx, 1, addItems, setAddItems)}
                      className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddItems(addItems.filter((_, i) => i !== idx))}
                      className="h-7 w-7 rounded-md text-rose-500 hover:bg-rose-50 flex items-center justify-center ml-1"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Optional Note (visible on receipt & portal)
              </label>
              <input
                type="text"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder="e.g. This drink was bought for John"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Discount (KSh, optional)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={addDiscount}
                onChange={(e) => setAddDiscount(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideLimit}
              onChange={(e) => setOverrideLimit(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Allow exceeding customer credit limit if needed
          </label>

          <div className="rounded-xl bg-slate-900 text-white p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-slate-400">Added to Debt</p>
              <p className="text-lg font-bold text-amber-400">{formatKsh(addTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">New Customer Balance</p>
              <p className="text-base font-bold text-white">
                {formatKsh(projectedBalanceAfterAdd)}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || addItems.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Drinks to Debt'}
            </button>
          </div>
        </form>
      ) : sales.length === 0 ? (
        <div className="py-8 text-center space-y-3">
          <Wine className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-600">
            No editable receipts found for {customer.fullName} yet.
          </p>
          <button
            type="button"
            onClick={() => setMode('add')}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Add First Drinks to Tab
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Receipt selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Receipt / Drink Tab to Edit
            </label>
            <select
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:outline-none"
            >
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.receiptNumber} · Total {formatKsh(s.totalAmount)} ({s.items.length} drink line
                  {s.items.length === 1 ? '' : 's'})
                  {s.shares && s.shares.length > 1 ? ` [Split ×${s.shares.length}]` : ''}
                  {s.notes ? ` — ${s.notes}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedSale && (
            <SaleEditorForm
              sale={{
                ...selectedSale,
                customerId:
                  selectedSale.customerId !== undefined ? selectedSale.customerId : customer.id,
              }}
              products={products}
              customers={customers}
              submitLabel="Save Tab Changes"
              onCancel={onClose}
              onSuccess={async () => {
                await Promise.resolve(onSuccess?.());
                onClose();
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
