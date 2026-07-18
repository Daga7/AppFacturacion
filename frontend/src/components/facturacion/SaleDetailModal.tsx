import { useState } from "react";
import { api } from "../../lib/api";
import type { Product, Sale } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney, formatDateTime, invoiceCode } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { StatusBadge } from "../ui/StatusBadge";
import { primaryBtnCls, secondaryBtnCls } from "../ui/inputs";
import { ProductLinesEditor } from "./ProductLinesEditor";
import { linesTotal, parseLines, type SaleLine } from "./saleLines";
import { PaymentsEditor } from "./PaymentsEditor";
import { paymentsTotal, parsePayments, type PaymentLine } from "./paymentLines";

interface SaleDetailModalProps {
  sale: Sale;
  isAdmin: boolean;
  products: Product[];
  availability: (productId: string) => number;
  onClose: () => void;
  onChanged: () => void;
}

// Ventana flotante con el detalle completo de una venta. En modo admin
// permite editar productos y pagos (el backend re-sincroniza inventario y
// préstamo) y cancelar la venta.
export function SaleDetailModal({
  sale,
  isAdmin,
  products,
  availability,
  onClose,
  onChanged,
}: SaleDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setLines(
      sale.details.map((d) => ({
        productId: d.productId,
        barcode: d.product?.barcode ?? "",
        quantity: String(d.quantity),
        unitPrice: String(d.unitPrice),
        discount: String(d.discount),
      })),
    );
    setPayments(
      sale.payments.map((p) => ({
        paymentMethod: p.paymentMethod,
        amount: String(p.amount),
      })),
    );
    setError(null);
    setEditing(true);
  };

  const total = linesTotal(lines);

  const handleSave = async () => {
    const parsedLines = parseLines(lines);
    if ("error" in parsedLines) { setError(parsedLines.error); return; }
    const parsedPayments = parsePayments(payments);
    if ("error" in parsedPayments) { setError(parsedPayments.error); return; }
    if (!sale.isCredit && Math.abs(paymentsTotal(payments) - total) > 0.01) {
      setError("Los pagos deben cubrir exactamente el nuevo total");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/sales/${sale.id}`, {
        details: parsedLines.details,
        payments: parsedPayments.payments,
      });
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar los cambios");
      setSaving(false);
    }
  };

  const handleCancelSale = async () => {
    if (!confirm("¿Cancelar esta venta? Se devolverá el stock al inventario.")) return;
    setSaving(true);
    try {
      await api.post(`/sales/${sale.id}/cancel`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar");
      setSaving(false);
    }
  };

  const abonado = sale.loan
    ? sale.loan.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  return (
    <Modal title={`Factura ${invoiceCode(sale.invoiceNumber)}`} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <span>{formatDateTime(sale.createdAt)}</span>
        <span>· {sale.branch.name}</span>
        {sale.user && <span>· Atendió: {sale.user.username}</span>}
        {sale.customer && (
          <span>· Cliente: {sale.customer.firstName} {sale.customer.lastName ?? ""}</span>
        )}
        <StatusBadge tone={sale.status === "COMPLETED" ? "success" : "danger"}>
          {sale.status === "COMPLETED" ? "Completada" : "Cancelada"}
        </StatusBadge>
        {sale.isCredit && <StatusBadge tone="warning">Crédito</StatusBadge>}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-400 mb-2">Productos</p>
            <ProductLinesEditor
              products={products}
              lines={lines}
              onChange={setLines}
              availability={availability}
            />
          </div>
          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <span className="text-slate-400 text-sm">Nuevo total</span>
            <span className="text-2xl font-bold text-white">{formatMoney(total)}</span>
          </div>
          <div>
            <p className="text-sm text-slate-400 mb-2">Pagos</p>
            <PaymentsEditor payments={payments} onChange={setPayments} total={total} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className={primaryBtnCls}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            <button onClick={() => setEditing(false)} className={secondaryBtnCls}>
              Descartar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pb-2 font-medium text-right">Cant.</th>
                  <th className="pb-2 font-medium text-right">P. Unit.</th>
                  <th className="pb-2 font-medium text-right">Desc.</th>
                  <th className="pb-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sale.details.map((d) => (
                  <tr key={d.id} className="border-b border-slate-800/50">
                    <td className="py-2 text-white">{d.product?.name}</td>
                    <td className="py-2 text-right text-slate-300">{d.quantity}</td>
                    <td className="py-2 text-right text-slate-300">{formatMoney(d.unitPrice)}</td>
                    <td className="py-2 text-right text-slate-300">{formatMoney(d.discount)}</td>
                    <td className="py-2 text-right text-white font-medium">{formatMoney(d.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <p className="text-2xl font-bold text-white">Total: {formatMoney(sale.total)}</p>
          </div>

          {sale.payments.length > 0 && (
            <div className="border-t border-slate-800 pt-3">
              <p className="text-sm font-medium text-slate-400 mb-2">Pagos</p>
              <div className="space-y-1">
                {sale.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="text-slate-300">{paymentMethodLabels[p.paymentMethod]}</span>
                    <span className="text-white font-medium">{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sale.loan && (
            <div className="border-t border-slate-800 pt-3 text-sm space-y-1">
              <p className="font-medium text-slate-400 mb-2">Préstamo</p>
              <div className="flex justify-between">
                <span className="text-slate-300">Monto original</span>
                <span className="text-white">{formatMoney(sale.loan.originalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Abonado</span>
                <span className="text-emerald-400">{formatMoney(abonado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Pendiente</span>
                <span className="text-yellow-400 font-semibold">{formatMoney(sale.loan.pendingAmount)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {isAdmin && sale.status === "COMPLETED" && (
            <div className="flex gap-2 border-t border-slate-800 pt-4">
              <button onClick={startEdit} className={primaryBtnCls}>
                Editar venta
              </button>
              <button
                onClick={handleCancelSale}
                disabled={saving}
                className="px-4 py-2 bg-red-900/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/30 transition-colors disabled:opacity-50"
              >
                Cancelar venta
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
