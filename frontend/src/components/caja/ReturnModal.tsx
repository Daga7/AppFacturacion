import { useState } from "react";
import { api } from "../../lib/api";
import type { PaymentMethod, Product, ReturnableSale, SaleReturn } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatDateTime, formatMoney, invoiceCode } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { inputCls, primaryBtnCls, secondaryBtnCls } from "../ui/inputs";

interface ReturnModalProps {
  product: Product;
  sale: ReturnableSale;
  onClose: () => void;
  onSaved: (saleReturn: SaleReturn) => void;
}

// Confirmación de una devolución: cuántas unidades, cómo se le devuelve el
// dinero al cliente y el motivo. El valor lo calcula el servidor con lo que
// el cliente pagó; aquí solo se muestra como referencia.
export function ReturnModal({ product, sale, onClose, onSaved }: ReturnModalProps) {
  const [quantity, setQuantity] = useState("1");
  // Por defecto se devuelve por el mismo medio con el que pagó (si fue uno solo).
  const [method, setMethod] = useState<PaymentMethod>(
    sale.paymentMethods.length === 1 ? sale.paymentMethods[0] : "CASH",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = parseInt(quantity, 10);
  const validQty = qty >= 1 && qty <= sale.returnableQuantity;
  const refund = validQty ? sale.unitPaid * qty : 0;

  const handleSubmit = async () => {
    if (!validQty) {
      setError(`La cantidad debe estar entre 1 y ${sale.returnableQuantity}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<SaleReturn>("/returns", {
        saleDetailId: sale.saleDetailId,
        quantity: qty,
        paymentMethod: method,
        reason: reason.trim() || undefined,
      });
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar la devolución");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Devolver ${product.name}`} onClose={onClose}>
      <p className="text-sm text-slate-400">
        Factura {invoiceCode(sale.invoiceNumber)} · {formatDateTime(sale.createdAt)}
        {sale.customerName ? ` · ${sale.customerName}` : ""}
      </p>

      <div className="space-y-3">
        {sale.returnableQuantity > 1 && (
          <label className="block space-y-1">
            <span className="text-sm text-slate-400">
              Cantidad a devolver (máximo {sale.returnableQuantity})
            </span>
            <input
              type="number"
              min="1"
              max={sale.returnableQuantity}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">¿Cómo se le devuelve el dinero?</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className={`${inputCls} w-full`}
          >
            {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>{paymentMethodLabels[m]}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">Motivo (opcional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: no enciende, no le quedó al equipo"
            maxLength={300}
            className={`${inputCls} w-full`}
          />
        </label>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-slate-300 text-sm">Devolver al cliente</span>
          <span className="text-2xl font-bold text-white">{formatMoney(refund)}</span>
        </div>
        <p className="text-xs text-slate-500">
          {method === "CASH"
            ? "Sale del efectivo de la caja y se descuenta en el cierre."
            : `Se transfiere por ${paymentMethodLabels[method]}; no afecta el efectivo de la caja.`}{" "}
          La pantalla vuelve al inventario.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving || !validQty} className={primaryBtnCls}>
          {saving ? "Registrando..." : "Registrar devolución"}
        </button>
        <button onClick={onClose} className={secondaryBtnCls}>Cancelar</button>
      </div>
    </Modal>
  );
}
