import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/common/Modal';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { ExportButtons } from '../components/common/ExportButtons';
import { buildExportQuery } from '../utils/export';
import { formatDateTime, formatKsh, generateIdempotencyKey } from '../utils/format';

interface Supplier {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  bottleSize: string;
  purchasePrice: number;
  sellingPrice: number;
}

interface PurchaseRow {
  id: string;
  referenceNumber: string;
  purchaseDate: string;
  totalCost: number;
  notes: string | null;
  supplier: { id: string; name: string };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitCostPrice: number;
    totalCost: number;
    product: { name: string; brand: string; bottleSize: string };
  }>;
}

export function StockPurchasesPage() {
  const { showToast } = useToast();
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PurchaseRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<
    Array<{ productId: string; quantity: string; unitCostPrice: string }>
  >([]);

  const [supplierFilter, setSupplierFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const qs = buildExportQuery({
        supplierId: supplierFilter,
        startDate,
        endDate,
      });
      const [pRes, sRes, prRes] = await Promise.all([
        api.get<{ purchases: PurchaseRow[] }>(`/purchases${qs}`),
        api.get<{ suppliers: Supplier[] }>('/suppliers?status=ACTIVE'),
        api.get<{ products: Product[] }>('/products?status=ACTIVE'),
      ]);
      setPurchases(pRes.purchases);
      setSuppliers(sRes.suppliers);
      setProducts(prRes.products);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load stock purchases', 'error');
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, startDate, endDate, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openNewPurchase = () => {
    const firstProd = products[0];
    setSupplierId(suppliers[0]?.id || '');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setReferenceNumber('');
    setNotes('');
    setLines(
      firstProd
        ? [
            {
              productId: firstProd.id,
              quantity: '12',
              unitCostPrice: String(firstProd.purchasePrice),
            },
          ]
        : []
    );
    setCreateOpen(true);
  };

  const addLine = () => {
    const firstProd = products[0];
    if (!firstProd) return;
    setLines((prev) => [
      ...prev,
      { productId: firstProd.id, quantity: '10', unitCostPrice: String(firstProd.purchasePrice) },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<(typeof lines)[0]>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        if (patch.productId) {
          const prod = products.find((p) => p.id === patch.productId);
          if (prod) next.unitCostPrice = String(prod.purchasePrice);
        }
        return next;
      })
    );
  };

  const totalOrderCost = lines.reduce(
    (sum, l) => sum + Number(l.quantity || 0) * Number(l.unitCostPrice || 0),
    0
  );

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || lines.length === 0) {
      showToast('Select a supplier and add at least one product', 'error');
      return;
    }
    try {
      await api.post('/purchases', {
        supplierId,
        purchaseDate: new Date(purchaseDate).toISOString(),
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
        idempotencyKey: generateIdempotencyKey('po'),
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitCostPrice: Number(l.unitCostPrice),
        })),
      });
      showToast('Stock purchase saved and FIFO inventory batches updated!', 'success');
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save purchase', 'error');
    }
  };

  if (loading) return <LoadingState label="Loading stock purchases..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Purchases</h1>
          <p className="text-sm text-slate-500">
            Record supplier deliveries, track batch purchase prices, and automatically increase stock
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            filenameBase="zamora-stock-purchases"
            pdfPath={`/purchases/export/pdf${buildExportQuery({
              supplierId: supplierFilter,
              startDate,
              endDate,
            })}`}
            excelPath={`/purchases/export/excel${buildExportQuery({
              supplierId: supplierFilter,
              startDate,
              endDate,
            })}`}
            csvPath={`/purchases/export/csv${buildExportQuery({
              supplierId: supplierFilter,
              startDate,
              endDate,
            })}`}
            localCsv={{
              columns: [
                { header: 'Ref #', value: (r) => r.referenceNumber },
                { header: 'Date', value: (r) => r.purchaseDate },
                { header: 'Supplier', value: (r) => r.supplier.name },
                {
                  header: 'Items',
                  value: (r) => r.items.map((it) => `${it.product.name} (${it.quantity})`).join(', '),
                },
                { header: 'Total Cost (KSh)', value: (r) => r.totalCost },
                { header: 'Notes', value: (r) => r.notes || '' },
              ],
              rows: purchases,
            }}
          />
          <button
            onClick={openNewPurchase}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <PackagePlus className="h-4 w-4" />
            Record Stock Purchase
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Start date"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          aria-label="End date"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        {(supplierFilter || startDate || endDate) && (
          <button
            type="button"
            onClick={() => {
              setSupplierFilter('');
              setStartDate('');
              setEndDate('');
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Mobile Compact Dropdown Cards */}
      <div className="md:hidden space-y-2">
        {purchases.map((p) => {
          const isOpen = expandedId === p.id;
          return (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-900 truncate">{p.supplier.name}</p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">
                    {p.referenceNumber} · {p.items.length} line(s)
                  </p>
                </div>
                <p className="font-bold text-sm text-slate-900 tabular-nums shrink-0">
                  {formatKsh(p.totalCost)}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : p.id)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                  aria-label={`View items for ${p.referenceNumber}`}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                  <p className="text-[11px] text-slate-500">{formatDateTime(p.purchaseDate)}</p>
                  {p.notes && <p className="text-slate-600">{p.notes}</p>}
                  <div className="space-y-1">
                    {p.items.map((it) => (
                      <div key={it.id} className="flex justify-between text-slate-700 bg-slate-50 rounded px-2 py-1">
                        <span className="truncate">
                          {it.product.name} ({it.quantity} × {formatKsh(it.unitCostPrice)})
                        </span>
                        <span className="font-semibold tabular-nums shrink-0 ml-2">
                          {formatKsh(it.totalCost)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop 5-Column Screen-Fit Table with Arrow Dropdown */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-white text-xs uppercase">
            <tr>
              <th className="w-10 px-3 py-3"></th>
              <th className="px-3 py-3 text-left">Supplier &amp; Ref #</th>
              <th className="px-3 py-3 text-left">Date</th>
              <th className="px-3 py-3 text-right">Total Cost</th>
              <th className="px-3 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {purchases.map((p) => {
              const isOpen = expandedId === p.id;
              return (
                <React.Fragment key={p.id}>
                  <tr
                    onClick={() => setExpandedId(isOpen ? null : p.id)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-3 py-3 text-slate-400">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{p.supplier.name}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {p.referenceNumber} · {p.items.length} item(s)
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(p.purchaseDate)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                      {formatKsh(p.totalCost)}
                    </td>
                    <td
                      className="px-3 py-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setDetailTarget(p)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Modal
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-10 py-3">
                        <div className="space-y-1.5 text-xs">
                          {p.notes && <p className="text-slate-600 italic">Note: {p.notes}</p>}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {p.items.map((it) => (
                              <div
                                key={it.id}
                                className="rounded border border-slate-200 bg-white px-2.5 py-1.5 flex justify-between gap-2"
                              >
                                <span className="font-medium text-slate-800 truncate">
                                  {it.product.name} ({it.quantity} × {formatKsh(it.unitCostPrice)})
                                </span>
                                <span className="font-semibold tabular-nums shrink-0">
                                  {formatKsh(it.totalCost)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Record Stock Purchase Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record Supplier Stock Purchase"
        subtitle="Creates FIFO inventory batches and preserves historical costs on past sales"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleCreatePurchase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Supplier
              </label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Invoice / Ref # (Optional)
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-600">
                Products Purchased
              </span>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add Product Row
              </button>
            </div>

            {lines.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center rounded-lg border border-slate-200 bg-slate-50 p-2.5"
              >
                <div className="col-span-12 sm:col-span-5">
                  <select
                    value={line.productId}
                    onChange={(e) => updateLine(idx, { productId: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.bottleSize})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                  />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="Unit Cost"
                    value={line.unitCostPrice}
                    onChange={(e) => updateLine(idx, { unitCostPrice: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 text-right text-xs font-semibold tabular-nums">
                  {formatKsh(Number(line.quantity || 0) * Number(line.unitCostPrice || 0))}
                </div>
                <div className="col-span-1 text-right">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-3">
            <span className="text-xs font-semibold uppercase">Total Purchase Cost</span>
            <span className="text-lg font-bold tabular-nums">{formatKsh(totalOrderCost)}</span>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Save Stock Purchase & Update Inventory
          </button>
        </form>
      </Modal>

      {/* Purchase Detail Modal */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title={`Purchase ${detailTarget?.referenceNumber || ''}`}
        subtitle={`${detailTarget?.supplier.name || ''} · ${
          detailTarget ? formatDateTime(detailTarget.purchaseDate) : ''
        }`}
      >
        {detailTarget && (
          <div className="space-y-3">
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-900 text-white text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit Cost</th>
                  <th className="px-3 py-2 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {detailTarget.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      {item.product.name} ({item.product.bottleSize})
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatKsh(item.unitCostPrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatKsh(item.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-base font-bold text-slate-900">
              Total: {formatKsh(detailTarget.totalCost)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

