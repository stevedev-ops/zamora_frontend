import { apiUrl, getStoredOwnerToken } from '../api/config';
import {
  cacheGet,
  cacheGetAll,
  cacheSet,
  generateOfflineId,
  outboxDelete,
  outboxList,
  outboxPut,
  OutboxItem,
  OutboxMutationKind,
} from './offlineDb';

const TEMP_ID_MAP_KEY = 'META:tempIdMap';

type SyncListener = () => void;
const listeners = new Set<SyncListener>();

let isSyncing = false;
let syncPromise: Promise<{ synced: number; failed: number }> | null = null;
let lastSyncAt: number | null = null;

export function subscribeSyncState(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

export function getSyncMeta() {
  return { isSyncing, lastSyncAt };
}

export function isOfflineNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === 'NetworkError') return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('err_internet_disconnected') ||
      msg.includes('load failed')
    );
  }
  return false;
}

export function classifyMutation(method: string, path: string): OutboxMutationKind | null {
  const upper = method.toUpperCase();
  if (upper === 'POST' && path === '/customers') return 'CREATE_CUSTOMER';
  if (upper === 'PATCH' && /^\/customers\/[^/]+$/.test(path)) return 'UPDATE_CUSTOMER';
  if (upper === 'POST' && /^\/customers\/[^/]+\/credit-limit$/.test(path)) return 'UPDATE_CREDIT_LIMIT';
  if (upper === 'POST' && path === '/sales') return 'CREATE_SALE';
  if (upper === 'PATCH' && /^\/sales\/[^/]+\/items$/.test(path)) return 'UPDATE_SALE_ITEMS';
  if (upper === 'POST' && path === '/debt/repayments') return 'RECORD_REPAYMENT';
  if (upper === 'POST' && path === '/debt/adjustments') return 'ADD_OR_ADJUST_DEBT';
  if (upper === 'POST' && /^\/debt\/transactions\/[^/]+\/reverse$/.test(path)) return 'REVERSE_TX';
  if (upper === 'POST' && path === '/expenses') return 'CREATE_EXPENSE';
  if (upper === 'DELETE' && /^\/expenses\/[^/]+$/.test(path)) return 'DELETE_EXPENSE';
  if (upper === 'POST' && path === '/products') return 'CREATE_PRODUCT';
  if (upper === 'PATCH' && /^\/products\/[^/]+$/.test(path)) return 'UPDATE_PRODUCT';
  if (upper === 'POST' && path === '/categories') return 'CREATE_CATEGORY';
  if (upper === 'DELETE' && /^\/categories\/[^/]+$/.test(path)) return 'DELETE_CATEGORY';
  if (upper === 'POST' && path === '/suppliers') return 'CREATE_SUPPLIER';
  if (upper === 'PATCH' && /^\/suppliers\/[^/]+$/.test(path)) return 'UPDATE_SUPPLIER';
  if (upper === 'POST' && path === '/purchases') return 'CREATE_PURCHASE';
  if (upper === 'POST' && path === '/inventory/adjust') return 'ADJUST_INVENTORY';
  if (upper === 'PATCH' && path === '/settings') return 'UPDATE_SETTINGS';
  return null;
}

function summarizeMutation(kind: OutboxMutationKind, body: Record<string, unknown>): string {
  switch (kind) {
    case 'CREATE_CUSTOMER':
      return `Register customer: ${String(body.fullName || 'Customer')}`;
    case 'UPDATE_CUSTOMER':
      return `Update customer: ${String(body.fullName || 'Profile')}`;
    case 'UPDATE_CREDIT_LIMIT':
      return `Update credit limit: KSh ${Number(body.creditLimit || 0).toLocaleString()}`;
    case 'CREATE_SALE': {
      const items = Array.isArray(body.items) ? body.items : [];
      const qtySum = items.reduce((s, it) => s + Number((it as { quantity?: number }).quantity || 0), 0);
      return `Sale (${qtySum} item${qtySum === 1 ? '' : 's'}) via ${String(body.paymentMethod || 'POS')}`;
    }
    case 'UPDATE_SALE_ITEMS':
      return 'Edit credit tab drinks';
    case 'RECORD_REPAYMENT':
      return `Repayment KSh ${Number(body.amount || 0).toLocaleString()} (${String(body.method || 'CASH')})`;
    case 'ADD_OR_ADJUST_DEBT':
      return `${String(body.adjustmentKind || 'Debt')} KSh ${Number(body.amount || 0).toLocaleString()}`;
    case 'REVERSE_TX':
      return 'Reverse ledger transaction';
    case 'CREATE_EXPENSE':
      return `Expense: ${String(body.title || 'Item')} (KSh ${Number(body.amount || 0).toLocaleString()})`;
    case 'DELETE_EXPENSE':
      return 'Delete expense';
    case 'CREATE_PRODUCT':
      return `Add product: ${String(body.name || 'Drink')}`;
    case 'UPDATE_PRODUCT':
      return `Update product: ${String(body.name || 'Drink')}`;
    case 'CREATE_CATEGORY':
      return `Add category: ${String(body.name || 'Category')}`;
    case 'DELETE_CATEGORY':
      return 'Delete category';
    case 'CREATE_SUPPLIER':
      return `Add supplier: ${String(body.name || 'Supplier')}`;
    case 'UPDATE_SUPPLIER':
      return `Update supplier: ${String(body.name || 'Supplier')}`;
    case 'CREATE_PURCHASE': {
      const purchaseItems = Array.isArray(body.items) ? body.items : [];
      const qtySum = purchaseItems.reduce(
        (s, it) => s + Number((it as { quantity?: number }).quantity || 0),
        0
      );
      return `Stock purchase (${qtySum || Number(body.quantityPurchased || 0)} units)`;
    }
    case 'ADJUST_INVENTORY':
      return `Stock ${String(body.operation || 'ADJUST')} (${Number(body.quantity || 0)} units)`;
    case 'UPDATE_SETTINGS':
      return 'Update store settings';
  }
}

async function getCachedProductMap(): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const all = await cacheGetAll();
  for (const entry of all) {
    if (!entry.key.startsWith('GET:/products')) continue;
    const payload = entry.data as { products?: Array<Record<string, unknown>> } | null;
    if (payload?.products && Array.isArray(payload.products)) {
      for (const p of payload.products) {
        if (typeof p.id === 'string') {
          map.set(p.id, p);
        }
      }
    }
  }
  return map;
}

async function updateAllCachedCustomers(
  updater: (customers: Array<Record<string, unknown>>) => Array<Record<string, unknown>>
) {
  const all = await cacheGetAll();
  for (const entry of all) {
    if (entry.key !== 'GET:/customers' && !entry.key.startsWith('GET:/customers?')) continue;
    const payload = entry.data as { customers?: Array<Record<string, unknown>> } | null;
    if (payload?.customers && Array.isArray(payload.customers)) {
      await cacheSet(entry.key, { ...payload, customers: updater(payload.customers) });
    }
  }
}

function getProfileRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return raw.customer && typeof raw.customer === 'object'
    ? (raw.customer as Record<string, unknown>)
    : raw;
}

function withUpdatedProfileRecord(
  raw: Record<string, unknown>,
  nextRecord: Record<string, unknown>
): Record<string, unknown> {
  return raw.customer && typeof raw.customer === 'object'
    ? { ...raw, customer: nextRecord }
    : nextRecord;
}

async function updateCachedCustomerDebt(
  customerId: string,
  deltaDebt: number,
  extra?: { purchaseDelta?: number; paymentDelta?: number; newSale?: Record<string, unknown> }
): Promise<number> {
  let latestBalance = Math.max(0, deltaDebt);
  const all = await cacheGetAll();
  for (const entry of all) {
    if (entry.key === 'GET:/customers' || entry.key.startsWith('GET:/customers?')) {
      const payload = entry.data as { customers?: Array<Record<string, unknown>> } | null;
      if (payload?.customers) {
        const nextList = payload.customers.map((c) => {
          if (c.id !== customerId) return c;
          const nextDebt = Math.max(0, Number(c.currentDebt || 0) + deltaDebt);
          latestBalance = nextDebt;
          return {
            ...c,
            currentDebt: nextDebt,
            totalPurchases: Number(c.totalPurchases || 0) + (extra?.purchaseDelta || 0),
            totalPayments: Number(c.totalPayments || 0) + (extra?.paymentDelta || 0),
          };
        });
        await cacheSet(entry.key, { ...payload, customers: nextList });
      }
    } else if (entry.key === `GET:/customers/${customerId}`) {
      const rawProfile = entry.data as Record<string, unknown> | null;
      if (rawProfile && typeof rawProfile === 'object') {
        const profile = getProfileRecord(rawProfile);
        const account = (profile.account as Record<string, unknown>) || {};
        const nextDebt = Math.max(0, Number(account.currentBalance || 0) + deltaDebt);
        latestBalance = nextDebt;
        const existingSales = Array.isArray(profile.sales)
          ? (profile.sales as Array<Record<string, unknown>>)
          : [];
        const nextProfile = {
          ...profile,
          account: {
            ...account,
            currentBalance: nextDebt,
            totalPurchases: Number(account.totalPurchases || 0) + (extra?.purchaseDelta || 0),
            totalPayments: Number(account.totalPayments || 0) + (extra?.paymentDelta || 0),
            lastTransactionAt: new Date().toISOString(),
          },
          sales: extra?.newSale ? [extra.newSale, ...existingSales] : existingSales,
        };
        await cacheSet(entry.key, withUpdatedProfileRecord(rawProfile, nextProfile));
      }
    }
  }
  return latestBalance;
}

async function patchCachedDashboard(delta: {
  salesToday?: number;
  salesCount?: number;
  debtDelta?: number;
  paymentsDelta?: number;
  newSale?: Record<string, unknown>;
}) {
  const all = await cacheGetAll();
  for (const entry of all) {
    if (!entry.key.startsWith('GET:/dashboard')) continue;
    const dash = entry.data as {
      kpis?: Record<string, number>;
      recentSales?: Array<Record<string, unknown>>;
    } | null;
    if (!dash?.kpis) continue;
    const nextKpis = {
      ...dash.kpis,
      totalSalesToday: Number(dash.kpis.totalSalesToday || 0) + (delta.salesToday || 0),
      totalSalesThisMonth: Number(dash.kpis.totalSalesThisMonth || 0) + (delta.salesToday || 0),
      salesCountToday: Number(dash.kpis.salesCountToday || 0) + (delta.salesCount || 0),
      salesCountThisMonth: Number(dash.kpis.salesCountThisMonth || 0) + (delta.salesCount || 0),
      totalOutstandingDebt: Math.max(
        0,
        Number(dash.kpis.totalOutstandingDebt || 0) + (delta.debtDelta || 0)
      ),
      paymentsReceivedToday:
        Number(dash.kpis.paymentsReceivedToday || 0) + (delta.paymentsDelta || 0),
      paymentsReceivedThisMonth:
        Number(dash.kpis.paymentsReceivedThisMonth || 0) + (delta.paymentsDelta || 0),
      totalPaymentsReceived:
        Number(dash.kpis.totalPaymentsReceived || 0) + (delta.paymentsDelta || 0),
    };
    const nextRecentSales = delta.newSale
      ? [
          {
            id: delta.newSale.id,
            receiptNumber: delta.newSale.receiptNumber,
            customerName: 'Offline Order',
            paymentMethod: delta.newSale.paymentMethod,
            totalAmount: delta.newSale.totalAmount,
            amountPaid: delta.newSale.amountPaid,
            outstandingAmount: delta.newSale.outstandingAmount,
            grossProfit: 0,
            itemCount: Array.isArray(delta.newSale.items) ? delta.newSale.items.length : 1,
            soldAt: delta.newSale.soldAt,
          },
          ...(dash.recentSales || []),
        ].slice(0, 8)
      : dash.recentSales;

    await cacheSet(entry.key, {
      ...dash,
      kpis: nextKpis,
      ...(nextRecentSales ? { recentSales: nextRecentSales } : {}),
    });
  }
}

async function adjustCachedProductStocks(deltas: Array<{ productId: string; delta: number }>) {
  if (deltas.length === 0) return;
  const deltaMap = new Map(deltas.map((d) => [d.productId, d.delta]));
  const all = await cacheGetAll();
  for (const entry of all) {
    if (!entry.key.startsWith('GET:/products') && !entry.key.startsWith('GET:/inventory')) continue;
    const payload = entry.data as {
      products?: Array<Record<string, unknown>>;
      items?: Array<Record<string, unknown>>;
    } | null;
    const applyDelta = (rows: Array<Record<string, unknown>>) =>
      rows.map((p) => {
        const delta = deltaMap.get(String(p.id));
        if (!delta) return p;
        return {
          ...p,
          currentStock: Math.max(0, Number(p.currentStock || 0) + delta),
        };
      });
    if (payload?.products && Array.isArray(payload.products)) {
      await cacheSet(entry.key, { ...payload, products: applyDelta(payload.products) });
    } else if (payload?.items && Array.isArray(payload.items)) {
      await cacheSet(entry.key, { ...payload, items: applyDelta(payload.items) });
    }
  }
}

async function updateCachedArray(
  keyPrefix: string,
  field: string,
  updater: (items: Array<Record<string, unknown>>) => Array<Record<string, unknown>>
) {
  const all = await cacheGetAll();
  for (const entry of all) {
    if (entry.key !== keyPrefix && !entry.key.startsWith(`${keyPrefix}?`)) continue;
    const payload = entry.data as Record<string, unknown> | null;
    if (payload && Array.isArray(payload[field])) {
      await cacheSet(entry.key, {
        ...payload,
        [field]: updater(payload[field] as Array<Record<string, unknown>>),
      });
    }
  }
}

export async function queueOfflineMutation<T>(
  kind: OutboxMutationKind,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  rawBody: Record<string, unknown>
): Promise<T> {
  const idempotencyKey =
    typeof rawBody.idempotencyKey === 'string' && rawBody.idempotencyKey
      ? rawBody.idempotencyKey
      : generateOfflineId('idem');

  const bodyWithKey = method === 'DELETE' ? rawBody : { ...rawBody, idempotencyKey };
  let optimisticResponse: Record<string, unknown> = { offlineQueued: true };
  let tempCustomerId: string | undefined;
  let tempId: string | undefined;
  let tempEntityKind: OutboxItem['tempEntityKind'];

  if (kind === 'CREATE_CUSTOMER') {
    tempCustomerId = generateOfflineId('tmp-cust');
    tempId = tempCustomerId;
    tempEntityKind = 'customer';
    const nowIso = new Date().toISOString();
    const syntheticCustomer = {
      id: tempCustomerId,
      accountNumber: 'PENDING-SYNC',
      fullName: String(rawBody.fullName || ''),
      phone: String(rawBody.phone || ''),
      email: rawBody.email ?? null,
      status: 'ACTIVE',
      notes: rawBody.notes ?? null,
      creditLimit: Number(rawBody.creditLimit || 0),
      currentDebt: 0,
      totalPurchases: 0,
      totalPayments: 0,
      registeredAt: nowIso,
      portalUrl: '',
      _offlinePending: true,
    };

    await updateAllCachedCustomers((list) => [syntheticCustomer, ...list]);
    await cacheSet(`GET:/customers/${tempCustomerId}`, {
      ...syntheticCustomer,
      account: {
        currentBalance: 0,
        creditLimit: Number(rawBody.creditLimit || 0),
        totalPurchases: 0,
        totalPayments: 0,
        totalTransferredIn: 0,
        totalTransferredOut: 0,
        lastTransactionAt: null,
      },
      whatsappShareUrl: '',
      creditLimitHistory: [],
      sales: [],
      payments: [],
      debtTransactions: [],
    });
    optimisticResponse = { customer: syntheticCustomer, offlineQueued: true };
  } else if (kind === 'CREATE_SALE') {
    const productMap = await getCachedProductMap();
    const rawItems = Array.isArray(rawBody.items)
      ? (rawBody.items as Array<{ productId: string; quantity: number }>)
      : [];
    const saleItems = rawItems.map((it) => {
      const p = productMap.get(it.productId);
      const price = Number(p?.sellingPrice || 0);
      return {
        id: generateOfflineId('tmp-item'),
        productId: it.productId,
        productName: String(p?.name || 'Drink'),
        brand: String(p?.brand || ''),
        bottleSize: String(p?.bottleSize || ''),
        quantity: Number(it.quantity || 0),
        unitSellingPrice: price,
        lineTotal: price * Number(it.quantity || 0),
      };
    });

    const subtotal = saleItems.reduce((s, it) => s + it.lineTotal, 0);
    const discountAmount = Number(rawBody.discountAmount || 0);
    const totalAmount = Math.max(0, subtotal - discountAmount);
    const pm = String(rawBody.paymentMethod || 'CASH');
    const cashAmount =
      pm === 'CASH' ? totalAmount : pm === 'SPLIT' ? Number(rawBody.cashAmount || 0) : 0;
    const mpesaAmount =
      pm === 'MPESA' ? totalAmount : pm === 'SPLIT' ? Number(rawBody.mpesaAmount || 0) : 0;
    const amountPaid = Math.min(totalAmount, cashAmount + mpesaAmount);
    const outstandingAmount = Math.max(0, totalAmount - amountPaid);

    const tmpSaleId = generateOfflineId('tmp-sale');
    tempId = tmpSaleId;
    tempEntityKind = 'sale';
    const syntheticSale = {
      id: tmpSaleId,
      receiptNumber: `OFFLINE-${Date.now().toString().slice(-5)}`,
      soldAt: new Date().toISOString(),
      status: 'COMPLETED',
      paymentMethod: pm,
      subtotal,
      discountAmount,
      totalAmount,
      cashAmount,
      mpesaAmount,
      amountPaid,
      outstandingAmount,
      notes: (rawBody.notes as string) || null,
      items: saleItems,
      _offlinePending: true,
    };

    await adjustCachedProductStocks(
      rawItems.map((it) => ({ productId: it.productId, delta: -Number(it.quantity || 0) }))
    );

    let newBal: number | null = null;
    if (typeof rawBody.customerId === 'string' && rawBody.customerId) {
      newBal = await updateCachedCustomerDebt(rawBody.customerId, outstandingAmount, {
        purchaseDelta: totalAmount,
        paymentDelta: amountPaid,
        newSale: syntheticSale,
      });
    }

    await patchCachedDashboard({
      salesToday: totalAmount,
      salesCount: 1,
      debtDelta: outstandingAmount,
      paymentsDelta: amountPaid,
      newSale: syntheticSale,
    });

    optimisticResponse = {
      sale: syntheticSale,
      customerNewBalance: newBal,
      offlineQueued: true,
    };
  } else if (kind === 'UPDATE_SALE_ITEMS') {
    const saleId = path.split('/')[2];
    const productMap = await getCachedProductMap();
    const rawItems = Array.isArray(rawBody.items)
      ? (rawBody.items as Array<{ productId: string; quantity: number }>)
      : [];

    type CachedSaleShape = {
      id: string;
      customerId?: string | null;
      totalAmount?: number;
      cashAmount?: number;
      mpesaAmount?: number;
      amountPaid?: number;
      outstandingAmount?: number;
      paymentMethod?: string;
      mpesaReference?: string | null;
      notes?: string | null;
      items?: Array<{ productId?: string; quantity?: number }>;
      shares?: Array<{
        id?: string;
        customerId?: string | null;
        payerName?: string | null;
        cashAmount?: number;
        mpesaAmount?: number;
        paidAmount?: number;
        debtAmount?: number;
        shareTotal?: number;
        notes?: string | null;
      }>;
    };

    let foundSale: CachedSaleShape | null = null;
    let matchedCustomerId: string | null = null;
    const allCaches = await cacheGetAll();

    // 1. Inspect cached sales lists, single-sale caches, and wrapped/unwrapped customer profiles
    for (const entry of allCaches) {
      if (entry.key === `GET:/sales/${saleId}`) {
        const wrapped = entry.data as { sale?: CachedSaleShape } | CachedSaleShape | null;
        const s = wrapped && 'sale' in wrapped ? wrapped.sale : (wrapped as CachedSaleShape | null);
        if (s && s.id === saleId) {
          foundSale = s;
          matchedCustomerId = s.customerId ?? null;
          break;
        }
      } else if (entry.key === 'GET:/sales' || entry.key.startsWith('GET:/sales?')) {
        const list = (entry.data as { sales?: CachedSaleShape[] } | null)?.sales;
        const s = list?.find((row) => row.id === saleId);
        if (s) {
          foundSale = s;
          matchedCustomerId = s.customerId ?? null;
          break;
        }
      } else if (entry.key.startsWith('GET:/customers/')) {
        const raw = entry.data as Record<string, unknown> | null;
        if (!raw || typeof raw !== 'object') continue;
        const profile = getProfileRecord(raw);
        const profileSales = Array.isArray(profile.sales) ? (profile.sales as CachedSaleShape[]) : [];
        const s = profileSales.find((row) => row.id === saleId);
        if (s) {
          foundSale = s;
          matchedCustomerId =
            s.customerId ??
            (typeof profile.id === 'string' ? profile.id : null) ??
            entry.key.replace('GET:/customers/', '');
          break;
        }
      }
    }

    const oldQtyByProd = new Map<string, number>();
    for (const oldIt of foundSale?.items || []) {
      if (oldIt.productId) {
        oldQtyByProd.set(
          oldIt.productId,
          (oldQtyByProd.get(oldIt.productId) || 0) + Number(oldIt.quantity || 0)
        );
      }
    }

    const newQtyByProd = new Map<string, number>();
    for (const it of rawItems) {
      newQtyByProd.set(it.productId, (newQtyByProd.get(it.productId) || 0) + Number(it.quantity || 0));
    }
    const allProductIds = new Set([...oldQtyByProd.keys(), ...newQtyByProd.keys()]);
    const stockDeltas: Array<{ productId: string; delta: number }> = [];
    for (const pid of allProductIds) {
      const diff = (newQtyByProd.get(pid) || 0) - (oldQtyByProd.get(pid) || 0);
      if (diff !== 0) {
        stockDeltas.push({ productId: pid, delta: -diff });
      }
    }
    if (stockDeltas.length > 0) {
      await adjustCachedProductStocks(stockDeltas);
    }

    const items = rawItems.map((it) => {
      const p = productMap.get(it.productId);
      const price = Number(p?.sellingPrice || 0);
      return {
        id: generateOfflineId('tmp-item'),
        productId: it.productId,
        productName: String(p?.name || 'Drink'),
        brand: String(p?.brand || ''),
        bottleSize: String(p?.bottleSize || ''),
        quantity: Number(it.quantity || 0),
        unitSellingPrice: price,
        lineTotal: price * Number(it.quantity || 0),
      };
    });

    const isVoided = items.length === 0;
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const discountAmount = isVoided ? 0 : Number(rawBody.discountAmount || 0);
    const totalAmount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

    const oldSaleTotal = Number(foundSale?.totalAmount || 0);
    const oldCash = Number(foundSale?.cashAmount ?? 0);
    const oldMpesa = Number(foundSale?.mpesaAmount ?? 0);
    const oldPaid = Number(foundSale?.amountPaid ?? oldCash + oldMpesa);
    const oldOutstanding = Number(foundSale?.outstandingAmount ?? Math.max(0, oldSaleTotal - oldPaid));
    const oldShares = foundSale?.shares || [];
    const oldPaymentMethod = String(foundSale?.paymentMethod || (matchedCustomerId ? 'CREDIT' : 'CASH'));

    let cashAmount = 0;
    let mpesaAmount = 0;
    let amountPaid = 0;
    let outstandingAmount = 0;
    let paymentMethod = oldPaymentMethod;
    let nextShares = oldShares;
    let updatedCustomerBal: number | undefined;

    const rawSplitShares = Array.isArray(rawBody.splitShares)
      ? (rawBody.splitShares as Array<{
          customerId?: string | null;
          payerName?: string | null;
          cashAmount?: number;
          mpesaAmount?: number;
          debtAmount?: number;
          notes?: string | null;
        }>)
      : null;

    if (oldShares.length > 1 || (rawSplitShares && rawSplitShares.length >= 2)) {
      const oldByCust = new Map<string, { debt: number; paid: number; total: number }>();
      for (const sh of oldShares) {
        if (!sh.customerId) continue;
        const cur = oldByCust.get(sh.customerId) || { debt: 0, paid: 0, total: 0 };
        cur.debt += Number(sh.debtAmount || 0);
        cur.paid += Number(sh.paidAmount || 0);
        cur.total += Number(sh.shareTotal || 0);
        oldByCust.set(sh.customerId, cur);
      }

      const newByCust = new Map<string, { debt: number; paid: number; total: number }>();
      if (isVoided) {
        nextShares = oldShares.map((sh) => ({
          ...sh,
          cashAmount: 0,
          mpesaAmount: 0,
          paidAmount: 0,
          debtAmount: 0,
          shareTotal: 0,
        }));
      } else if (rawSplitShares) {
        paymentMethod = 'SPLIT';
        nextShares = rawSplitShares.map((sh, idx) => {
          const c = Number(sh.cashAmount || 0);
          const m = Number(sh.mpesaAmount || 0);
          const d = Number(sh.debtAmount || 0);
          const paid = c + m;
          const total = paid + d;
          cashAmount += c;
          mpesaAmount += m;
          outstandingAmount += d;
          if (sh.customerId) {
            const cur = newByCust.get(sh.customerId) || { debt: 0, paid: 0, total: 0 };
            cur.debt += d;
            cur.paid += paid;
            cur.total += total;
            newByCust.set(sh.customerId, cur);
          }
          return {
            id: generateOfflineId('tmp-share'),
            customerId: sh.customerId ?? null,
            payerName: sh.payerName || `Person ${idx + 1}`,
            cashAmount: c,
            mpesaAmount: m,
            paidAmount: paid,
            debtAmount: d,
            shareTotal: total,
            notes: sh.notes ?? null,
          };
        });
        amountPaid = cashAmount + mpesaAmount;
      }

      const custIds = new Set([...oldByCust.keys(), ...newByCust.keys()]);
      for (const cid of custIds) {
        const prev = oldByCust.get(cid) || { debt: 0, paid: 0, total: 0 };
        const next = newByCust.get(cid) || { debt: 0, paid: 0, total: 0 };
        const debtDelta = next.debt - prev.debt;
        const purchaseDelta = next.total - prev.total;
        const paymentDelta = next.paid - prev.paid;
        if (debtDelta !== 0 || purchaseDelta !== 0 || paymentDelta !== 0) {
          const bal = await updateCachedCustomerDebt(cid, debtDelta, {
            purchaseDelta,
            paymentDelta,
          });
          if (cid === matchedCustomerId || updatedCustomerBal === undefined) {
            updatedCustomerBal = bal;
          }
        }
      }
      await patchCachedDashboard({
        salesToday: totalAmount - oldSaleTotal,
        debtDelta: outstandingAmount - oldOutstanding,
        paymentsDelta: amountPaid - oldPaid,
      });
    } else {
      if (!isVoided) {
        const hasExplicit = rawBody.cashAmount !== undefined || rawBody.mpesaAmount !== undefined;
        if (hasExplicit) {
          cashAmount = Math.max(0, Number(rawBody.cashAmount ?? 0));
          mpesaAmount = Math.max(0, Number(rawBody.mpesaAmount ?? 0));
        } else if (!matchedCustomerId) {
          if (oldPaymentMethod === 'MPESA' || (oldMpesa > 0 && oldCash === 0)) {
            mpesaAmount = totalAmount;
          } else if (oldPaymentMethod === 'CASH' || (oldCash > 0 && oldMpesa === 0) || oldPaid <= 0) {
            cashAmount = totalAmount;
          } else {
            cashAmount = Math.round(((totalAmount * oldCash) / oldPaid) * 100) / 100;
            mpesaAmount = Math.round((totalAmount - cashAmount) * 100) / 100;
          }
        } else if (totalAmount >= oldPaid) {
          cashAmount = oldCash;
          mpesaAmount = oldMpesa;
        } else if (oldPaid > 0) {
          cashAmount = Math.round(((totalAmount * oldCash) / oldPaid) * 100) / 100;
          mpesaAmount = Math.round((totalAmount - cashAmount) * 100) / 100;
        }
        amountPaid = Math.round((cashAmount + mpesaAmount) * 100) / 100;
        outstandingAmount = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);
        if (totalAmount > 0) {
          if (outstandingAmount === totalAmount) paymentMethod = 'CREDIT';
          else if (cashAmount === totalAmount) paymentMethod = 'CASH';
          else if (mpesaAmount === totalAmount) paymentMethod = 'MPESA';
          else paymentMethod = 'SPLIT';
        }
      }

      const debtDelta = matchedCustomerId ? outstandingAmount - oldOutstanding : 0;
      if (matchedCustomerId) {
        updatedCustomerBal = await updateCachedCustomerDebt(matchedCustomerId, debtDelta, {
          purchaseDelta: totalAmount - oldSaleTotal,
          paymentDelta: amountPaid - oldPaid,
        });
      }
      await patchCachedDashboard({
        salesToday: totalAmount - oldSaleTotal,
        debtDelta,
        paymentsDelta: amountPaid - oldPaid,
      });
    }

    const patchSaleRecord = (s: Record<string, unknown>) =>
      s.id !== saleId
        ? s
        : {
            ...s,
            status: isVoided ? 'VOIDED' : 'COMPLETED',
            subtotal,
            discountAmount,
            totalAmount,
            cashAmount,
            mpesaAmount,
            amountPaid,
            outstandingAmount,
            paymentMethod,
            mpesaReference:
              rawBody.mpesaReference !== undefined
                ? ((rawBody.mpesaReference as string | null) ?? null)
                : s.mpesaReference ?? null,
            notes: rawBody.notes !== undefined ? ((rawBody.notes as string | null) ?? null) : s.notes ?? null,
            items,
            shares: nextShares,
            _offlinePending: true,
          };

    for (const entry of allCaches) {
      if (entry.key === `GET:/sales/${saleId}`) {
        const data = entry.data as Record<string, unknown> | null;
        if (data && typeof data === 'object') {
          if ('sale' in data && data.sale && typeof data.sale === 'object') {
            await cacheSet(entry.key, {
              ...data,
              sale: patchSaleRecord(data.sale as Record<string, unknown>),
            });
          } else {
            await cacheSet(entry.key, patchSaleRecord(data));
          }
        }
      } else if (entry.key === 'GET:/sales' || entry.key.startsWith('GET:/sales?')) {
        const data = entry.data as { sales?: Array<Record<string, unknown>> } | null;
        if (Array.isArray(data?.sales)) {
          await cacheSet(entry.key, { ...data, sales: data.sales.map(patchSaleRecord) });
        }
      } else if (entry.key.startsWith('GET:/customers/')) {
        const raw = entry.data as Record<string, unknown> | null;
        if (!raw || typeof raw !== 'object') continue;
        const profile = getProfileRecord(raw);
        if (Array.isArray(profile.sales)) {
          const nextSales = (profile.sales as Array<Record<string, unknown>>).map(patchSaleRecord);
          await cacheSet(entry.key, withUpdatedProfileRecord(raw, { ...profile, sales: nextSales }));
        }
      }
    }

    optimisticResponse = {
      sale: patchSaleRecord((foundSale as Record<string, unknown>) || { id: saleId }),
      newCustomerBalance: updatedCustomerBal,
      offlineQueued: true,
    };
  } else if (kind === 'RECORD_REPAYMENT') {
    const amount = Number(rawBody.amount || 0);
    const newBalance =
      typeof rawBody.customerId === 'string'
        ? await updateCachedCustomerDebt(rawBody.customerId, -amount, { paymentDelta: amount })
        : 0;
    await patchCachedDashboard({ debtDelta: -amount, paymentsDelta: amount });
    optimisticResponse = {
      payment: {
        id: generateOfflineId('tmp-pay'),
        referenceNumber: `OFF-PAY-${Date.now().toString().slice(-4)}`,
        amount,
        method: rawBody.method || 'CASH',
      },
      newBalance,
      offlineQueued: true,
    };
  } else if (kind === 'ADD_OR_ADJUST_DEBT') {
    const amount = Number(rawBody.amount || 0);
    const isAdd = rawBody.adjustmentKind === 'ADD_DEBT';
    const newBalance =
      typeof rawBody.customerId === 'string'
        ? await updateCachedCustomerDebt(rawBody.customerId, isAdd ? amount : -amount)
        : 0;
    await patchCachedDashboard({ debtDelta: isAdd ? amount : -amount });
    optimisticResponse = {
      transaction: {
        id: generateOfflineId('tmp-adj'),
        referenceNumber: `OFF-ADJ-${Date.now().toString().slice(-4)}`,
        amount,
        runningBalance: newBalance,
      },
      newBalance,
      offlineQueued: true,
    };
  } else if (kind === 'CREATE_EXPENSE') {
    const tmpExpId = generateOfflineId('tmp-exp');
    tempId = tmpExpId;
    tempEntityKind = 'expense';
    const syntheticExpense = { id: tmpExpId, ...rawBody, _offlinePending: true };
    await updateCachedArray('GET:/expenses', 'expenses', (list) => [syntheticExpense, ...list]);
    optimisticResponse = {
      expense: syntheticExpense,
      offlineQueued: true,
    };
  } else if (kind === 'DELETE_EXPENSE') {
    const expId = path.split('/')[2];
    await updateCachedArray('GET:/expenses', 'expenses', (list) =>
      list.filter((e) => String(e.id) !== expId)
    );
    optimisticResponse = { deleted: true, offlineQueued: true };
  } else if (kind === 'CREATE_PRODUCT') {
    const tmpProdId = generateOfflineId('tmp-prod');
    tempId = tmpProdId;
    tempEntityKind = 'product';
    const syntheticProduct = {
      id: tmpProdId,
      name: String(rawBody.name || ''),
      brand: String(rawBody.brand || ''),
      bottleSize: String(rawBody.bottleSize || ''),
      barcode: rawBody.barcode ?? null,
      sellingPrice: Number(rawBody.sellingPrice || 0),
      purchasePrice: Number(rawBody.purchasePrice || 0),
      currentStock: Number(rawBody.initialStock || 0),
      minStockAlert: Number(rawBody.minStockAlert || 5),
      categoryId: rawBody.categoryId,
      supplierId: rawBody.supplierId ?? null,
      status: rawBody.status || 'ACTIVE',
      category: null,
      _offlinePending: true,
    };
    await updateCachedArray('GET:/products', 'products', (list) => [syntheticProduct, ...list]);
    optimisticResponse = { product: syntheticProduct, offlineQueued: true };
  } else if (kind === 'UPDATE_PRODUCT') {
    const prodId = path.split('/')[2];
    await updateCachedArray('GET:/products', 'products', (list) =>
      list.map((p) => (String(p.id) === prodId ? { ...p, ...rawBody, _offlinePending: true } : p))
    );
    optimisticResponse = { product: { id: prodId, ...rawBody }, offlineQueued: true };
  } else if (kind === 'CREATE_CATEGORY') {
    const tmpCatId = generateOfflineId('tmp-cat');
    tempId = tmpCatId;
    tempEntityKind = 'category';
    const syntheticCat = { id: tmpCatId, ...rawBody, productCount: 0, _offlinePending: true };
    await updateCachedArray('GET:/categories', 'categories', (list) => [...list, syntheticCat]);
    optimisticResponse = { category: syntheticCat, offlineQueued: true };
  } else if (kind === 'DELETE_CATEGORY') {
    const catId = path.split('/')[2];
    await updateCachedArray('GET:/categories', 'categories', (list) =>
      list.filter((c) => String(c.id) !== catId)
    );
    optimisticResponse = { deleted: true, offlineQueued: true };
  } else if (kind === 'CREATE_SUPPLIER') {
    const tmpSupId = generateOfflineId('tmp-sup');
    tempId = tmpSupId;
    tempEntityKind = 'supplier';
    const syntheticSup = { id: tmpSupId, ...rawBody, _offlinePending: true };
    await updateCachedArray('GET:/suppliers', 'suppliers', (list) => [...list, syntheticSup]);
    optimisticResponse = { supplier: syntheticSup, offlineQueued: true };
  } else if (kind === 'UPDATE_SUPPLIER') {
    const supId = path.split('/')[2];
    await updateCachedArray('GET:/suppliers', 'suppliers', (list) =>
      list.map((s) => (String(s.id) === supId ? { ...s, ...rawBody, _offlinePending: true } : s))
    );
    optimisticResponse = { supplier: { id: supId, ...rawBody }, offlineQueued: true };
  } else if (kind === 'CREATE_PURCHASE') {
    const purchaseItems = Array.isArray(rawBody.items)
      ? (rawBody.items as Array<{ productId?: string; quantity?: number; unitCostPrice?: number }>)
      : [];
    const stockAdds: Array<{ productId: string; delta: number }> = [];
    let totalPurchaseCost = 0;
    for (const line of purchaseItems) {
      const q = Number(line.quantity || 0);
      const u = Number(line.unitCostPrice || 0);
      totalPurchaseCost += q * u;
      if (typeof line.productId === 'string' && q > 0) {
        stockAdds.push({ productId: line.productId, delta: q });
      }
    }
    if (stockAdds.length > 0) {
      await adjustCachedProductStocks(stockAdds);
    } else if (typeof rawBody.productId === 'string' && Number(rawBody.quantityPurchased || 0) > 0) {
      await adjustCachedProductStocks([
        { productId: rawBody.productId, delta: Number(rawBody.quantityPurchased) },
      ]);
      totalPurchaseCost =
        Number(rawBody.quantityPurchased) * Number(rawBody.unitPurchasePrice || 0);
    }
    const syntheticPurchase = {
      id: generateOfflineId('tmp-purch'),
      ...rawBody,
      totalCost: totalPurchaseCost,
      purchaseDate: rawBody.purchaseDate || new Date().toISOString(),
      _offlinePending: true,
    };
    await updateCachedArray('GET:/purchases', 'purchases', (list) => [syntheticPurchase, ...list]);
    optimisticResponse = { purchase: syntheticPurchase, offlineQueued: true };
  } else if (kind === 'UPDATE_CUSTOMER') {
    const custId = path.split('/')[2];
    await updateAllCachedCustomers((list) =>
      list.map((c) => (String(c.id) === custId ? { ...c, ...rawBody, _offlinePending: true } : c))
    );
    optimisticResponse = { customer: { id: custId, ...rawBody }, offlineQueued: true };
  } else if (kind === 'UPDATE_CREDIT_LIMIT') {
    const custId = path.split('/')[2];
    const nextLimit = Number(rawBody.creditLimit || 0);
    await updateAllCachedCustomers((list) =>
      list.map((c) => (String(c.id) === custId ? { ...c, creditLimit: nextLimit } : c))
    );
    optimisticResponse = { creditLimit: nextLimit, offlineQueued: true };
  } else if (kind === 'ADJUST_INVENTORY') {
    const qty = Math.abs(Number(rawBody.quantity || 0));
    const op = String(rawBody.operation || '');
    const isOut = op === 'DAMAGED' || op === 'EXPIRED' || op === 'ADJUST_OUT' || op === 'RETURN_OUT';
    if (typeof rawBody.productId === 'string') {
      await adjustCachedProductStocks([
        {
          productId: rawBody.productId,
          delta: isOut ? -qty : qty,
        },
      ]);
    }
    optimisticResponse = { offlineQueued: true };
  } else if (kind === 'UPDATE_SETTINGS') {
    const existing = await cacheGet<Record<string, unknown>>('GET:/settings');
    if (existing?.data && typeof existing.data === 'object') {
      const prevSettings = (existing.data.settings as Record<string, unknown>) || {};
      await cacheSet('GET:/settings', {
        ...existing.data,
        settings: { ...prevSettings, ...rawBody },
      });
    }
    optimisticResponse = { offlineQueued: true };
  }

  const outboxItem: OutboxItem = {
    id: generateOfflineId('outbox'),
    kind,
    method,
    path,
    body: bodyWithKey,
    summary: summarizeMutation(kind, rawBody),
    tempCustomerId,
    tempId,
    tempEntityKind,
    idempotencyKey,
    createdAt: Date.now(),
    status: 'PENDING',
    attempts: 0,
  };

  await outboxPut(outboxItem);
  notifyListeners();
  void registerBackgroundSync();

  return optimisticResponse as T;
}

export async function registerBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (reg.sync) {
      await reg.sync.register('zamora-outbox-sync');
    }
  } catch {
    // Background Sync API not supported in this browser; online/interval sync still handles replay
  }
}

export async function flushOutbox(): Promise<{ synced: number; failed: number }> {
  if (syncPromise) return syncPromise;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  syncPromise = (async () => {
    isSyncing = true;
    notifyListeners();
    let synced = 0;
    let failed = 0;

    try {
      const token = getStoredOwnerToken();
      const tempIdCache = (await cacheGet<Record<string, string>>(TEMP_ID_MAP_KEY))?.data ?? {};
      const tempMap: Record<string, string> = { ...tempIdCache };

      const items = await outboxList();
      for (const item of items) {
        if (item.status === 'FAILED') continue;

        await outboxPut({ ...item, status: 'SYNCING' });
        notifyListeners();

        // Resolve temporary offline IDs across path, direct foreign keys, and line items
        let resolvedPath = item.path;
        const resolvedBody: Record<string, unknown> = { ...item.body };
        for (const fk of ['customerId', 'productId', 'categoryId', 'supplierId'] as const) {
          const val = resolvedBody[fk];
          if (typeof val === 'string' && tempMap[val]) {
            resolvedBody[fk] = tempMap[val];
          }
        }
        if (Array.isArray(resolvedBody.items)) {
          resolvedBody.items = resolvedBody.items.map((it) => {
            if (it && typeof it === 'object') {
              const row = it as Record<string, unknown>;
              if (typeof row.productId === 'string' && tempMap[row.productId]) {
                return { ...row, productId: tempMap[row.productId] };
              }
            }
            return it;
          });
        }
        for (const [tmpId, realId] of Object.entries(tempMap)) {
          if (resolvedPath.includes(tmpId)) {
            resolvedPath = resolvedPath.replace(tmpId, realId);
          }
        }

        const headers = new Headers();
        if (item.method !== 'DELETE') {
          headers.set('Content-Type', 'application/json');
        }
        if (token) headers.set('Authorization', `Bearer ${token}`);

        try {
          const res = await fetch(apiUrl(resolvedPath), {
            method: item.method,
            headers,
            credentials: 'include',
            body: item.method === 'DELETE' ? undefined : JSON.stringify(resolvedBody),
          });

          if (res.status === 401) {
            await outboxPut({ ...item, status: 'PENDING' });
            break;
          }

          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as {
              error?: { message?: string } | string;
              message?: string;
            } | null;
            const message =
              (typeof payload?.error === 'object' && payload?.error?.message) ||
              (typeof payload?.error === 'string' ? payload.error : undefined) ||
              payload?.message ||
              `HTTP ${res.status}`;

            if (res.status >= 500) {
              await outboxPut({
                ...item,
                status: 'PENDING',
                attempts: item.attempts + 1,
                lastError: message,
              });
              break;
            }

            await outboxPut({
              ...item,
              status: 'FAILED',
              attempts: item.attempts + 1,
              lastError: message,
            });
            failed += 1;
            continue;
          }

          const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
          const localTempId = item.tempId || item.tempCustomerId;
          if (localTempId && json && typeof json === 'object') {
            const entityObj =
              (json.customer as { id?: string } | undefined) ||
              (json.product as { id?: string } | undefined) ||
              (json.category as { id?: string } | undefined) ||
              (json.supplier as { id?: string } | undefined) ||
              (json.expense as { id?: string } | undefined) ||
              (json.sale as { id?: string } | undefined);
            if (entityObj && typeof entityObj.id === 'string') {
              tempMap[localTempId] = entityObj.id;
              await cacheSet(TEMP_ID_MAP_KEY, tempMap);
            }
          }

          await outboxDelete(item.id);
          synced += 1;
        } catch (err) {
          if (isOfflineNetworkError(err)) {
            await outboxPut({ ...item, status: 'PENDING' });
            break;
          }
          await outboxPut({
            ...item,
            status: 'FAILED',
            attempts: item.attempts + 1,
            lastError: err instanceof Error ? err.message : 'Sync failed',
          });
          failed += 1;
        }
      }

      if (synced > 0) {
        lastSyncAt = Date.now();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('zamora:synced', { detail: { synced } }));
        }
      }
      return { synced, failed };
    } finally {
      isSyncing = false;
      syncPromise = null;
      notifyListeners();
    }
  })();

  return syncPromise;
}

export async function retryOutboxItem(id: string) {
  const items = await outboxList();
  const target = items.find((i) => i.id === id);
  if (!target) return;
  await outboxPut({ ...target, status: 'PENDING', lastError: undefined });
  notifyListeners();
  return flushOutbox();
}

export async function discardOutboxItem(id: string) {
  await outboxDelete(id);
  notifyListeners();
}

export async function restockAndRetryOfflineSale(item: OutboxItem): Promise<{
  restockedProducts: number;
  synced: number;
  failed: number;
  error?: string;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { restockedProducts: 0, synced: 0, failed: 0, error: 'You are currently offline.' };
  }

  const token = getStoredOwnerToken();
  const tempMap = (await cacheGet<Record<string, string>>(TEMP_ID_MAP_KEY))?.data ?? {};
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const rawItems = Array.isArray(item.body.items)
    ? (item.body.items as Array<{ productId?: string; quantity?: number }>)
    : [];
  const requestedQtyByProduct = new Map<string, number>();
  for (const row of rawItems) {
    if (!row.productId) continue;
    const realProdId = tempMap[row.productId] || row.productId;
    requestedQtyByProduct.set(
      realProdId,
      (requestedQtyByProduct.get(realProdId) || 0) + Math.max(0, Number(row.quantity || 0))
    );
  }

  let restockedProducts = 0;
  try {
    const prodRes = await fetch(apiUrl('/products?status=ACTIVE'), {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!prodRes.ok) {
      return { restockedProducts: 0, synced: 0, failed: 1, error: 'Failed to inspect live server stock.' };
    }
    const prodPayload = (await prodRes.json()) as {
      products?: Array<{ id: string; name: string; currentStock: number; purchasePrice: number }>;
    };
    const liveStockMap = new Map(
      (prodPayload.products || []).map((p) => [p.id, p])
    );

    for (const [productId, neededQty] of requestedQtyByProduct.entries()) {
      const liveProd = liveStockMap.get(productId);
      const currentStock = liveProd ? Number(liveProd.currentStock || 0) : 0;
      const shortfall = neededQty - currentStock;
      if (shortfall > 0) {
        const adjRes = await fetch(apiUrl('/inventory/adjust'), {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            productId,
            operation: 'ADD',
            quantity: shortfall,
            unitCostPrice: liveProd ? Number(liveProd.purchasePrice || 0) : undefined,
            reason: `Offline sync stock reconciliation (+${shortfall} units)`,
          }),
        });
        if (!adjRes.ok) {
          const errJson = (await adjRes.json().catch(() => null)) as {
            error?: { message?: string };
            message?: string;
          } | null;
          return {
            restockedProducts,
            synced: 0,
            failed: 1,
            error: errJson?.error?.message || errJson?.message || `Failed to restock ${liveProd?.name || 'product'}`,
          };
        }
        restockedProducts += 1;
      }
    }
  } catch (err) {
    return {
      restockedProducts,
      synced: 0,
      failed: 1,
      error: err instanceof Error ? err.message : 'Stock reconciliation failed',
    };
  }

  await outboxPut({ ...item, status: 'PENDING', lastError: undefined });
  notifyListeners();
  const res = await flushOutbox();
  return { restockedProducts, ...res };
}
