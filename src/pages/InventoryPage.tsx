import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Boxes, ChevronDown, ChevronRight, PlusCircle, Search } from 'lucide-react';
import { api } from '../api/client';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { formatDate, formatDateTime, formatKsh } from '../utils/format';

interface InventoryBatch {
  id: string;
  batchNumber: string;
  purchaseDate: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitCostPrice: number;
  referenceNumber: string | null;
}

interface InventoryRow {
  id: string;
  name: string;
  brand: string;
  bottleSize: string;
  categoryName: string;
  currentStock: number;
  minStockAlert: number;
  isLowStock: boolean;
  latestPurchasePrice: number;
  sellingPrice: number;
  stockCostValue: number;
  potentialRetailValue: number;
  potentialProfit: number;
  activeBatches: InventoryBatch[];
}

interface MovementRow {
  id: string;
  movementType: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCostPrice: number;
  totalCostValue: number;
  reason: string | null;
  createdAt: string;
  product: { name: string; brand: string; bottleSize: string };
  inventoryBatch: { batchNumber: string } | null;
}

export function InventoryPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [totals, setTotals] = useState({
    totalUnits: 0,
    totalCostValue: 0,
    totalRetailValue: 0,
    potentialGrossProfit: 0,
    lowStockCount: 0,
  });
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({
    productId: '',
    operation: 'ADJUST_OUT',
    quantity: '1',
    unitCostPrice: '',
    reason: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [invRes, movRes] = await Promise.all([
        api.get<{ totals: typeof totals; items: InventoryRow[] }>(
          `/inventory?lowStockOnly=${lowStockOnly}`
        ),
        api.get<{ movements: MovementRow[] }>('/inventory/movements?limit=100'),
      ]);
      setTotals(invRes.totals);
      setItems(invRes.items);
      setMovements(movRes.movements);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load inventory', 'error');
    } finally {
      setLoading(false);
    }
  }, [lowStockOnly, showToast]);

  useEffect(() => {
    loadData();
    const handleSynced = () => {
      void loadData();
    };
    window.addEventListener('zamora:synced', handleSynced);
    return () => window.removeEventListener('zamora:synced', handleSynced);
  }, [loadData]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/inventory/adjust', {
        productId: adjForm.productId,
        operation: adjForm.operation,
        quantity: Number(adjForm.quantity),
        unitCostPrice: adjForm.unitCostPrice ? Number(adjForm.unitCostPrice) : undefined,
        reason: adjForm.reason,
      });
      showToast('Inventory adjustment recorded', 'success');
      setAdjustOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Adjustment failed', 'error');
    }
  };

  const filteredItems = items.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) || i.brand.toLowerCase().includes(q);
  });

  if (loading) return <LoadingState label="Loading FIFO inventory & valuation..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory & FIFO Batches</h1>
          <p className="text-sm text-slate-500">
            Track exact batch cost layers, stock adjustments, damaged/expired goods, and movement logs
          </p>
        </div>
        <button
          onClick={() => {
            setAdjForm({
              productId: items[0]?.id || '',
              operation: 'DAMAGED',
              quantity: '1',
              unitCostPrice: '',
              reason: '',
            });
            setAdjustOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <PlusCircle className="h-4 w-4" />
          Stock Adjustment / Damage / Return
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Bottles in Stock" value={String(totals.totalUnits)} icon={Boxes} />
        <StatCard
          title="Stock Cost Valuation (FIFO)"
          value={formatKsh(totals.totalCostValue)}
          icon={Boxes}
          tone="navy"
        />
        <StatCard
          title="Potential Retail Value"
          value={formatKsh(totals.totalRetailValue)}
          subtitle={`Est. Gross Profit: ${formatKsh(totals.potentialGrossProfit)}`}
          icon={Boxes}
          tone="emerald"
        />
        <StatCard
          title="Low-Stock Alerts"
          value={String(totals.lowStockCount)}
          icon={AlertTriangle}
          tone={totals.lowStockCount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('stock')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${
              tab === 'stock'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            Stock & FIFO Batches
          </button>
          <button
            onClick={() => setTab('movements')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${
              tab === 'movements'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            Movement History ({movements.length})
          </button>
        </div>

        {tab === 'stock' && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
              />
              Low stock only
            </label>
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inventory..."
                className="rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {tab === 'stock' ? (
        <>
          {/* Mobile Stock Cards */}
          <div className="md:hidden space-y-2.5">
            {filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full text-left flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{item.name}</span>
                      </p>
                      <p className="text-xs text-slate-500 pl-5">
                        {item.brand} · {item.bottleSize} · {item.activeBatches.length} batch(es)
                      </p>
                    </div>
                    <StatusBadge
                      label={`${item.currentStock} / min ${item.minStockAlert}`}
                      variant={item.isLowStock ? 'amber' : 'emerald'}
                    />
                  </button>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">FIFO Cost</p>
                      <p className="font-semibold tabular-nums">{formatKsh(item.stockCostValue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Retail</p>
                      <p className="font-medium tabular-nums">{formatKsh(item.potentialRetailValue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Est. Profit</p>
                      <p className="font-bold text-emerald-700 tabular-nums">{formatKsh(item.potentialProfit)}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase text-slate-500">
                        Active FIFO Batches
                      </p>
                      {item.activeBatches.length === 0 ? (
                        <p className="text-xs text-slate-500">No remaining batch stock.</p>
                      ) : (
                        item.activeBatches.map((b) => (
                          <div
                            key={b.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs flex justify-between"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">{b.batchNumber}</p>
                              <p className="text-[11px] text-slate-500">{formatDate(b.purchaseDate)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatKsh(b.unitCostPrice)} / btl</p>
                              <p className="text-[11px] text-slate-500">
                                {b.remainingQuantity} / {b.initialQuantity} left
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop 5-Column Screen-Fit Stock Table with Arrow Dropdown */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-right">Stock</th>
                <th className="px-3 py-3 text-right">FIFO Cost Value</th>
                <th className="px-3 py-3 text-right">Est. Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <td className="px-3 py-3 text-slate-400">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.brand} · {item.bottleSize} · {item.activeBatches.length} batch(es)
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <StatusBadge
                          label={`${item.currentStock}`}
                          variant={item.isLowStock ? 'amber' : 'emerald'}
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatKsh(item.stockCostValue)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatKsh(item.potentialProfit)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-10 py-3 space-y-2.5">
                          <div className="flex flex-wrap gap-5 text-xs text-slate-600">
                            <span>Min Alert: <strong>{item.minStockAlert}</strong></span>
                            <span>Retail Value: <strong>{formatKsh(item.potentialRetailValue)}</strong></span>
                            <span>Sell Price: <strong>{formatKsh(item.sellingPrice)}</strong></span>
                          </div>
                          <p className="text-xs font-bold uppercase text-slate-500">
                            Active FIFO Cost Batches (Consumed Oldest First)
                          </p>
                          {item.activeBatches.length === 0 ? (
                            <p className="text-xs text-slate-500">No remaining batch stock.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {item.activeBatches.map((b) => (
                                <div
                                  key={b.id}
                                  className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                                >
                                  <div className="flex justify-between font-semibold text-slate-900">
                                    <span>{b.batchNumber}</span>
                                    <span>{formatKsh(b.unitCostPrice)} / bottle</span>
                                  </div>
                                  <div className="flex justify-between text-slate-500 mt-1">
                                    <span>Date: {formatDate(b.purchaseDate)}</span>
                                    <span>
                                      Remaining: <strong>{b.remainingQuantity}</strong> /{' '}
                                      {b.initialQuantity}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <>
          {/* Mobile Compact Dropdown Movements Cards */}
          <div className="md:hidden space-y-2">
            {movements.map((m) => {
              const isOpen = expandedId === `mov-${m.id}`;
              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 truncate">
                        {m.product.name} ({m.product.bottleSize})
                      </p>
                      <p className="text-[11px] text-slate-500">{m.movementType}</p>
                    </div>
                    <span
                      className={`text-sm font-bold tabular-nums shrink-0 ${
                        m.quantityChange > 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : `mov-${m.id}`)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                      aria-label={`View details for ${m.product.name}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>{formatDateTime(m.createdAt)}</span>
                        <span className="tabular-nums font-medium">
                          Stock: {m.quantityBefore} → {m.quantityAfter}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cost Value</span>
                        <span className="font-semibold tabular-nums">{formatKsh(m.totalCostValue)}</span>
                      </div>
                      {m.reason && <p className="text-slate-500 italic">{m.reason}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop 5-Column Screen-Fit Movements Table with Arrow Dropdown */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs uppercase">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-left">Type</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Cost Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {movements.map((m) => {
                const isOpen = expandedId === `mov-${m.id}`;
                return (
                  <React.Fragment key={m.id}>
                    <tr
                      onClick={() => setExpandedId(isOpen ? null : `mov-${m.id}`)}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5 text-slate-400">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">
                          {m.product.name} ({m.product.bottleSize})
                        </p>
                        <p className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          label={m.movementType}
                          variant={
                            m.quantityChange > 0
                              ? 'emerald'
                              : m.movementType === 'DAMAGED' || m.movementType === 'EXPIRED'
                              ? 'rose'
                              : 'slate'
                          }
                        />
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${
                          m.quantityChange > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {formatKsh(m.totalCostValue)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-10 py-2.5 text-xs text-slate-600">
                          <div className="flex flex-wrap gap-4">
                            <span>
                              Stock Change: <strong>{m.quantityBefore} → {m.quantityAfter}</strong>
                            </span>
                            {m.inventoryBatch && (
                              <span>
                                Batch: <strong className="font-mono">{m.inventoryBatch.batchNumber}</strong>
                              </span>
                            )}
                            <span>Reason: {m.reason || '—'}</span>
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
        </>
      )}

      {/* Adjustment Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust Inventory Stock"
        subtitle="Record stock additions, damaged/expired bottles, returns, or count corrections"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Product
            </label>
            <select
              required
              value={adjForm.productId}
              onChange={(e) => setAdjForm((f) => ({ ...f, productId: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.bottleSize}) — Current: {i.currentStock}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Operation
              </label>
              <select
                value={adjForm.operation}
                onChange={(e) => setAdjForm((f) => ({ ...f, operation: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="DAMAGED">Damaged / Broken (-)</option>
                <option value="EXPIRED">Expired Stock (-)</option>
                <option value="ADJUST_OUT">Count Adjustment (-)</option>
                <option value="RETURN_OUT">Return to Supplier (-)</option>
                <option value="ADJUST_IN">Count Adjustment (+)</option>
                <option value="RETURN_IN">Customer Return (+)</option>
                <option value="ADD">Direct Stock Addition (+)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Quantity
              </label>
              <input
                type="number"
                required
                min="1"
                value={adjForm.quantity}
                onChange={(e) => setAdjForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          {['ADD', 'ADJUST_IN', 'RETURN_IN'].includes(adjForm.operation) && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Unit Cost Price (Optional, defaults to current cost)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={adjForm.unitCostPrice}
                onChange={(e) => setAdjForm((f) => ({ ...f, unitCostPrice: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Reason (Required)
            </label>
            <textarea
              required
              rows={2}
              value={adjForm.reason}
              onChange={(e) => setAdjForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Explain why stock is being adjusted..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Submit Adjustment
          </button>
        </form>
      </Modal>
    </div>
  );
}

