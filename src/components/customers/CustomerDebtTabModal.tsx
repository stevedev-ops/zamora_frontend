import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Pencil, Plus, Search, Trash2, Wine } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { formatKsh } from '../../utils/format';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

export interface DebtTabSaleItemInput {
  id?: string;
  productId?: string;
  productName: string;
  brand?: string;
  bottleSize?: string;
  quantity: number;
  unitSellingPrice: number;
  lineTotal: number;
}

export interface DebtTabSaleInput {
  id: string;
  receiptNumber: string;
  soldAt?: string;
  status?: string;
  paymentMethod?: string;
  subtotal?: number;
  discountAmount?: number;
  totalAmount: number;
  amountPaid?: number;
  outstandingAmount?: number;
  notes?: string | null;
  items: DebtTabSaleItemInput[];
}

export interface DebtTabCustomerInfo {
  id: string;
  fullName: string;
  accountNumber?: string;
  currentDebt: number;
  creditLimit?: number;
}

interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  bottleSize: string;
  barcode?: string | null;
  sellingPrice: number;
  currentStock: number;
}

interface EditableItem {
  productId: string;
  productName: string;
  brand: string;
  bottleSize: string;
  unitSellingPrice: number;
  quantity: number;
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
  const [sales, setSales] = useState<DebtTabSaleInput[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Add-to-tab state
  const [searchAdd, setSearchAdd] = useState('');
  const [addItems, setAddItems] = useState<EditableItem[]>([]);
  const [addDiscount, setAddDiscount] = useState('');
  const [addNote, setAddNote] = useState('');
  const [overrideLimit, setOverrideLimit] = useState(false);

  // Edit-existing-sale state
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [editDiscount, setEditDiscount] = useState('0');
  const [editNote, setEditNote] = useState('');
  const [editReason, setEditReason] = useState('');
  const [searchEditAdd, setSearchEditAdd] = useState('');
  const [editOverrideLimit, setEditOverrideLimit] = useState(false);

  useEffect(() => {
    if (!open || !customer) return;

    setMode(initialSaleId ? 'edit' : initialMode);
    setAddItems([]);
    setAddDiscount('');
    setAddNote('');
    setSearchAdd('');
    setSearchEditAdd('');
    setOverrideLimit(false);
    setEditOverrideLimit(false);

    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      try {
        const [prodRes, profileRes] = await Promise.all([
          api.get<{ products: CatalogProduct[] }>('/products?activeOnly=true'),
          existingSales && existingSales.length > 0 && !customer.id.startsWith('tmp-')
            ? Promise.resolve({ sales: existingSales })
            : api.get<{ sales: DebtTabSaleInput[] }>(`/customers/${customer.id}`).catch(() => ({
                sales: existingSales ?? [],
              })),
        ]);
        if (cancelled) return;

        setProducts(prodRes.products || []);
        const rawSales = (profileRes.sales || existingSales || []).filter(
          (s) => s.status !== 'VOIDED'
        );
        setSales(rawSales);

        const targetSale =
          (initialSaleId ? rawSales.find((s) => s.id === initialSaleId) : null) ||
          rawSales.find((s) => Number(s.outstandingAmount ?? s.totalAmount) > 0) ||
          rawSales[0];

        if (targetSale) {
          selectSaleForEdit(targetSale, prodRes.products || []);
        } else {
          setSelectedSaleId('');
          setEditItems([]);
        }
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

  const selectSaleForEdit = (sale: DebtTabSaleInput, catalog: CatalogProduct[] = products) => {
    setSelectedSaleId(sale.id);
    setEditDiscount(String(Number(sale.discountAmount || 0)));
    setEditNote(sale.notes || '');
    setEditReason('');
    setEditItems(
      sale.items.map((it) => {
        const matchedProduct =
          catalog.find((p) => p.id === it.productId) ||
          catalog.find((p) => p.name.toLowerCase() === it.productName.toLowerCase());
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
  };

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

  const filteredEditAddProducts = useMemo(() => {
    const q = searchEditAdd.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [products, searchEditAdd]);

  const addProductToList = (
    p: CatalogProduct,
    list: EditableItem[],
    setList: React.Dispatch<React.SetStateAction<EditableItem[]>>
  ) => {
    const existing = list.find((x) => x.productId === p.id);
    if (existing) {
      setList(
        list.map((x) => (x.productId === p.id ? { ...x, quantity: x.quantity + 1 } : x))
      );
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
  };

  const adjustQty = (
    productId: string,
    delta: number,
    list: EditableItem[],
    setList: React.Dispatch<React.SetStateAction<EditableItem[]>>
  ) => {
    setList(
      list
        .map((x) => (x.productId === productId ? { ...x, quantity: x.quantity + delta } : x))
        .filter((x) => x.quantity > 0)
    );
  };

  // Calculations for Add Mode
  const addSubtotal = addItems.reduce((s, it) => s + it.unitSellingPrice * it.quantity, 0);
  const addDiscountVal = Math.min(addSubtotal, Math.max(0, Number(addDiscount || 0)));
  const addTotal = Math.max(0, addSubtotal - addDiscountVal);
  const projectedBalanceAfterAdd = Number(customer?.currentDebt || 0) + addTotal;

  // Calculations for Edit Mode
  const selectedSale = sales.find((s) => s.id === selectedSaleId) || null;
  const editSubtotal = editItems.reduce((s, it) => s + it.unitSellingPrice * it.quantity, 0);
  const editDiscountVal =
    editItems.length === 0 ? 0 : Math.min(editSubtotal, Math.max(0, Number(editDiscount || 0)));
  const editTotal = Math.max(0, editSubtotal - editDiscountVal);
  const originalSaleTotal = Number(selectedSale?.totalAmount || 0);
  const editDelta = editTotal - originalSaleTotal;

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
      onSuccess?.();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to add drinks to debt', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !selectedSale) return;

    const missingProductId = editItems.some((it) => !it.productId);
    if (missingProductId) {
      showToast('Some older items could not be matched to an active product.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.patch<{ offlineQueued?: boolean }>(`/sales/${selectedSale.id}/items`, {
        items: editItems.map((it) => ({ productId: it.productId, quantity: it.quantity })),
        discountAmount: editDiscountVal,
        notes: editNote.trim() ? editNote.trim() : null,
        reason: editReason.trim() || undefined,
        allowCreditLimitOverride: editOverrideLimit,
      });

      showToast(
        res.offlineQueued
          ? 'Drink edit saved offline and queued for sync.'
          : editItems.length === 0
            ? `Voided ${selectedSale.receiptNumber} and returned all drinks to stock.`
            : `Updated ${selectedSale.receiptNumber} drink tab.`,
        'success'
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : 'Failed to update customer drink tab',
        'error'
      );
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
                  onClick={() => addProductToList(p, addItems, setAddItems)}
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
              {addItems.map((it) => (
                <div
                  key={it.productId}
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
                      onClick={() => adjustQty(it.productId, -1, addItems, setAddItems)}
                      className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{it.quantity}</span>
                    <button
                      type="button"
                      onClick={() => adjustQty(it.productId, 1, addItems, setAddItems)}
                      className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAddItems(addItems.filter((x) => x.productId !== it.productId))
                      }
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
        <form onSubmit={handleEditSaleSubmit} className="space-y-4">
          {/* Receipt selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Receipt / Drink Tab to Edit
            </label>
            <select
              value={selectedSaleId}
              onChange={(e) => {
                const found = sales.find((s) => s.id === e.target.value);
                if (found) selectSaleForEdit(found);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:outline-none"
            >
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.receiptNumber} · Total {formatKsh(s.totalAmount)} ({s.items.length} drink line
                  {s.items.length === 1 ? '' : 's'})
                  {s.notes ? ` — ${s.notes}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Current Drinks in Sale */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Drinks in This Tab ({editItems.reduce((s, it) => s + it.quantity, 0)})
              </p>
              {editItems.length === 0 && (
                <span className="text-[11px] font-semibold text-rose-600">
                  Will void receipt & return all drinks to stock
                </span>
              )}
            </div>

            {editItems.map((it) => (
              <div
                key={it.productId || it.productName}
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
                    onClick={() => adjustQty(it.productId, -1, editItems, setEditItems)}
                    className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{it.quantity}</span>
                  <button
                    type="button"
                    onClick={() => adjustQty(it.productId, 1, editItems, setEditItems)}
                    className="h-7 w-7 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditItems(editItems.filter((x) => x.productId !== it.productId))
                    }
                    className="h-7 w-7 rounded-md text-rose-500 hover:bg-rose-50 flex items-center justify-center ml-1"
                    title="Remove drink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Quick Search to Add another drink onto this receipt */}
            <div className="pt-2 border-t border-slate-200">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchEditAdd}
                  onChange={(e) => setSearchEditAdd(e.target.value)}
                  placeholder="Type to add another drink to this receipt..."
                  className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              {filteredEditAddProducts.length > 0 && (
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                  {filteredEditAddProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={p.currentStock <= 0}
                      onClick={() => {
                        addProductToList(p, editItems, setEditItems);
                        setSearchEditAdd('');
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Optional Note (visible on portal/receipt)
              </label>
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="e.g. This drink was bought for John"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Discount (KSh)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editDiscount}
                onChange={(e) => setEditDiscount(e.target.value)}
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
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="e.g. Customer added 2 Tusker or returned unopened bottle"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={editOverrideLimit}
              onChange={(e) => setEditOverrideLimit(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Allow exceeding customer credit limit if needed
          </label>

          <div className="rounded-xl bg-slate-900 text-white p-3.5 grid grid-cols-3 gap-2 text-center sm:text-left">
            <div>
              <p className="text-[11px] text-slate-400">Original Total</p>
              <p className="text-sm font-semibold">{formatKsh(originalSaleTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Updated Total</p>
              <p className="text-sm font-bold text-white">{formatKsh(editTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Debt Change</p>
              <p
                className={`text-sm font-bold ${
                  editDelta > 0
                    ? 'text-amber-400'
                    : editDelta < 0
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                }`}
              >
                {editDelta >= 0 ? `+${formatKsh(editDelta)}` : formatKsh(editDelta)}
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
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                editItems.length === 0
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {submitting
                ? 'Saving...'
                : editItems.length === 0
                  ? 'Void Receipt & Restore Stock'
                  : 'Save Tab Changes'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
