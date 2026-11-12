import { Download, MessageCircle, Pencil, Printer, Receipt } from 'lucide-react';
import { Modal } from '../common/Modal';
import { downloadBinaryFile } from '../../api/client';
import { formatDateTime, formatKsh } from '../../utils/format';

export interface ReceiptSaleData {
  id: string;
  receiptNumber: string;
  soldAt: string;
  status?: string;
  paymentMethod: string;
  mpesaReference?: string | null;
  notes?: string | null;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  cashAmount: number;
  mpesaAmount: number;
  amountPaid: number;
  outstandingAmount: number;
  customer?: { fullName: string; accountNumber: string; phone: string } | null;
  items: Array<{
    id: string;
    productName: string;
    brand: string;
    bottleSize: string;
    quantity: number;
    unitSellingPrice: number;
    lineTotal: number;
  }>;
  shares?: Array<{
    id: string;
    customerId?: string | null;
    payerName: string;
    accountNumber?: string | null;
    shareTotal: number;
    cashAmount: number;
    mpesaAmount: number;
    paidAmount: number;
    debtAmount: number;
    notes?: string | null;
  }>;
}

export function ReceiptModal({
  sale,
  open,
  onClose,
  portalSession,
  onEditSale,
}: {
  sale: ReceiptSaleData | null;
  open: boolean;
  onClose: () => void;
  portalSession?: string;
  onEditSale?: () => void;
}) {
  if (!sale) return null;

  const handleDownloadPdf = async () => {
    const path = portalSession
      ? `/portal/me/sales/${sale.id}/receipt.pdf`
      : `/sales/${sale.id}/receipt.pdf`;
    await downloadBinaryFile(path, `receipt-${sale.receiptNumber}.pdf`, portalSession);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receipt ${sale.receiptNumber}`}
      subtitle={formatDateTime(sale.soldAt)}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">Customer</span>
            <span className="font-medium text-slate-900">
              {sale.customer
                ? `${sale.customer.fullName} (${sale.customer.accountNumber})`
                : 'Walk-in Customer'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Payment Method</span>
            <span className="font-medium text-slate-900">{sale.paymentMethod}</span>
          </div>
          {sale.mpesaReference && (
            <div className="flex justify-between">
              <span className="text-slate-500">M-Pesa Reference</span>
              <span className="font-mono text-slate-900">{sale.mpesaReference}</span>
            </div>
          )}
          {sale.notes && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 shrink-0">Note</span>
              <span className="text-right font-medium text-slate-900">{sale.notes}</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Drink / Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{item.productName}</p>
                    <p className="text-xs text-slate-500">
                      {item.brand} · {item.bottleSize}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatKsh(item.unitSellingPrice)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatKsh(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatKsh(sale.subtotal)}</span>
          </div>
          {sale.discountAmount > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>Discount</span>
              <span className="tabular-nums">-{formatKsh(sale.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-100">
            <span>Total</span>
            <span className="tabular-nums">{formatKsh(sale.totalAmount)}</span>
          </div>
          {sale.cashAmount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Cash Paid</span>
              <span className="tabular-nums">{formatKsh(sale.cashAmount)}</span>
            </div>
          )}
          {sale.mpesaAmount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>M-Pesa Paid</span>
              <span className="tabular-nums">{formatKsh(sale.mpesaAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-emerald-700">
            <span>Amount Paid</span>
            <span className="tabular-nums">{formatKsh(sale.amountPaid)}</span>
          </div>
          {sale.outstandingAmount > 0 && (
            <div className="flex justify-between font-bold text-rose-600">
              <span>Added to Customer Debt</span>
              <span className="tabular-nums">{formatKsh(sale.outstandingAmount)}</span>
            </div>
          )}
          {sale.notes && (
            <p className="text-xs italic text-slate-600 pt-1">Note: {sale.notes}</p>
          )}
        </div>

        {sale.shares && sale.shares.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-bold uppercase text-slate-700">
              Split &amp; Debt Breakdown ({sale.shares.length} People)
            </p>
            <div className="space-y-1.5">
              {sale.shares.map((sh, idx) => (
                <div
                  key={sh.id || idx}
                  className="rounded-md bg-white border border-slate-200 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {sh.payerName}
                      {sh.accountNumber ? ` (${sh.accountNumber})` : ''}
                    </p>
                    {sh.notes && <p className="text-[11px] text-amber-800">{sh.notes}</p>}
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-slate-600">Share {formatKsh(sh.shareTotal)} · </span>
                    {sh.paidAmount > 0 && (
                      <span className="text-emerald-700 font-medium">
                        Paid {formatKsh(sh.paidAmount)}{' '}
                      </span>
                    )}
                    {sh.debtAmount > 0 && (
                      <span className="text-rose-600 font-bold">
                        · Debt {formatKsh(sh.debtAmount)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="no-print grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              document.body.classList.remove('print-thermal');
              window.print();
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print A4
          </button>
          <button
            type="button"
            onClick={() => {
              document.body.classList.add('print-thermal');
              const cleanup = () => {
                document.body.classList.remove('print-thermal');
                window.removeEventListener('afterprint', cleanup);
              };
              window.addEventListener('afterprint', cleanup);
              window.print();
              window.setTimeout(cleanup, 1500);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Format cleanly for 80mm thermal POS roll printer"
          >
            <Receipt className="h-4 w-4" />
            Thermal 80mm
          </button>
          <a
            href={(() => {
              const lines = [
                `*Zamora Liquor Store Receipt*`,
                `Receipt: ${sale.receiptNumber}`,
                `Date: ${formatDateTime(sale.soldAt)}`,
                sale.customer ? `Customer: ${sale.customer.fullName}` : '',
                '',
                ...sale.items.map(
                  (i) => `• ${i.productName} x${i.quantity} = ${formatKsh(i.lineTotal)}`
                ),
                '',
                `Total: *${formatKsh(sale.totalAmount)}*`,
                `Paid: ${formatKsh(sale.amountPaid)} (${sale.paymentMethod})`,
                sale.outstandingAmount > 0 ? `Added to Debt: *${formatKsh(sale.outstandingAmount)}*` : '',
                sale.notes ? `Note: ${sale.notes}` : '',
              ].filter(Boolean);
              const rawPhone = (sale.customer?.phone || '').replace(/[^0-9+]/g, '');
              const waPhone = rawPhone.startsWith('+254')
                ? rawPhone.slice(1)
                : rawPhone.startsWith('0') && rawPhone.length === 10
                  ? `254${rawPhone.slice(1)}`
                  : rawPhone.replace(/^\+/, '');
              return `https://wa.me/${waPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
            })()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 sm:flex-1"
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
          {onEditSale && !portalSession && sale.status !== 'VOIDED' && (
            <button
              type="button"
              onClick={onEditSale}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              <Pencil className="h-4 w-4" />
              Edit Drinks
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

