import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  BookmarkPlus,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';
import { LoadingState } from '../components/common/LoadingState';
import { BarcodeScannerModal } from '../components/pos/BarcodeScannerModal';
import { ReceiptModal, ReceiptSaleData } from '../components/pos/ReceiptModal';
import { DailyClosingPanel } from '../components/reports/DailyClosingPanel';
import { EditSaleModal } from '../components/sales/EditSaleModal';
import {
  CustomerDebtTabModal,
  CustomerProfileSalesPayload,
  DebtTabSaleInput,
  extractCustomerProfileSales,
} from '../components/customers/CustomerDebtTabModal';
import { cacheGet, cacheSet } from '../offline/offlineDb';
import { formatDateTime, formatKsh, generateIdempotencyKey } from '../utils/format';

const BAR_TABS_LS_KEY = 'zamora_open_bar_tabs_v1';
const BAR_TABS_IDB_KEY = 'LOCAL:barTabs';

interface OpenBarTab {
  id: string;
  label: string;
  customerId: string;
  notes: string;
  items: Array<{ productId: string; quantity: number }>;
  openedAt: string;
  updatedAt: string;
}

function readBarTabsFromLs(): OpenBarTab[] {
  try {
    const raw = localStorage.getItem(BAR_TABS_LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as OpenBarTab[]) : [];
  } catch {
    return [];
  }
}

interface ProductItem {
  id: string;
  name: string;
  brand: string;
  bottleSize: string;
  barcode: string | null;
  sellingPrice: number;
  currentStock: number;
  categoryId: string;
  category: { id: string; name: string } | null;
  status: 'ACTIVE' | 'INACTIVE';
}

interface CustomerItem {
  id: string;
  accountNumber: string;
  fullName: string;
  phone: string;
  currentDebt: number;
  creditLimit: number;
  status: string;
}

interface CartLine {
  product: ProductItem;
  quantity: number;
}

interface PosSplitShareRow {
  id: string;
  customerId: string;
  payerName: string;
  shareTotal: string;
  cashAmount: string;
  mpesaAmount: string;
  notes: string;
}

function makeSplitRow(idx: number, shareTotal = '0', customerId = ''): PosSplitShareRow {
  return {
    id: `share-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    customerId,
    payerName: '',
    shareTotal,
    cashAmount: customerId ? '0' : shareTotal,
    mpesaAmount: '0',
    notes: '',
  };
}

export function PosPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');

  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [discountReason, setDiscountReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MPESA' | 'CREDIT' | 'SPLIT'>('CASH');
  const [splitMode, setSplitMode] = useState<'single' | 'multi'>('single');
  const [splitShares, setSplitShares] = useState<PosSplitShareRow[]>([]);
  const [cashAmount, setCashAmount] = useState<string>('0');
  const [mpesaAmount, setMpesaAmount] = useState<string>('0');
  const [mpesaReference, setMpesaReference] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [mobileView, setMobileView] = useState<'catalog' | 'cart'>('catalog');
  const [allowCreditOverride, setAllowCreditOverride] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<ReceiptSaleData | null>(null);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [newCust, setNewCust] = useState({
    fullName: '',
    phone: '',
    creditLimit: '5000',
  });

  // Open Bar Tabs & Barcode Camera Scanner
  const [openTabs, setOpenTabs] = useState<OpenBarTab[]>(() => readBarTabsFromLs());
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [holdTabOpen, setHoldTabOpen] = useState(false);
  const [tabLabelInput, setTabLabelInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [tabsExpanded, setTabsExpanded] = useState(true);
  const [checkoutExtrasOpen, setCheckoutExtrasOpen] = useState(false);
  const [selectedCustomerOpenSales, setSelectedCustomerOpenSales] = useState<DebtTabSaleInput[]>([]);
  const [debtTabModalOpen, setDebtTabModalOpen] = useState(false);
  const [updatingExistingDebt, setUpdatingExistingDebt] = useState(false);
  const [recentSalesModalOpen, setRecentSalesModalOpen] = useState(false);
  const [recentSalesList, setRecentSalesList] = useState<ReceiptSaleData[]>([]);
  const [loadingRecentSales, setLoadingRecentSales] = useState(false);
  const [recentSalesSearch, setRecentSalesSearch] = useState('');
  const [editingPosSaleId, setEditingPosSaleId] = useState<string | null>(null);

  const openRecentSalesModal = useCallback(async () => {
    setRecentSalesModalOpen(true);
    setLoadingRecentSales(true);
    try {
      const res = await api.get<{ sales: ReceiptSaleData[] }>('/sales?limit=30');
      setRecentSalesList(res.sales || []);
    } catch {
      showToast('Could not load recent receipts', 'error');
    } finally {
      setLoadingRecentSales(false);
    }
  }, [showToast]);

  const persistOpenTabs = useCallback((nextTabs: OpenBarTab[]) => {
    setOpenTabs(nextTabs);
    try {
      localStorage.setItem(BAR_TABS_LS_KEY, JSON.stringify(nextTabs));
    } catch {
      // ignore storage quota
    }
    void cacheSet(BAR_TABS_IDB_KEY, nextTabs);
  }, []);

  useEffect(() => {
    void cacheGet<OpenBarTab[]>(BAR_TABS_IDB_KEY).then((rec) => {
      if (rec?.data && Array.isArray(rec.data) && rec.data.length > 0 && readBarTabsFromLs().length === 0) {
        setOpenTabs(rec.data);
      }
    });
  }, []);

  // M-Pesa STK Push state
  const [stkPhone, setStkPhone] = useState('');
  const [stkCheckoutId, setStkCheckoutId] = useState<string | null>(null);
  const [stkBusy, setStkBusy] = useState(false);
  const [closingOpen, setClosingOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [prodRes, custRes, catRes] = await Promise.all([
        api.get<{ products: ProductItem[] }>('/products?status=ACTIVE'),
        api.get<{ customers: CustomerItem[] }>('/customers?status=ACTIVE'),
        api.get<{ categories: Array<{ id: string; name: string }> }>('/categories'),
      ]);
      setProducts(prodRes.products);
      setCustomers(custRes.customers);
      setCategories(catRes.categories);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load POS catalog', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadCustomerOpenSales = useCallback(async (customerId: string) => {
    if (!customerId) {
      setSelectedCustomerOpenSales([]);
      return;
    }
    try {
      let sales: DebtTabSaleInput[] = [];
      if (customerId.startsWith('tmp-')) {
        const cached = await cacheGet<{ sales?: DebtTabSaleInput[] }>(
          `GET:/customers/${customerId}`
        );
        sales = cached?.data?.sales || [];
      } else {
        const res = await api.get<CustomerProfileSalesPayload>(`/customers/${customerId}`);
        sales = extractCustomerProfileSales(res);
      }
      const unpaid = sales.filter(
        (s) => s.status !== 'VOIDED' && Number(s.outstandingAmount ?? 0) > 0
      );
      setSelectedCustomerOpenSales(unpaid);
    } catch {
      setSelectedCustomerOpenSales([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    void loadCustomerOpenSales(selectedCustomerId);
  }, [selectedCustomerId, loadCustomerOpenSales]);

  useEffect(() => {
    const handleSynced = () => {
      void loadData();
      if (selectedCustomerId) {
        void loadCustomerOpenSales(selectedCustomerId);
      }
    };
    window.addEventListener('zamora:synced', handleSynced);
    return () => window.removeEventListener('zamora:synced', handleSynced);
  }, [loadData, loadCustomerOpenSales, selectedCustomerId]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      map.set(line.product.id, (map.get(line.product.id) || 0) + line.quantity);
    }
    return map;
  }, [cart]);

  const heldTabQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const tab of openTabs) {
      if (tab.id === activeTabId) continue;
      for (const item of tab.items) {
        map.set(item.productId, (map.get(item.productId) || 0) + item.quantity);
      }
    }
    return map;
  }, [openTabs, activeTabId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'ALL' && p.categoryId !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });
  }, [products, search, selectedCategory]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.accountNumber.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const addToCart = useCallback(
    (product: ProductItem) => {
      if (product.currentStock <= 0) {
        showToast(`${product.name} is out of stock`, 'error');
        return;
      }
      setCart((prev) => {
        const existing = prev.find((l) => l.product.id === product.id);
        if (existing) {
          if (existing.quantity + 1 > product.currentStock) {
            showToast(`Only ${product.currentStock} unit(s) available in stock`, 'error');
            return prev;
          }
          return prev.map((l) =>
            l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l
          );
        }
        return [...prev, { product, quantity: 1 }];
      });
    },
    [showToast]
  );

  const updateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => {
        if (l.product.id !== productId) return l;
        if (qty > l.product.currentStock) {
          showToast(`Only ${l.product.currentStock} available for ${l.product.name}`, 'error');
          return { ...l, quantity: l.product.currentStock };
        }
        return { ...l, quantity: qty };
      })
    );
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      const exactBarcode = products.find(
        (p) => p.barcode && p.barcode.toLowerCase() === search.trim().toLowerCase()
      );
      if (exactBarcode) {
        addToCart(exactBarcode);
        setSearch('');
      }
    }
  };

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0),
    [cart]
  );
  const discountNum = Math.max(0, Number(discountAmount || 0));
  const totalAmount = Math.max(0, subtotal - discountNum);

  const splitCash = Math.max(0, Number(cashAmount || 0));
  const splitMpesa = Math.max(0, Number(mpesaAmount || 0));

  const parsedMultiShares = useMemo(() => {
    return splitShares.map((row) => {
      const shareTotal = Math.max(0, Number(row.shareTotal || 0));
      const cash = Math.max(0, Number(row.cashAmount || 0));
      const mpesa = Math.max(0, Number(row.mpesaAmount || 0));
      const paid = cash + mpesa;
      const overpaid = paid > shareTotal + 0.009;
      const debt = Math.max(0, Number((shareTotal - paid).toFixed(2)));
      return { row, shareTotal, cash, mpesa, paid, overpaid, debt };
    });
  }, [splitShares]);

  const multiSharesTotal = useMemo(
    () =>
      Number(
        parsedMultiShares.reduce((sum, s) => sum + s.shareTotal, 0).toFixed(2)
      ),
    [parsedMultiShares]
  );
  const multiSharesCash = useMemo(
    () => Number(parsedMultiShares.reduce((sum, s) => sum + s.cash, 0).toFixed(2)),
    [parsedMultiShares]
  );
  const multiSharesMpesa = useMemo(
    () => Number(parsedMultiShares.reduce((sum, s) => sum + s.mpesa, 0).toFixed(2)),
    [parsedMultiShares]
  );
  const multiSharesDebt = useMemo(
    () => Number(parsedMultiShares.reduce((sum, s) => sum + s.debt, 0).toFixed(2)),
    [parsedMultiShares]
  );

  const isMultiSplitActive = paymentMethod === 'SPLIT' && splitMode === 'multi';

  const applyEqualMultiSplit = useCallback(
    (count = Math.max(2, splitShares.length || 2)) => {
      const n = Math.max(2, Math.min(10, count));
      const each = Math.floor((totalAmount * 100) / n) / 100;
      const last = Number((totalAmount - each * (n - 1)).toFixed(2));
      const rows: PosSplitShareRow[] = [];
      for (let i = 0; i < n; i += 1) {
        const amt = (i === n - 1 ? last : each).toFixed(2);
        const existingCustId =
          splitShares[i]?.customerId ?? (i === 0 ? selectedCustomerId : '');
        const prevRow = splitShares[i];
        rows.push({
          ...makeSplitRow(i, amt, existingCustId),
          payerName: prevRow?.payerName ?? '',
          notes: prevRow?.notes ?? '',
          cashAmount: existingCustId ? '0' : amt,
          mpesaAmount: '0',
        });
      }
      setSplitShares(rows);
    },
    [selectedCustomerId, splitShares, totalAmount]
  );

  const calculatedPaid =
    paymentMethod === 'CASH' || paymentMethod === 'MPESA'
      ? totalAmount
      : paymentMethod === 'CREDIT'
        ? 0
        : isMultiSplitActive
          ? Math.min(totalAmount, multiSharesCash + multiSharesMpesa)
          : Math.min(totalAmount, splitCash + splitMpesa);

  const calculatedDebtAdded = isMultiSplitActive
    ? multiSharesDebt
    : Math.max(0, totalAmount - calculatedPaid);

  const creditLimitViolations = useMemo(() => {
    if (isMultiSplitActive) {
      const debtByCust = new Map<string, number>();
      for (const s of parsedMultiShares) {
        if (s.debt > 0 && s.row.customerId) {
          debtByCust.set(
            s.row.customerId,
            (debtByCust.get(s.row.customerId) ?? 0) + s.debt
          );
        }
      }
      const warnings: Array<{ customer: CustomerItem; added: number }> = [];
      debtByCust.forEach((added, cid) => {
        const cust = customers.find((c) => c.id === cid);
        if (cust && cust.currentDebt + added > cust.creditLimit) {
          warnings.push({ customer: cust, added });
        }
      });
      return warnings;
    }
    if (
      calculatedDebtAdded > 0 &&
      selectedCustomer !== null &&
      selectedCustomer.currentDebt + calculatedDebtAdded > selectedCustomer.creditLimit
    ) {
      return [{ customer: selectedCustomer, added: calculatedDebtAdded }];
    }
    return [];
  }, [
    calculatedDebtAdded,
    customers,
    isMultiSplitActive,
    parsedMultiShares,
    selectedCustomer,
  ]);

  const exceedsCreditLimit = creditLimitViolations.length > 0;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showToast('Add at least one drink to the cart', 'error');
      return;
    }

    if (isMultiSplitActive) {
      if (parsedMultiShares.length < 2) {
        showToast('Add at least 2 people for Multi-Person Split', 'error');
        return;
      }
      if (Math.abs(multiSharesTotal - totalAmount) > 0.01) {
        showToast(
          `Split shares total (${formatKsh(multiSharesTotal)}) must equal cart total (${formatKsh(
            totalAmount
          )})`,
          'error'
        );
        return;
      }
      for (let idx = 0; idx < parsedMultiShares.length; idx += 1) {
        const item = parsedMultiShares[idx];
        if (item.shareTotal <= 0) {
          showToast(`Person #${idx + 1} share must be greater than zero`, 'error');
          return;
        }
        if (item.overpaid) {
          showToast(`Person #${idx + 1} Cash + M-Pesa exceeds their share total`, 'error');
          return;
        }
        if (item.debt > 0 && !item.row.customerId) {
          showToast(
            `Person #${idx + 1} has unpaid debt (${formatKsh(
              item.debt
            )}) — please select a registered customer`,
            'error'
          );
          return;
        }
      }
    } else {
      if (calculatedDebtAdded > 0 && !selectedCustomerId) {
        showToast('Select or register a customer for credit or partial debt sales', 'error');
        return;
      }
      if (paymentMethod === 'SPLIT' && splitCash + splitMpesa > totalAmount) {
        showToast('Split Cash + M-Pesa exceeds total sale amount', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ sale: ReceiptSaleData }>('/sales', {
        customerId: selectedCustomerId || null,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        discountAmount: discountNum,
        discountReason: discountReason || undefined,
        notes: saleNotes.trim() || undefined,
        paymentMethod,
        cashAmount:
          paymentMethod === 'SPLIT' && !isMultiSplitActive ? splitCash : undefined,
        mpesaAmount:
          paymentMethod === 'SPLIT' && !isMultiSplitActive ? splitMpesa : undefined,
        splitShares: isMultiSplitActive
          ? parsedMultiShares.map((s) => ({
              customerId: s.row.customerId || null,
              payerName: s.row.payerName.trim() || null,
              cashAmount: Number(s.cash.toFixed(2)),
              mpesaAmount: Number(s.mpesa.toFixed(2)),
              debtAmount: Number(s.debt.toFixed(2)),
              notes: s.row.notes.trim() || null,
            }))
          : undefined,
        mpesaReference: mpesaReference || undefined,
        allowCreditLimitOverride: allowCreditOverride,
        idempotencyKey: generateIdempotencyKey('pos'),
      });

      setCompletedSale(res.sale);
      setCart([]);
      setDiscountAmount('0');
      setDiscountReason('');
      setSaleNotes('');
      setCashAmount('0');
      setMpesaAmount('0');
      setSplitMode('single');
      setSplitShares([]);
      setMpesaReference('');
      setAllowCreditOverride(false);
      setStkCheckoutId(null);
      if (activeTabId) {
        persistOpenTabs(openTabs.filter((t) => t.id !== activeTabId));
        setActiveTabId(null);
      }
      setMobileView('catalog');
      showToast(`Sale ${res.sale.receiptNumber} completed!`, 'success');
      await loadData();
      if (selectedCustomerId) {
        void loadCustomerOpenSales(selectedCustomerId);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBarcodeDetected = useCallback(
    (code: string) => {
      const cleaned = code.trim();
      const match = products.find(
        (p) => p.barcode && p.barcode.toLowerCase() === cleaned.toLowerCase()
      );
      if (match) {
        addToCart(match);
        setSearch('');
        showToast(`Scanned: ${match.name}`, 'success');
      } else {
        setSearch(cleaned);
        showToast(`Barcode "${cleaned}" not linked yet — filtered catalog`, 'info');
      }
    },
    [products, addToCart, showToast]
  );

  const handleOpenHoldTabModal = () => {
    if (cart.length === 0) {
      showToast('Add drinks to the cart before holding a tab', 'error');
      return;
    }
    const existingTab = activeTabId ? openTabs.find((t) => t.id === activeTabId) : null;
    if (existingTab) {
      setTabLabelInput(existingTab.label);
    } else if (selectedCustomer) {
      setTabLabelInput(`Counter - ${selectedCustomer.fullName}`);
    } else {
      setTabLabelInput(`Table ${openTabs.length + 1}`);
    }
    setHoldTabOpen(true);
  };

  const handleConfirmHoldTab = (e: React.FormEvent) => {
    e.preventDefault();
    const label = tabLabelInput.trim() || `Table ${openTabs.length + 1}`;
    const nowIso = new Date().toISOString();
    const tabItems = cart.map((l) => ({ productId: l.product.id, quantity: l.quantity }));
    if (activeTabId && openTabs.some((t) => t.id === activeTabId)) {
      persistOpenTabs(
        openTabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                label,
                customerId: selectedCustomerId,
                notes: saleNotes,
                items: tabItems,
                updatedAt: nowIso,
              }
            : t
        )
      );
      showToast(`Updated open tab "${label}"`, 'success');
    } else {
      const newTab: OpenBarTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        customerId: selectedCustomerId,
        notes: saleNotes,
        items: tabItems,
        openedAt: nowIso,
        updatedAt: nowIso,
      };
      persistOpenTabs([newTab, ...openTabs]);
      showToast(`Parked "${label}" — tap anytime to add drinks or settle`, 'success');
    }
    setCart([]);
    setActiveTabId(null);
    setSelectedCustomerId('');
    setSaleNotes('');
    setHoldTabOpen(false);
    setMobileView('catalog');
  };

  const handleResumeBarTab = (tab: OpenBarTab) => {
    const productMap = new Map(products.map((p) => [p.id, p]));
    const nextCart: CartLine[] = [];
    for (const item of tab.items) {
      const p = productMap.get(item.productId);
      if (p) {
        nextCart.push({
          product: p,
          quantity: p.currentStock > 0 ? Math.min(item.quantity, p.currentStock) : item.quantity,
        });
      }
    }
    setCart(nextCart);
    setSelectedCustomerId(tab.customerId || '');
    setSaleNotes(tab.notes || '');
    setActiveTabId(tab.id);
    showToast(`Opened tab "${tab.label}" — add drinks or settle now`, 'info');
  };

  const handleDiscardBarTab = (id: string) => {
    persistOpenTabs(openTabs.filter((t) => t.id !== id));
    if (activeTabId === id) {
      setActiveTabId(null);
    }
  };

  const submitQuickRegisterCustomer = async (putOnDebt: boolean) => {
    try {
      const res = await api.post<{ customer: CustomerItem }>('/customers', {
        fullName: newCust.fullName,
        phone: newCust.phone,
        creditLimit: Number(newCust.creditLimit || 0),
      });
      setCustomers((prev) => [...prev, res.customer]);
      setSelectedCustomerId(res.customer.id);
      setCustomerSearch('');
      if (putOnDebt) {
        setPaymentMethod('CREDIT');
      }
      setQuickCustomerOpen(false);
      setNewCust({ fullName: '', phone: '', creditLimit: '5000' });
      showToast(
        putOnDebt
          ? `Registered ${res.customer.fullName} & switched order to Debt`
          : `Registered ${res.customer.fullName}`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not register customer', 'error');
    }
  };

  const handleQuickRegisterCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitQuickRegisterCustomer(false);
  };

  const latestOpenDebtSale = selectedCustomerOpenSales[0] || null;

  const handleAppendCartToExistingDebt = async () => {
    if (!selectedCustomer || !latestOpenDebtSale || cart.length === 0) {
      return;
    }

    const mergedQuantities = new Map<string, number>();
    for (const it of latestOpenDebtSale.items) {
      const resolvedId =
        it.productId ||
        products.find((p) => p.name.toLowerCase() === it.productName.toLowerCase())?.id ||
        '';
      if (!resolvedId) {
        showToast(
          'Could not match one of the existing drinks on that tab — use Debt Tab (Pen) to edit it.',
          'error'
        );
        return;
      }
      mergedQuantities.set(resolvedId, (mergedQuantities.get(resolvedId) || 0) + Number(it.quantity));
    }

    for (const line of cart) {
      mergedQuantities.set(
        line.product.id,
        (mergedQuantities.get(line.product.id) || 0) + line.quantity
      );
    }

    const combinedNotes =
      [latestOpenDebtSale.notes?.trim(), saleNotes.trim()].filter(Boolean).join(' · ') || undefined;
    const totalDiscount = Number(latestOpenDebtSale.discountAmount || 0) + discountNum;

    setUpdatingExistingDebt(true);
    try {
      const res = await api.patch<{ sale?: ReceiptSaleData }>(
        `/sales/${latestOpenDebtSale.id}/items`,
        {
          items: Array.from(mergedQuantities.entries()).map(([productId, quantity]) => ({
            productId,
            quantity,
          })),
          discountAmount: totalDiscount,
          discountReason: discountReason || undefined,
          notes: combinedNotes,
          reason: 'Added drinks from POS checkout',
          allowCreditLimitOverride: allowCreditOverride,
        }
      );

      if (res?.sale && Array.isArray(res.sale.items)) {
        setCompletedSale(res.sale);
      }
      setCart([]);
      setDiscountAmount('0');
      setDiscountReason('');
      setSaleNotes('');
      setCashAmount('0');
      setMpesaAmount('0');
      setMpesaReference('');
      setAllowCreditOverride(false);
      setStkCheckoutId(null);
      if (activeTabId) {
        persistOpenTabs(openTabs.filter((t) => t.id !== activeTabId));
        setActiveTabId(null);
      }
      setMobileView('catalog');
      showToast(
        `Added ${cartItemCount} item(s) to ${selectedCustomer.fullName}'s open debt (${latestOpenDebtSale.receiptNumber})`,
        'success'
      );
      await Promise.all([loadData(), loadCustomerOpenSales(selectedCustomer.id)]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update existing debt', 'error');
    } finally {
      setUpdatingExistingDebt(false);
    }
  };

  const handleTriggerStkPush = async () => {
    const amt = paymentMethod === 'MPESA' ? totalAmount : splitMpesa;
    const phone = stkPhone || selectedCustomer?.phone || '';
    if (!phone || amt <= 0) {
      showToast('Enter customer phone and M-Pesa amount > 0', 'error');
      return;
    }
    setStkBusy(true);
    try {
      const res = await api.post<{ checkoutRequestId: string; customerMessage: string }>(
        '/mpesa/stkpush',
        {
          purpose: 'POS_SALE',
          phoneNumber: phone,
          amount: amt,
          customerId: selectedCustomerId || undefined,
        }
      );
      setStkCheckoutId(res.checkoutRequestId);
      showToast(res.customerMessage, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'STK Push failed', 'error');
    } finally {
      setStkBusy(false);
    }
  };

  const handleSimulateStkConfirm = async () => {
    if (!stkCheckoutId) return;
    setStkBusy(true);
    try {
      const res = await api.post<{ mpesaReceiptNumber?: string }>('/mpesa/simulate-callback', {
        checkoutRequestId: stkCheckoutId,
      });
      if (res.mpesaReceiptNumber) {
        setMpesaReference(res.mpesaReceiptNumber);
      }
      showToast(`M-Pesa confirmed: ${res.mpesaReceiptNumber}`, 'success');
      setStkCheckoutId(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Simulation failed', 'error');
    } finally {
      setStkBusy(false);
    }
  };

  const cartItemCount = useMemo(
    () => cart.reduce((sum, l) => sum + l.quantity, 0),
    [cart]
  );

  if (loading) return <LoadingState label="Loading Point of Sale..." />;

  return (
    <div className="space-y-4">
      {/* Mobile Catalog / Cart Switcher */}
      <div className="xl:hidden grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-200/80">
        <button
          type="button"
          onClick={() => setMobileView('catalog')}
          className={`rounded-lg py-2 px-3 text-xs font-bold transition-colors ${
            mobileView === 'catalog' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          Drink Catalog ({filteredProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileView('cart')}
          className={`rounded-lg py-2 px-3 text-xs font-bold transition-colors ${
            mobileView === 'cart' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'
          }`}
        >
          Cart ({cartItemCount}) · {formatKsh(totalAmount)}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Product Catalog */}
        <div
          className={`xl:col-span-7 space-y-4 ${
            mobileView === 'catalog' ? 'block' : 'hidden xl:block'
          }`}
        >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
            <p className="text-xs text-slate-500">
              Tap products to add to cart or scan barcode and press Enter
            </p>
          </div>
          <div className="flex items-center gap-2 flex-1 sm:max-w-lg justify-end">
            <button
              type="button"
              onClick={() => void openRecentSalesModal()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 shrink-0"
              title="View or edit recent walk-in, split, or customer receipts"
            >
              <Receipt className="h-3.5 w-3.5 text-amber-600" />
              Receipts
            </button>
            <button
              type="button"
              onClick={() => setClosingOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 shrink-0"
            >
              <Clock className="h-3.5 w-3.5 text-emerald-700" />
              Closing Summary
            </button>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search name, brand, or scan barcode..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-16 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                title="Scan bottle barcode with phone camera"
                aria-label="Scan barcode with camera"
                className="absolute right-8 top-1.5 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <Camera className="h-4 w-4" />
              </button>
              <Barcode className="h-4 w-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Open Running Bar Tabs strip */}
        {openTabs.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 space-y-2">
            <button
              type="button"
              onClick={() => setTabsExpanded((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Open Running Tabs ({openTabs.length})
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                {tabsExpanded ? 'Hide' : 'Show'}
                {tabsExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </span>
            </button>
            {tabsExpanded && (
              <div className="flex gap-2 overflow-x-auto pb-0.5">
              {openTabs.map((tab) => {
                const productMap = new Map(products.map((p) => [p.id, p]));
                const qtySum = tab.items.reduce((s, it) => s + it.quantity, 0);
                const estTotal = tab.items.reduce(
                  (s, it) => s + Number(productMap.get(it.productId)?.sellingPrice || 0) * it.quantity,
                  0
                );
                const isActive = activeTabId === tab.id;
                return (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs shrink-0 ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-amber-300 bg-white text-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleResumeBarTab(tab)}
                      className="text-left"
                    >
                      <span className="font-bold">{tab.label}</span>
                      <span className={`ml-1.5 tabular-nums ${isActive ? 'text-emerald-300' : 'text-amber-700 font-semibold'}`}>
                        {qtySum} · {formatKsh(estTotal)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscardBarTab(tab.id)}
                      className={`rounded p-0.5 ${isActive ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-rose-50 text-slate-400 hover:text-rose-600'}`}
                      aria-label={`Close tab ${tab.label}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              </div>
            )}
          </div>
        )}

        {/* Category filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === 'ALL'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === cat.id
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {filteredProducts.map((p) => {
            const inCartQty = cartQtyMap.get(p.id) || 0;
            const heldQty = heldTabQtyMap.get(p.id) || 0;
            const remainingStock = Math.max(0, p.currentStock - inCartQty);
            const isOut = remainingStock <= 0;

            return (
              <button
                key={p.id}
                type="button"
                disabled={isOut}
                onClick={() => addToCart(p)}
                className={`text-left rounded-xl border p-3 transition-all ${
                  isOut
                    ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 bg-white hover:border-slate-900 hover:shadow-md active:scale-[0.99]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {p.category?.name || 'Drink'} · {p.bottleSize}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                      remainingStock <= 0
                        ? 'bg-rose-100 text-rose-700'
                        : remainingStock <= 10
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {remainingStock} left
                  </span>
                </div>
                <p className="mt-1.5 font-semibold text-sm text-slate-900 line-clamp-2">{p.name}</p>
                <p className="text-xs text-slate-500">{p.brand}</p>
                <div className="mt-2.5 flex items-end justify-between gap-1.5">
                  <p className="text-base font-bold text-slate-900 tabular-nums">
                    {formatKsh(p.sellingPrice)}
                  </p>
                  {(inCartQty > 0 || heldQty > 0) && (
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {inCartQty > 0 && (
                        <span className="rounded bg-slate-900 text-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                          -{inCartQty} in cart
                        </span>
                      )}
                      {heldQty > 0 && (
                        <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                          {heldQty} held
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

        {/* Right: Shopping Cart & Checkout */}
        <div
          className={`xl:col-span-5 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm space-y-3 xl:sticky xl:top-4 ${
            mobileView === 'cart' ? 'block' : 'hidden xl:block'
          }`}
        >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-slate-900" />
            <h2 className="font-bold text-slate-900">
              {activeTabId
                ? `Tab: ${openTabs.find((t) => t.id === activeTabId)?.label || 'Current Order'}`
                : 'Current Order'}
            </h2>
          </div>
          {cart.length > 0 && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleOpenHoldTabModal}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                {activeTabId ? 'Update Tab' : 'Hold Tab'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCart([]);
                  setActiveTabId(null);
                }}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Customer Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase text-slate-600">
              Customer {calculatedDebtAdded > 0 && <span className="text-rose-600">(Required)</span>}
            </label>
            <button
              type="button"
              onClick={() => setQuickCustomerOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Quick Register
            </button>
          </div>
          <input
            type="text"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Filter customers by name, phone, or CUST-#"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
          />
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">Walk-in Customer (Cash / M-Pesa only)</option>
            {filteredCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} ({c.accountNumber}) — Debt: {formatKsh(c.currentDebt)}
              </option>
            ))}
          </select>
          {selectedCustomer && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-2">
              <div className="flex justify-between gap-2">
                <span>
                  Debt:{' '}
                  <strong className={selectedCustomer.currentDebt > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                    {formatKsh(selectedCustomer.currentDebt)}
                  </strong>
                </span>
                <span>
                  Credit Limit: <strong>{formatKsh(selectedCustomer.creditLimit)}</strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200">
                {paymentMethod !== 'CREDIT' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('CREDIT');
                      showToast(
                        `Switched payment to Debt for ${selectedCustomer.fullName}`,
                        'info'
                      );
                    }}
                    className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                  >
                    Switch Order to Debt
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                    Recording as Debt
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className="underline text-slate-600 hover:text-slate-900"
                    >
                      Cash
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDebtTabModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Pencil className="h-3 w-3" />
                  Debt Tab (Pen)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cart Lines */}
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border-y border-slate-200">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              Cart is empty. Select drinks from the catalog.
            </p>
          ) : (
            cart.map((line) => (
              <div key={line.product.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{line.product.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatKsh(line.product.sellingPrice)} × {line.quantity} ={' '}
                    <strong className="text-slate-800">
                      {formatKsh(line.product.sellingPrice * line.quantity)}
                    </strong>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateCartQty(line.product.id, line.quantity - 1)}
                    className="h-7 w-7 rounded border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={line.product.currentStock}
                    value={line.quantity}
                    onChange={(e) => updateCartQty(line.product.id, Number(e.target.value))}
                    className="w-12 rounded border border-slate-300 py-1 text-center text-xs font-semibold tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => updateCartQty(line.product.id, line.quantity + 1)}
                    className="h-7 w-7 rounded border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCartQty(line.product.id, 0)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Discount, Note & Totals */}
        <div className="space-y-2 text-sm">
          <button
            type="button"
            onClick={() => setCheckoutExtrasOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span>
              Discount &amp; Note
              {(discountNum > 0 || saleNotes.trim()) && (
                <span className="ml-1.5 text-emerald-700 font-bold">
                  ({discountNum > 0 ? `-${formatKsh(discountNum)}` : ''}
                  {discountNum > 0 && saleNotes.trim() ? ' · ' : ''}
                  {saleNotes.trim() ? 'Note added' : ''})
                </span>
              )}
            </span>
            {checkoutExtrasOpen ? (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {checkoutExtrasOpen && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Discount (KSh)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Discount Reason
                  </label>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Optional note"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>

              {!(paymentMethod === 'CREDIT' || calculatedDebtAdded > 0) && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                    Sale Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    placeholder="e.g. Table 4 or VIP order"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-slate-900 text-white p-3 space-y-1">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatKsh(subtotal)}</span>
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between text-xs text-amber-300">
                <span>Discount</span>
                <span className="tabular-nums">-{formatKsh(discountNum)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-1 border-t border-slate-700">
              <span>Total</span>
              <span className="tabular-nums">{formatKsh(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase text-slate-600">
            Payment Method
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['CASH', 'MPESA', 'CREDIT', 'SPLIT'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`rounded-lg py-2 text-xs font-bold border transition-colors ${
                  paymentMethod === m
                    ? m === 'CREDIT'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-900 text-white border-slate-900'
                    : m === 'CREDIT'
                      ? 'bg-rose-50/70 text-rose-700 border-rose-200 hover:bg-rose-100'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {m === 'CREDIT' ? 'Debt' : m === 'SPLIT' ? 'Split / Partial' : m}
              </button>
            ))}
          </div>

          {paymentMethod === 'CREDIT' && (
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('SPLIT');
                setSplitMode('single');
              }}
              className="w-full rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 text-left"
            >
              Client paying part of this bottle now or splitting with a friend? Click to use{' '}
              <span className="underline">Split / Partial</span> →
            </button>
          )}

          {paymentMethod === 'SPLIT' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              {/* Toggle: Single Client Partial Pay vs 2+ People Bill Split */}
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-200/80 p-1">
                <button
                  type="button"
                  onClick={() => setSplitMode('single')}
                  className={`rounded-md py-1.5 text-[11px] font-bold transition-colors ${
                    splitMode === 'single'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1 Client (Partial + Debt)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSplitMode('multi');
                    if (splitShares.length < 2) {
                      applyEqualMultiSplit(2);
                    }
                  }}
                  className={`rounded-md py-1.5 text-[11px] font-bold transition-colors ${
                    splitMode === 'multi'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2+ People (Split Bill)
                </button>
              </div>

              {splitMode === 'single' ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[11px] text-slate-600">
                      Pay part now &amp; log remainder to Debt
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCashAmount(String(Math.round(totalAmount / 2)));
                          setMpesaAmount('0');
                        }}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        50% Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCashAmount('0');
                          setMpesaAmount('0');
                        }}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Cash Paid Now (KSh)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        M-Pesa Paid Now (KSh)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={mpesaAmount}
                        onChange={(e) => setMpesaAmount(e.target.value)}
                        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs pt-1.5 border-t border-slate-200">
                    <span className="font-medium text-slate-600">
                      Remaining Logged to Debt:
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        calculatedDebtAdded > 0 ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatKsh(calculatedDebtAdded)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyEqualMultiSplit(2)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Equal 50/50
                      </button>
                      {splitShares.length < 10 && (
                        <button
                          type="button"
                          onClick={() => {
                            const rem = Math.max(0, Number((totalAmount - multiSharesTotal).toFixed(2)));
                            setSplitShares((prev) => [
                              ...prev,
                              makeSplitRow(prev.length, String(rem)),
                            ]);
                          }}
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          + Add Person
                        </button>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-bold tabular-nums ${
                        Math.abs(multiSharesTotal - totalAmount) < 0.01
                          ? 'text-emerald-700'
                          : 'text-rose-600'
                      }`}
                    >
                      {Math.abs(multiSharesTotal - totalAmount) < 0.01
                        ? `Matched: ${formatKsh(totalAmount)}`
                        : `Unassigned: ${formatKsh(totalAmount - multiSharesTotal)}`}
                    </span>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
                    {parsedMultiShares.map((item, idx) => {
                      const updateRow = (patch: Partial<PosSplitShareRow>) => {
                        setSplitShares((prev) =>
                          prev.map((r, rIdx) => {
                            if (rIdx === idx) return { ...r, ...patch };
                            // When editing Person 1's shareTotal in a 2-person split, auto-balance Person 2
                            if (
                              prev.length === 2 &&
                              idx === 0 &&
                              rIdx === 1 &&
                              patch.shareTotal !== undefined
                            ) {
                              const p1 = Math.max(0, Number(patch.shareTotal || 0));
                              const rem = Math.max(0, Number((totalAmount - p1).toFixed(2)));
                              return {
                                ...r,
                                shareTotal: String(rem),
                                cashAmount: r.customerId ? r.cashAmount : String(rem),
                              };
                            }
                            return r;
                          })
                        );
                      };

                      return (
                        <div
                          key={item.row.id}
                          className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase text-slate-700">
                              Person {idx + 1}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[11px] font-bold tabular-nums ${
                                  item.overpaid
                                    ? 'text-rose-600'
                                    : item.debt > 0
                                      ? 'text-rose-600'
                                      : 'text-emerald-700'
                                }`}
                              >
                                {item.overpaid
                                  ? 'Paid > Share!'
                                  : item.debt > 0
                                    ? `Debt: ${formatKsh(item.debt)}`
                                    : 'Paid Full'}
                              </span>
                              {splitShares.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSplitShares((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="text-slate-400 hover:text-rose-600"
                                  title="Remove person"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <select
                              value={item.row.customerId}
                              onChange={(e) => updateRow({ customerId: e.target.value })}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              <option value="">Walk-in (Cash/M-Pesa only)</option>
                              {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.fullName} ({c.accountNumber})
                                </option>
                              ))}
                            </select>
                            {!item.row.customerId ? (
                              <input
                                type="text"
                                value={item.row.payerName}
                                onChange={(e) => updateRow({ payerName: e.target.value })}
                                placeholder={`Name (optional, e.g. Mike)`}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              />
                            ) : (
                              <div className="flex items-center gap-1 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateRow({
                                      cashAmount: String(item.shareTotal),
                                      mpesaAmount: '0',
                                    })
                                  }
                                  className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                                >
                                  All Cash
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateRow({
                                      cashAmount: '0',
                                      mpesaAmount: String(item.shareTotal),
                                    })
                                  }
                                  className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800"
                                >
                                  All M-Pesa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateRow({ cashAmount: '0', mpesaAmount: '0' })}
                                  className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800"
                                >
                                  All Debt
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-1.5">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500">
                                Share (KSh)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.row.shareTotal}
                                onChange={(e) => updateRow({ shareTotal: e.target.value })}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-semibold tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500">
                                Cash Paid
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.row.cashAmount}
                                onChange={(e) => updateRow({ cashAmount: e.target.value })}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500">
                                M-Pesa Paid
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.row.mpesaAmount}
                                onChange={(e) => updateRow({ mpesaAmount: e.target.value })}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs tabular-nums"
                              />
                            </div>
                          </div>

                          <input
                            type="text"
                            value={item.row.notes}
                            onChange={(e) => updateRow({ notes: e.target.value })}
                            placeholder="Note for this person (e.g. Paid 400 cash, 200 debt for Kane)"
                            className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {(paymentMethod === 'MPESA' ||
            (paymentMethod === 'SPLIT' &&
              (isMultiSplitActive ? multiSharesMpesa > 0 : splitMpesa > 0))) && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mpesaReference}
                  onChange={(e) => setMpesaReference(e.target.value)}
                  placeholder="M-Pesa Ref Code (e.g. UBK49201XY)"
                  className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={stkPhone || selectedCustomer?.phone || ''}
                  onChange={(e) => setStkPhone(e.target.value)}
                  placeholder="STK Phone (07...)"
                  className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={stkBusy}
                  onClick={handleTriggerStkPush}
                  className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  STK Push
                </button>
              </div>
              {stkCheckoutId && (
                <button
                  type="button"
                  disabled={stkBusy}
                  onClick={handleSimulateStkConfirm}
                  className="w-full rounded bg-slate-900 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Simulate M-Pesa Payment Confirmation ({stkCheckoutId.slice(0, 14)}...)
                </button>
              )}
            </div>
          )}

          {(paymentMethod === 'CREDIT' || calculatedDebtAdded > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 space-y-1">
              <label className="block text-[11px] font-semibold uppercase text-amber-900">
                Debt Note (Optional — e.g. who drink was bought for)
              </label>
              <input
                type="text"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="e.g. This drink was bought for John"
                className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </div>
          )}

          {exceedsCreditLimit && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <p className="font-semibold">
                Warning: This credit purchase exceeds credit limit for{' '}
                {creditLimitViolations
                  .map(
                    (v) =>
                      `${v.customer.fullName} (Limit: ${formatKsh(v.customer.creditLimit)})`
                  )
                  .join(', ')}
                .
              </p>
              <label className="flex items-center gap-2 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowCreditOverride}
                  onChange={(e) => setAllowCreditOverride(e.target.checked)}
                />
                Owner Override: Authorize credit above customer limit
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={submitting || updatingExistingDebt || cart.length === 0}
          onClick={handleCheckout}
          className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50 ${
            paymentMethod === 'CREDIT'
              ? 'bg-rose-600 hover:bg-rose-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {submitting
            ? 'Processing Sale...'
            : paymentMethod === 'CREDIT'
              ? `Post New Debt Sale (+${formatKsh(calculatedDebtAdded)})`
              : `Complete Sale (${formatKsh(totalAmount)}${
                  calculatedDebtAdded > 0 ? ` · Debt +${formatKsh(calculatedDebtAdded)}` : ''
                })`}
        </button>

        {selectedCustomer && latestOpenDebtSale && cart.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              disabled={submitting || updatingExistingDebt}
              onClick={handleAppendCartToExistingDebt}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 py-2.5 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              {updatingExistingDebt
                ? 'Adding to Open Debt...'
                : `Add Cart to Open Debt (${latestOpenDebtSale.receiptNumber})`}
            </button>
            <p className="text-[11px] text-center text-slate-500">
              Current open bill: {formatKsh(latestOpenDebtSale.outstandingAmount ?? latestOpenDebtSale.totalAmount)}
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Sticky mobile quick-jump to checkout when items added on catalog tab */}
      {mobileView === 'catalog' && cart.length > 0 && (
        <div className="xl:hidden fixed bottom-16 inset-x-3 z-20">
          <button
            type="button"
            onClick={() => setMobileView('cart')}
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 shadow-lg flex items-center justify-between text-sm font-bold"
          >
            <span>
              View Order ({cartItemCount} item{cartItemCount === 1 ? '' : 's'})
            </span>
            <span className="text-emerald-400">{formatKsh(totalAmount)} →</span>
          </button>
        </div>
      )}

      {/* Quick Register Customer Modal */}
      <Modal
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        title="Quick Register Customer"
        subtitle="Creates customer account & secure debt portal link immediately"
      >
        <form onSubmit={handleQuickRegisterCustomer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={newCust.fullName}
              onChange={(e) => setNewCust((p) => ({ ...p, fullName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Phone Number
            </label>
            <input
              type="text"
              required
              placeholder="0712345678"
              value={newCust.phone}
              onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Credit Limit (KSh)
            </label>
            <input
              type="number"
              min="0"
              value={newCust.creditLimit}
              onChange={(e) => setNewCust((p) => ({ ...p, creditLimit: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => void submitQuickRegisterCustomer(true)}
              disabled={!newCust.fullName.trim() || !newCust.phone.trim()}
              className="w-full rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {cart.length > 0
                ? 'Save Customer & Switch Cart to Debt'
                : 'Save Customer & Select Debt Mode'}
            </button>
            <button
              type="submit"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              {cart.length > 0 ? 'Save Customer Only (Keep Cash / M-Pesa)' : 'Save & Select Customer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Park / Hold Running Bar Tab Modal */}
      <Modal
        open={holdTabOpen}
        onClose={() => setHoldTabOpen(false)}
        title={activeTabId ? 'Update Running Bar Tab' : 'Park / Hold Running Bar Tab'}
        subtitle="Save drinks to a named counter or table tab so the customer can add more drinks before settling Cash, M-Pesa, or Debt later."
      >
        <form onSubmit={handleConfirmHoldTab} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Tab Name (Table or Customer)
            </label>
            <input
              type="text"
              required
              value={tabLabelInput}
              onChange={(e) => setTabLabelInput(e.target.value)}
              placeholder="e.g., Counter - Steve or Table 4"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Counter', 'Table 1', 'Table 2', 'Table 3', 'VIP Corner'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTabLabelInput(preset)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">
              {cart.reduce((s, l) => s + l.quantity, 0)} bottle(s) · {formatKsh(totalAmount)}
            </p>
            {selectedCustomer && <p className="mt-0.5">Linked customer: {selectedCustomer.fullName}</p>}
            {saleNotes && <p className="mt-0.5 italic">Note: {saleNotes}</p>}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            {activeTabId ? 'Save Updated Tab' : 'Park Open Tab'}
          </button>
        </form>
      </Modal>

      <CustomerDebtTabModal
        open={debtTabModalOpen && selectedCustomer !== null}
        onClose={() => setDebtTabModalOpen(false)}
        customer={
          selectedCustomer
            ? {
                id: selectedCustomer.id,
                fullName: selectedCustomer.fullName,
                accountNumber: selectedCustomer.accountNumber,
                currentDebt: selectedCustomer.currentDebt,
                creditLimit: selectedCustomer.creditLimit,
              }
            : null
        }
        existingSales={selectedCustomerOpenSales}
        onSuccess={() => {
          void loadData();
          if (selectedCustomerId) {
            void loadCustomerOpenSales(selectedCustomerId);
          }
        }}
      />

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      <ReceiptModal
        sale={completedSale}
        open={completedSale !== null}
        onClose={() => setCompletedSale(null)}
        onEditSale={
          completedSale && !completedSale.id.startsWith('tmp-')
            ? () => {
                setEditingPosSaleId(completedSale.id);
                setCompletedSale(null);
              }
            : undefined
        }
      />

      <Modal
        open={recentSalesModalOpen}
        onClose={() => setRecentSalesModalOpen(false)}
        title="Recent POS Receipts"
        subtitle="Edit or void walk-in Cash/M-Pesa, multi-person split, or customer receipts and restore stock"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={recentSalesSearch}
              onChange={(e) => setRecentSalesSearch(e.target.value)}
              placeholder="Search receipt #, customer name, or drink..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>

          {loadingRecentSales ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading recent receipts...</div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {recentSalesList
                .filter((s) => {
                  const q = recentSalesSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    s.receiptNumber.toLowerCase().includes(q) ||
                    (s.customer?.fullName || 'Walk-in').toLowerCase().includes(q) ||
                    s.items.some((i) => i.productName.toLowerCase().includes(q))
                  );
                })
                .map((s) => (
                  <div
                    key={s.id}
                    className="p-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">
                        {s.receiptNumber} · {s.customer ? s.customer.fullName : 'Walk-in Sale'}
                        {s.shares && s.shares.length > 1 ? ` (Split ×${s.shares.length})` : ''}
                        {s.status === 'VOIDED' ? ' · VOIDED' : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.paymentMethod} · {formatDateTime(s.soldAt)} ·{' '}
                        {s.items
                          .map(
                            (i) =>
                              `${(i as { isFlagged?: boolean }).isFlagged ? '* ' : ''}${
                                i.productName
                              } x${i.quantity}`
                          )
                          .join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold tabular-nums text-slate-900">
                        {formatKsh(s.totalAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRecentSalesModalOpen(false);
                          setCompletedSale(s);
                        }}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Receipt
                      </button>
                      {s.status !== 'VOIDED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setRecentSalesModalOpen(false);
                            setEditingPosSaleId(s.id);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          <Pencil className="h-3 w-3" /> Edit Drinks
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Modal>

      <EditSaleModal
        open={editingPosSaleId !== null}
        saleId={editingPosSaleId}
        onClose={() => setEditingPosSaleId(null)}
        onSuccess={async () => {
          await loadData();
          if (selectedCustomerId) {
            await loadCustomerOpenSales(selectedCustomerId);
          }
        }}
      />

      <Modal
        open={closingOpen}
        onClose={() => setClosingOpen(false)}
        title="End-of-Day Closing Summary"
        subtitle="Total sold broken down by Cash, M-Pesa, and Debt — plus drawer reconciliation"
        maxWidth="max-w-4xl"
      >
        <DailyClosingPanel compact />
      </Modal>
    </div>
  );
}

