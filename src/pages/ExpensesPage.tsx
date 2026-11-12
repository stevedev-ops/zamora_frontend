import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Receipt, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/common/Modal';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { useToast } from '../components/common/Toast';
import { ExportButtons } from '../components/common/ExportButtons';
import { buildExportQuery } from '../utils/export';
import { formatDate, formatKsh } from '../utils/format';

interface ExpenseRow {
  id: string;
  referenceNumber: string;
  category: string;
  title: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  payee: string | null;
  notes: string | null;
}

const EXPENSE_CATEGORIES = [
  'RENT',
  'ELECTRICITY',
  'WATER',
  'TRANSPORT',
  'SALARIES',
  'LICENCES',
  'REPAIRS',
  'OTHER',
] as const;

export function ExpensesPage() {
  const { showToast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: 'RENT',
    title: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'MPESA',
    payee: '',
    notes: '',
  });

  const loadExpenses = useCallback(async () => {
    try {
      const qs = buildExportQuery({
        category: categoryFilter,
        search: searchFilter.trim(),
        startDate,
        endDate,
      });
      const res = await api.get<{ expenses: ExpenseRow[] }>(`/expenses${qs}`);
      setExpenses(res.expenses);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load expenses', 'error');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, searchFilter, startDate, endDate, showToast]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/expenses', {
        ...form,
        amount: Number(form.amount),
        expenseDate: new Date(form.expenseDate).toISOString(),
        payee: form.payee || undefined,
        notes: form.notes || undefined,
      });
      showToast('Business expense recorded', 'success');
      setModalOpen(false);
      setForm({
        category: 'RENT',
        title: '',
        amount: '',
        expenseDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'MPESA',
        payee: '',
        notes: '',
      });
      await loadExpenses();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save expense', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/expenses/${id}`);
      showToast('Expense removed', 'info');
      await loadExpenses();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  if (loading) return <LoadingState label="Loading business expenses..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operating Expenses</h1>
          <p className="text-sm text-slate-500">
            Track rent, utilities, licences, transport, and repairs for accurate Net Operating Profit
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            filenameBase="zamora-expenses"
            pdfPath={`/expenses/export/pdf${buildExportQuery({
              category: categoryFilter,
              search: searchFilter.trim(),
              startDate,
              endDate,
            })}`}
            excelPath={`/expenses/export/excel${buildExportQuery({
              category: categoryFilter,
              search: searchFilter.trim(),
              startDate,
              endDate,
            })}`}
            csvPath={`/expenses/export/csv${buildExportQuery({
              category: categoryFilter,
              search: searchFilter.trim(),
              startDate,
              endDate,
            })}`}
            localCsv={{
              columns: [
                { header: 'Ref #', value: (r) => r.referenceNumber },
                { header: 'Date', value: (r) => r.expenseDate },
                { header: 'Category', value: (r) => r.category },
                { header: 'Title', value: (r) => r.title },
                { header: 'Payee', value: (r) => r.payee || '' },
                { header: 'Method', value: (r) => r.paymentMethod },
                { header: 'Amount (KSh)', value: (r) => r.amount },
                { header: 'Notes', value: (r) => r.notes || '' },
              ],
              rows: expenses,
            }}
          />
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Record Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
        <StatCard
          title="Total Expenses (Filtered)"
          value={formatKsh(totalExpenses)}
          subtitle={`${expenses.length} recorded expense(s)`}
          icon={Receipt}
          tone="rose"
        />
        <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2">
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search title, payee, ref #..."
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-52"
          />
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
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile Compact Dropdown Expense Cards */}
      <div className="md:hidden space-y-2">
        {expenses.map((e) => {
          const isOpen = expandedId === e.id;
          return (
            <div
              key={e.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-900 truncate">{e.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatDate(e.expenseDate)} · {e.category}
                  </p>
                </div>
                <p className="font-bold text-sm text-rose-600 tabular-nums shrink-0">
                  {formatKsh(e.amount)}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : e.id)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                  aria-label={`View more for ${e.title}`}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div>
                    <p className="font-mono text-[11px]">
                      {e.referenceNumber} · {e.paymentMethod}
                    </p>
                    {e.payee && <p>Payee: {e.payee}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
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
              <th className="px-3 py-3 text-left">Title &amp; Date</th>
              <th className="px-3 py-3 text-left">Category</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {expenses.map((e) => {
              const isOpen = expandedId === e.id;
              return (
                <React.Fragment key={e.id}>
                  <tr
                    onClick={() => setExpandedId(isOpen ? null : e.id)}
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
                      <p className="font-medium text-slate-900">{e.title}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(e.expenseDate)} · <span className="font-mono">{e.referenceNumber}</span>
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge label={e.category} variant="slate" />
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-rose-600 tabular-nums whitespace-nowrap">
                      {formatKsh(e.amount)}
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Delete expense"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-10 py-2.5 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-4">
                          <span>Payment Method: <strong>{e.paymentMethod}</strong></span>
                          {e.payee && <span>Payee: <strong>{e.payee}</strong></span>}
                          {e.notes && <span className="italic">Note: {e.notes}</span>}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Business Expense">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={form.expenseDate}
                onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Description / Title
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Monthly shop rent"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Amount (KSh)
              </label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Payment Method
              </label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="MPESA">M-Pesa</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Payee (Optional)
            </label>
            <input
              type="text"
              value={form.payee}
              onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Save Expense
          </button>
        </form>
      </Modal>
    </div>
  );
}

