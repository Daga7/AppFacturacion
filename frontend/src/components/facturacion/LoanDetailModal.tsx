import { useState } from "react";
import type { Loan, PaymentMethod } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney, formatDateTime, saleCode } from "../../lib/format";
import { loanPaymentOperation, submitOperation } from "../../lib/offline/operations";
import { Modal } from "../ui/Modal";
import { StatusBadge } from "../ui/StatusBadge";
import { inputCls, primaryBtnCls } from "../ui/inputs";

interface LoanDetailModalProps {
  loan: Loan;
  onClose: () => void;
  // queued = quedó guardado sin conexión.
  onChanged: (queued: boolean) => void;
}

// Detalle de un préstamo con historial de abonos y formulario para abonar.
export function LoanDetailModal({ loan, onClose, onChanged }: LoanDetailModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = Number(loan.pendingAmount);

  const handlePayment = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError("Ingresa un monto válido"); return; }
    if (value > pending + 0.01) { setError(`El abono supera el saldo pendiente (${formatMoney(pending)})`); return; }
    setSaving(true);
    setError(null);
    try {
      const outcome = await submitOperation(loanPaymentOperation(loan, value, method));
      onChanged(outcome.queued);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el abono");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Préstamo — ${loan.customer.firstName} ${loan.customer.lastName ?? ""}`}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        {loan.sale && <span>{saleCode(loan.sale)} · {loan.sale.branch.name}</span>}
        <span>· {formatDateTime(loan.createdAt)}</span>
        <StatusBadge tone={loan.loanStatus === "PAID" ? "success" : "warning"}>
          {loan.loanStatus === "PAID" ? "Pagado" : "Activo"}
        </StatusBadge>
      </div>

      {loan.sale && (
        <div className="text-sm space-y-1">
          <p className="font-medium text-slate-400">Productos</p>
          {loan.sale.details.map((d) => (
            <div key={d.id} className="flex justify-between">
              <span className="text-slate-300">
                {d.quantity} × {d.product?.name}
              </span>
              <span className="text-white">{formatMoney(d.subtotal)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-800 pt-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-300">Monto original</span>
          <span className="text-white font-medium">{formatMoney(loan.originalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">Pendiente</span>
          <span className="text-yellow-400 font-bold text-lg">{formatMoney(pending)}</span>
        </div>
      </div>

      {loan.payments.length > 0 && (
        <div className="border-t border-slate-800 pt-3 text-sm">
          <p className="font-medium text-slate-400 mb-2">Abonos</p>
          <div className="space-y-1">
            {loan.payments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="text-slate-300">
                  {formatDateTime(p.createdAt)} · {paymentMethodLabels[p.paymentMethod]}
                  {p.pending && " · sin enviar"}
                </span>
                <span className="text-emerald-400 font-medium">{formatMoney(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loan.loanStatus === "ACTIVE" && (
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <p className="text-sm font-medium text-slate-400">Registrar abono</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} w-36`}
            />
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={`${inputCls} w-40`}>
              {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{paymentMethodLabels[m]}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button onClick={handlePayment} disabled={saving} className={primaryBtnCls}>
            {saving ? "Registrando..." : "Abonar"}
          </button>
        </div>
      )}
    </Modal>
  );
}
