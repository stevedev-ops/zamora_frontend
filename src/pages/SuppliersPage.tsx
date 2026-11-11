import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, Eye, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { formatDate, formatKsh } from '../utils/format';

interface SupplierRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  productCount: number;
  purchaseCount: number;
  totalPurchased: number;
  lastPurchaseDate: string | null;
}

interface SupplierDetail {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  priceHistory: Array<{
    productId: string;
    productName: string;
    bottleSize: string;
    history: Array<{ date: string; referenceNumber: string; quantity: number; unitCostPrice: number }>;
  }>;
}

export function SuppliersPage() {
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const loadSuppliers = useCallback(async () => {
    try {
      const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const res = await api.get<{ suppliers: SupplierRow[] }>(`/suppliers${qs}`);
      setSuppliers(res.suppliers);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', phone: '', email: '', address: '', notes: '', status: 'ACTIVE' });
    setModalOpen(true);
  };

  const openEdit = (s: SupplierRow) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone,
      email: s.email || '',
      address: s.address || '',
      notes: s.notes || '',
      status: s.status,
    });
    setModalOpen(true);
  };

  const openDetail = async (id: string) => {
    try {
      const res = await api.get<{ supplier: SupplierDetail }>(`/suppliers/${id}`);
      setDetail(res.supplier);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load supplier details', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/suppliers/${editing.id}`, {
          ...form,
          email: form.email || null,
          address: form.address || null,
          notes: form.notes || null,
        });
        showToast('Supplier updated', 'success');
      } else {
        await api.post('/suppliers', {
          name: form.name,
          phone: form.phone,
          email: form.email || undefined,
          address: form.address || undefined,
          notes: form.notes || undefined,
        });
        showToast('Supplier created', 'success');
      }
      setModalOpen(false);
      await loadSuppliers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  if (loading) return <LoadingState label="Loading suppliers..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-sm text-slate-500">
            Manage distributors and review historical purchase prices per supplier
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add Supplier
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suppliers..."
          className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {/* Mobile Compact Dropdown Cards */}
      <div className="md:hidden space-y-2">
        {suppliers.map((s) => {
          const isOpen = expandedId === s.id;
          return (
            <div
              key={s.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-900 truncate">{s.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {s.phone} · <span className="font-bold text-slate-900">{formatKsh(s.totalPurchased)}</span>
                  </p>
                </div>
                <StatusBadge
                  label={s.status}
                  variant={s.status === 'ACTIVE' ? 'emerald' : 'slate'}
                />
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : s.id)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                  aria-label={`View more for ${s.name}`}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 rounded-lg p-2">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Products</p>
                      <p className="font-semibold">{s.productCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Deliveries</p>
                      <p className="font-semibold">{s.purchaseCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Address</p>
                      <p className="truncate">{s.address || '—'}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openDetail(s.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5" /> Price History
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </button>
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
              <th className="px-3 py-3 text-left">Supplier</th>
              <th className="px-3 py-3 text-left">Phone</th>
              <th className="px-3 py-3 text-right">Total Spend</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {suppliers.map((s) => {
              const isOpen = expandedId === s.id;
              return (
                <React.Fragment key={s.id}>
                  <tr
                    onClick={() => setExpandedId(isOpen ? null : s.id)}
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
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        {s.purchaseCount} deliveries · {s.productCount} product(s)
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{s.phone}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatKsh(s.totalPurchased)}
                    </td>
                    <td
                      className="px-3 py-3 text-right space-x-1.5 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => openDetail(s.id)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" /> Prices
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-10 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                          <div className="flex flex-wrap gap-4">
                            <span>Address: <strong>{s.address || '—'}</strong></span>
                            {s.email && <span>Email: <strong>{s.email}</strong></span>}
                            {s.notes && <span className="italic">{s.notes}</span>}
                          </div>
                          <StatusBadge
                            label={s.status}
                            variant={s.status === 'ACTIVE' ? 'emerald' : 'slate'}
                          />
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add Supplier'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Supplier Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Phone
              </label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Email (Optional)
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Address
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {editing ? 'Update Supplier' : 'Save Supplier'}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`${detail?.name || ''} — Supplier Price History`}
        subtitle={`${detail?.phone || ''} · ${detail?.address || ''}`}
        maxWidth="max-w-2xl"
      >
        {detail && (
          <div className="space-y-4">
            {detail.priceHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No stock purchases recorded from this supplier yet.</p>
            ) : (
              detail.priceHistory.map((p) => (
                <div key={p.productId} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-sm text-slate-900 mb-2">
                    {p.productName} ({p.bottleSize})
                  </p>
                  <div className="space-y-1 text-xs">
                    {p.history.map((h, i) => (
                      <div key={i} className="flex justify-between text-slate-600">
                        <span>
                          {formatDate(h.date)} · {h.referenceNumber} ({h.quantity} bottles)
                        </span>
                        <strong className="text-slate-900 tabular-nums">
                          {formatKsh(h.unitCostPrice)} / bottle
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

