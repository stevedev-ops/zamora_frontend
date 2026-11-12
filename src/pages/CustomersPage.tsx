import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { SharePortalModal } from '../components/customers/SharePortalModal';
import { CustomerDebtTabModal } from '../components/customers/CustomerDebtTabModal';
import { useToast } from '../components/common/Toast';
import { ExportButtons } from '../components/common/ExportButtons';
import { buildExportQuery } from '../utils/export';
import { formatDate, formatKsh } from '../utils/format';

interface CustomerRow {
  id: string;
  accountNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  registeredAt: string;
  currentDebt: number;
  creditLimit: number;
  totalPurchases: number;
  totalPayments: number;
  portalUrl: string | null;
}

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hasDebtOnly, setHasDebtOnly] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    creditLimit: '5000',
    notes: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shareTarget, setShareTarget] = useState<CustomerRow | null>(null);
  const [tabTarget, setTabTarget] = useState<CustomerRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (hasDebtOnly) qs.set('hasDebt', 'true');
      const res = await api.get<{ customers: CustomerRow[] }>(`/customers?${qs.toString()}`);
      setCustomers(res.customers);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, hasDebtOnly, showToast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setCreateOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/customers', {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email || null,
        creditLimit: Number(form.creditLimit || 0),
        notes: form.notes || null,
      });
      showToast('Customer registered with debt portal link', 'success');
      setCreateOpen(false);
      setForm({ fullName: '', phone: '', email: '', creditLimit: '5000', notes: '' });
      await loadCustomers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not register customer', 'error');
    }
  };

  if (loading) return <LoadingState label="Loading customer accounts..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers (CRM)</h1>
          <p className="text-sm text-slate-500">
            Manage registered customers, credit limits, statements, and self-service portal links
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            filenameBase={hasDebtOnly ? 'zamora-debtors' : 'zamora-customers'}
            pdfPath={`/customers/export/pdf${buildExportQuery({
              search: search.trim(),
              hasDebt: hasDebtOnly,
            })}`}
            excelPath={`/customers/export/excel${buildExportQuery({
              search: search.trim(),
              hasDebt: hasDebtOnly,
            })}`}
            csvPath={`/customers/export/csv${buildExportQuery({
              search: search.trim(),
              hasDebt: hasDebtOnly,
            })}`}
            localCsv={{
              columns: [
                { header: 'Account #', value: (r) => r.accountNumber },
                { header: 'Customer Name', value: (r) => r.fullName },
                { header: 'Phone', value: (r) => r.phone },
                { header: 'Status', value: (r) => r.status },
                { header: 'Current Debt (KSh)', value: (r) => r.currentDebt },
                { header: 'Credit Limit (KSh)', value: (r) => r.creditLimit },
                { header: 'Total Purchases (KSh)', value: (r) => r.totalPurchases },
                { header: 'Total Payments (KSh)', value: (r) => r.totalPayments },
              ],
              rows: customers,
            }}
          />
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Register Customer
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, phone number, or account number (CUST-0001)..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={hasDebtOnly}
            onChange={(e) => setHasDebtOnly(e.target.checked)}
          />
          With Outstanding Debt Only
        </label>
      </div>

      {/* Mobile Compact Dropdown Cards */}
      <div className="md:hidden space-y-2">
        {customers.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            No customers found matching your filter.
          </div>
        ) : (
          customers.map((c) => {
            const isOpen = expandedId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/customers/${c.id}`}
                      className="font-semibold text-sm text-slate-900 truncate block hover:text-emerald-700"
                    >
                      {c.fullName}
                    </Link>
                    <p className="text-[11px] text-slate-500 truncate">
                      {c.accountNumber} · {c.phone}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        c.currentDebt > 0 ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatKsh(c.currentDebt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 shrink-0"
                    aria-label={`View more details for ${c.fullName}`}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {isOpen && (
                  <div className="pt-2 border-t border-slate-100 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 rounded-lg p-2">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Limit</span>
                        <span className="font-semibold text-slate-700">{formatKsh(c.creditLimit)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Purchases</span>
                        <span className="font-semibold text-slate-700">{formatKsh(c.totalPurchases)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Payments</span>
                        <span className="font-semibold text-emerald-700">
                          {formatKsh(c.totalPayments)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTabTarget(c)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Drinks Tab
                      </button>
                      {c.portalUrl && (
                        <button
                          type="button"
                          onClick={() => setShareTarget(c)}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          Portal Link
                        </button>
                      )}
                      <Link
                        to={`/customers/${c.id}`}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Profile
                      </Link>
                      <button
                        type="button"
                        disabled={c.currentDebt > 0}
                        onClick={() => setDeleteTarget(c)}
                        title={
                          c.currentDebt > 0
                            ? 'Cannot delete customer with active debt'
                            : 'Delete customer permanently'
                        }
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop 5-Column Screen-Fit Table with Arrow Dropdown */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-white text-xs uppercase tracking-wider">
            <tr>
              <th className="w-10 px-3 py-3"></th>
              <th className="px-3 py-3 text-left">Customer</th>
              <th className="px-3 py-3 text-right">Current Debt</th>
              <th className="px-3 py-3 text-right">Credit Limit</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  No customers found matching your filter.
                </td>
              </tr>
            )}
            {customers.map((c) => {
              const isOpen = expandedId === c.id;
              return (
                <React.Fragment key={c.id}>
                  <tr
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
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
                      <Link
                        to={`/customers/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        {c.fullName}
                      </Link>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{c.accountNumber}</span> · {c.phone}
                      </p>
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap ${
                        c.currentDebt > 0 ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatKsh(c.currentDebt)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600 whitespace-nowrap">
                      {formatKsh(c.creditLimit)}
                    </td>
                    <td
                      className="px-3 py-3 text-right whitespace-nowrap space-x-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setTabTarget(c)}
                        title="Add, edit, or remove drinks on this customer's debt tab"
                        className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-semibold ${
                          c.currentDebt > 0
                            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Drinks
                      </button>
                      <Link
                        to={`/customers/${c.id}`}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Link>
                      <button
                        type="button"
                        disabled={c.currentDebt > 0}
                        onClick={() => setDeleteTarget(c)}
                        title={
                          c.currentDebt > 0
                            ? 'Cannot delete a customer who owes debt'
                            : 'Delete customer permanently'
                        }
                        className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-10 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex flex-wrap items-center gap-4 text-slate-600">
                            <span>
                              Purchases: <strong className="text-slate-900">{formatKsh(c.totalPurchases)}</strong>
                            </span>
                            <span>
                              Payments: <strong className="text-emerald-700">{formatKsh(c.totalPayments)}</strong>
                            </span>
                            <span>Joined: {formatDate(c.registeredAt)}</span>
                            <StatusBadge
                              label={c.status}
                              variant={
                                c.status === 'ACTIVE'
                                  ? 'emerald'
                                  : c.status === 'SUSPENDED'
                                    ? 'rose'
                                    : 'slate'
                              }
                            />
                          </div>
                          {c.portalUrl && (
                            <button
                              type="button"
                              onClick={() => setShareTarget(c)}
                              className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                              Share Portal Link
                            </button>
                          )}
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

      {/* Register Customer Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register New Customer"
        subtitle="Automatically creates customer debt account and secure self-service portal link"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                required
                placeholder="0712345678"
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
              Credit Limit (KSh)
            </label>
            <input
              type="number"
              min="0"
              value={form.creditLimit}
              onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
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
            Register Customer
          </button>
        </form>
      </Modal>

      {shareTarget && shareTarget.portalUrl && (
        <SharePortalModal
          open={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
          customerId={shareTarget.id}
          customerName={shareTarget.fullName}
          customerPhone={shareTarget.phone}
          portalUrl={shareTarget.portalUrl}
          onRegenerated={loadCustomers}
        />
      )}

      <CustomerDebtTabModal
        open={Boolean(tabTarget)}
        onClose={() => setTabTarget(null)}
        customer={tabTarget}
        initialMode={tabTarget && tabTarget.currentDebt > 0 ? 'edit' : 'add'}
        onSuccess={loadCustomers}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.fullName || 'Customer'}?`}
        subtitle={
          deleteTarget
            ? `${deleteTarget.accountNumber} · Current Debt: ${formatKsh(deleteTarget.currentDebt)}`
            : undefined
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-1">
            <p className="font-semibold">
              This will permanently remove the customer profile and debt history.
            </p>
            <p>
              Customers with an unpaid balance cannot be deleted. Past store sales &amp; revenue
              totals stay preserved.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting || (deleteTarget?.currentDebt ?? 0) > 0}
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  await api.delete(`/customers/${deleteTarget.id}`);
                  showToast(`${deleteTarget.fullName} deleted`, 'success');
                  setDeleteTarget(null);
                  await loadCustomers();
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
                } finally {
                  setDeleting(false);
                }
              }}
              className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Confirm Delete Customer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

