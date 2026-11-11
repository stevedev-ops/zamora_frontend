import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Edit2, FolderPlus, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { formatKsh } from '../utils/format';

interface Category {
  id: string;
  name: string;
  isDefault: boolean;
  productCount: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  categoryId: string;
  category: { id: string; name: string } | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  barcode: string | null;
  bottleSize: string;
  purchasePrice: number;
  sellingPrice: number;
  profitPerUnit: number;
  profitMarginPercent: number;
  markupPercent: number;
  currentStock: number;
  minStockAlert: number;
  isLowStock: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [form, setForm] = useState({
    name: '',
    brand: '',
    categoryId: '',
    supplierId: '',
    barcode: '',
    bottleSize: '500ml',
    purchasePrice: '',
    sellingPrice: '',
    initialStock: '0',
    minStockAlert: '5',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const loadAll = useCallback(async () => {
    try {
      const [prodRes, catRes, supRes] = await Promise.all([
        api.get<{ products: Product[] }>('/products'),
        api.get<{ categories: Category[] }>('/categories'),
        api.get<{ suppliers: Supplier[] }>('/suppliers'),
      ]);
      setProducts(prodRes.products);
      setCategories(catRes.categories);
      setSuppliers(supRes.suppliers);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (searchParams.get('action') === 'new' && categories.length > 0) {
      openCreateModal();
      setSearchParams({});
    }
  }, [searchParams, categories.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreateModal = () => {
    setEditingProduct(null);
    setForm({
      name: '',
      brand: '',
      categoryId: categories[0]?.id || '',
      supplierId: '',
      barcode: '',
      bottleSize: '500ml',
      purchasePrice: '',
      sellingPrice: '',
      initialStock: '0',
      minStockAlert: '5',
      status: 'ACTIVE',
    });
    setProductModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      brand: p.brand,
      categoryId: p.categoryId,
      supplierId: p.supplierId || '',
      barcode: p.barcode || '',
      bottleSize: p.bottleSize,
      purchasePrice: String(p.purchasePrice),
      sellingPrice: String(p.sellingPrice),
      initialStock: String(p.currentStock),
      minStockAlert: String(p.minStockAlert),
      status: p.status,
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.patch(`/products/${editingProduct.id}`, {
          name: form.name,
          brand: form.brand,
          categoryId: form.categoryId,
          supplierId: form.supplierId || null,
          barcode: form.barcode || null,
          bottleSize: form.bottleSize,
          purchasePrice: Number(form.purchasePrice),
          sellingPrice: Number(form.sellingPrice),
          minStockAlert: Number(form.minStockAlert),
          status: form.status,
        });
        showToast('Product updated (historical sales profit preserved)', 'success');
      } else {
        await api.post('/products', {
          name: form.name,
          brand: form.brand,
          categoryId: form.categoryId,
          supplierId: form.supplierId || null,
          barcode: form.barcode || null,
          bottleSize: form.bottleSize,
          purchasePrice: Number(form.purchasePrice),
          sellingPrice: Number(form.sellingPrice),
          initialStock: Number(form.initialStock || 0),
          minStockAlert: Number(form.minStockAlert || 5),
        });
        showToast('Product created successfully', 'success');
      }
      setProductModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/categories', { name: newCategoryName });
      setNewCategoryName('');
      showToast('Category added', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create category', 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await api.delete(`/categories/${id}`);
      showToast('Category deleted', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cannot delete category', 'error');
    }
  };

  const cp = Number(form.purchasePrice || 0);
  const sp = Number(form.sellingPrice || 0);
  const previewProfit = sp - cp;
  const previewMargin = sp > 0 ? (previewProfit / sp) * 100 : 0;
  const previewMarkup = cp > 0 ? (previewProfit / cp) * 100 : 0;

  const filtered = products.filter((p) => {
    if (categoryFilter && p.categoryId !== categoryFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  if (loading) return <LoadingState label="Loading products catalog..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products & Pricing</h1>
          <p className="text-sm text-slate-500">
            Manage drinks catalog, buying/selling prices, profit margins, and custom categories
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCategoryModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FolderPlus className="h-4 w-4" />
            Categories
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, brand, or barcode..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-52"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.productCount})
            </option>
          ))}
        </select>
      </div>

      {/* Mobile Compact Dropdown Cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((p) => {
          const isOpen = expandedId === p.id;
          return (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-900 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {p.brand} · {p.bottleSize} ·{' '}
                    <span className="font-bold text-slate-900">{formatKsh(p.sellingPrice)}</span>
                  </p>
                </div>
                <StatusBadge
                  label={`${p.currentStock}`}
                  variant={p.isLowStock ? 'amber' : 'emerald'}
                />
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : p.id)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                  aria-label={`View more details for ${p.name}`}
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
                      <p className="text-[10px] uppercase text-slate-400">Buy Cost</p>
                      <p className="font-medium tabular-nums">{formatKsh(p.purchasePrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Profit</p>
                      <p className="font-bold text-emerald-700 tabular-nums">
                        {formatKsh(p.profitPerUnit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Margin</p>
                      <p className="font-semibold tabular-nums">{p.profitMarginPercent}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {p.category?.name || 'Uncategorized'}
                      {p.barcode ? ` · ${p.barcode}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
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
          <thead className="bg-slate-900 text-white text-xs uppercase tracking-wider">
            <tr>
              <th className="w-10 px-3 py-3"></th>
              <th className="px-3 py-3 text-left">Product</th>
              <th className="px-3 py-3 text-right">Selling Price</th>
              <th className="px-3 py-3 text-right">Stock</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.map((p) => {
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
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.brand} · {p.bottleSize} · {p.category?.name}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatKsh(p.sellingPrice)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      <StatusBadge
                        label={`${p.currentStock} bottles`}
                        variant={p.isLowStock ? 'amber' : 'emerald'}
                      />
                    </td>
                    <td
                      className="px-3 py-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-10 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
                          <div className="flex flex-wrap items-center gap-4">
                            <span>
                              Cost Price: <strong className="text-slate-900">{formatKsh(p.purchasePrice)}</strong>
                            </span>
                            <span>
                              Profit/Unit:{' '}
                              <strong className="text-emerald-700">{formatKsh(p.profitPerUnit)}</strong>
                            </span>
                            <span>
                              Margin / Markup: <strong>{p.profitMarginPercent}%</strong> /{' '}
                              <strong>{p.markupPercent}%</strong>
                            </span>
                            {p.barcode && (
                              <span>
                                Barcode: <strong className="font-mono">{p.barcode}</strong>
                              </span>
                            )}
                          </div>
                          <StatusBadge
                            label={p.status}
                            variant={p.status === 'ACTIVE' ? 'emerald' : 'slate'}
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

      {/* Add/Edit Product Modal */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editingProduct ? `Edit ${editingProduct.name}` : 'Add New Product'}
        subtitle="Historical sales costs remain preserved when prices change"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Product Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Tusker Lager"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Brand
              </label>
              <input
                type="text"
                required
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                placeholder="e.g. EABL"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Category
              </label>
              <select
                required
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Bottle Size / Volume
              </label>
              <input
                type="text"
                required
                value={form.bottleSize}
                onChange={(e) => setForm((f) => ({ ...f, bottleSize: e.target.value }))}
                placeholder="e.g. 500ml, 750ml, 1L"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Barcode (Optional)
              </label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Preferred Supplier (Optional)
              </label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Purchase / Cost Price (KSh)
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Selling Price (KSh)
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            {!editingProduct && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Initial Stock Quantity
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.initialStock}
                  onChange={(e) => setForm((f) => ({ ...f, initialStock: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Minimum Stock Alert Qty
              </label>
              <input
                type="number"
                min="0"
                value={form.minStockAlert}
                onChange={(e) => setForm((f) => ({ ...f, minStockAlert: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            {editingProduct && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Product Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive (Hidden from POS)</option>
                </select>
              </div>
            )}
          </div>

          {/* Live Profit Calculator */}
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Profit / Bottle</p>
              <p className="text-base font-bold text-emerald-900 tabular-nums">
                {formatKsh(previewProfit)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Profit Margin</p>
              <p className="text-base font-bold text-emerald-900 tabular-nums">
                {previewMargin.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Markup</p>
              <p className="text-base font-bold text-emerald-900 tabular-nums">
                {previewMarkup.toFixed(2)}%
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {editingProduct ? 'Save Product Changes' : 'Create Product'}
          </button>
        </form>
      </Modal>

      {/* Categories Modal */}
      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Manage Product Categories"
        subtitle="Add custom drink categories alongside default categories"
      >
        <div className="space-y-4">
          <form onSubmit={handleCreateCategory} className="flex gap-2">
            <input
              type="text"
              required
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name (e.g. Liqueurs)"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Add
            </button>
          </form>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
            {categories.map((c) => (
              <div key={c.id} className="px-3 py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className="ml-2 text-xs text-slate-500">({c.productCount} products)</span>
                </div>
                {c.productCount === 0 && !c.isDefault && (
                  <button
                    onClick={() => handleDeleteCategory(c.id)}
                    className="text-rose-600 hover:text-rose-800 p-1"
                    title="Delete unused custom category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

