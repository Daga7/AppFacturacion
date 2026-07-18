import { useState } from "react";
import { api } from "../../lib/api";
import type { PaymentMethod } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney, formatDateTime, invoiceCode } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { inputCls, primaryBtnCls } from "../ui/inputs";
import type { CustomerDebt } from "./PendingCustomersList";

interface CustomerLoansModalProps {
  debt: CustomerDebt;
  onClose: () => void;
  onChanged: () => void;
}

// Detalle de la deuda de un cliente: cada préstamo con su fecha, productos y
// saldo. El abono se aplica automáticamente a los préstamos más antiguos.
export function CustomerLoansModal({ debt, onClose, onChanged }: CustomerLoansModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedLoans = [...debt.loans].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );

  const handleAbono = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError("Ingresa un monto válido"); return; }
    if (value > debt.totalPending + 0.01) {
      setError(`El abono supera la deuda total (${formatMoney(debt.totalPending)})`);
      return;
    }
    setSaving(true);
    setError(null);
    let remaining = value;
    try {
      for (const loan of sortedLoans) {
        if (remaining <= 0.009) break;
        const pay = Math.min(remaining, Number(loan.pendingAmount));
        if (pay < 0.01) continue;
        await api.post(`/loans/${loan.id}/payments`, {
          amount: Math.round(pay * 100) / 100,
          paymentMethod: method,
        });
        remaining -= pay;
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el abono");
      onChanged();
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${debt.customer.firstName} ${debt.customer.lastName ?? ""}`}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {debt.loans.length} préstamo{debt.loans.length === 1 ? "" : "s"} activo
          {debt.loans.length === 1 ? "" : "s"}
        </span>
        <div className="text-right">
          <p className="text-xs text-slate-500">Debe en total</p>
          <p className="text-2xl font-bold text-yellow-400">{formatMoney(debt.totalPending)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {sortedLoans.map((loan) => {
          const abonado = loan.payments.reduce((sum, p) => sum + Number(p.amount), 0);
          return (
            <div key={loan.id} className="border border-slate-800 rounded-lg p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-400">
                  {formatDateTime(loan.createdAt)}
                  {loan.sale && ` · ${invoiceCode(loan.sale.invoiceNumber)} · ${loan.sale.branch.name}`}
                </span>
                <span className="text-yellow-400 font-semibold">
                  Debe {formatMoney(loan.pendingAmount)}
                </span>
              </div>
              {loan.sale && (
                <div className="space-y-1">
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
              <div className="flex justify-between text-xs text-slate-500 border-t border-slate-800 pt-2">
                <span>Original: {formatMoney(loan.originalAmount)}</span>
                <span>Abonado: {formatMoney(abonado)}</span>
              </div>
            </div>
          );
        })}
      </div>

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
        {debt.loans.length > 1 && (
          <p className="text-xs text-slate-500">
            El abono se aplica primero a los préstamos más antiguos.
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button onClick={handleAbono} disabled={saving} className={primaryBtnCls}>
          {saving ? "Registrando..." : "Abonar"}
        </button>
      </div>
    </Modal>
  );
}
