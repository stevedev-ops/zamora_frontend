import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { formatDateTime, formatKsh } from '../../utils/format';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';
import {
  CatalogProduct,
  CustomerOption,
  EditableSaleInput,
  SaleEditorForm,
} from './SaleEditorForm';

interface EditSaleModalProps {
  open: boolean;
  saleId: string | null;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

export function EditSaleModal({ open, saleId, onClose, onSuccess }: EditSaleModalProps) {
  const { showToast } = useToast();
  const [sale, setSale] = useState<EditableSaleInput | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !saleId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [saleRes, prodRes, custRes] = await Promise.all([
          api.get<{ sale: EditableSaleInput }>(`/sales/${saleId}`),
          api.get<{ products: CatalogProduct[] }>('/products?activeOnly=true'),
          api.get<{ customers: CustomerOption[] }>('/customers').catch(() => ({ customers: [] })),
        ]);
        if (cancelled) return;
        setSale(saleRes.sale);
        setProducts(prodRes.products || []);
        setCustomers(custRes.customers || []);
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof ApiError ? err.message : 'Failed to load sale receipt', 'error');
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saleId]);

  const title = sale ? `Edit Receipt — ${sale.receiptNumber}` : 'Edit Sale Receipt';
  const subtitle = sale
    ? `${sale.customer ? sale.customer.fullName : 'Walk-in Sale'} · ${sale.paymentMethod ?? ''} · ${
        sale.soldAt ? formatDateTime(sale.soldAt) : ''
      } · Total: ${formatKsh(sale.totalAmount)}`
    : undefined;

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-2xl">
      {loading || !sale ? (
        <div className="py-10 text-center text-sm text-slate-500">Loading receipt details...</div>
      ) : (
        <SaleEditorForm
          sale={sale}
          products={products}
          customers={customers}
          submitLabel="Save Receipt Changes"
          onCancel={onClose}
          onSuccess={async () => {
            await Promise.resolve(onSuccess?.());
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

