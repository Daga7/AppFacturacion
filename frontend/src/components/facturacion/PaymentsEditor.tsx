import type { PaymentMethod } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { inputCls } from "../ui/inputs";
import { emptyPayment, paymentsTotal, type PaymentLine } from "./paymentLines";

// Editor reutilizable de pagos (método + monto), permite pagos mixtos.

interface PaymentsEditorProps {
  payments: PaymentLine[];
  onChange: (payments: PaymentLine[]) => void;
  total: number;
}

export function PaymentsEditor({ payments, onChange, total }: PaymentsEditorProps) {
  const paid = paymentsTotal(payments);
  const remaining = total - paid;

  const update = (i: number, patch: Partial<PaymentLine>) =>
    onChange(payments.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-2">
      {payments.map((p, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <select
            value={p.paymentMethod}
            onChange={(e) => update(i, { paymentMethod: e.target.value as PaymentMethod })}
            className={`${inputCls} w-40`}
          >
            {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {paymentMethodLabels[m]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Monto"
            value={p.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
            className={`${inputCls} w-32`}
          />
          {remaining > 0.01 && (
            <button
              onClick={() => update(i, { amount: String((parseFloat(p.amount) || 0) + remaining) })}
              className="text-xs text-brand-light hover:underline"
            >
              Completar
            </button>
          )}
          {payments.length > 1 && (
            <button
              onClick={() => onChange(payments.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-red-400 text-sm px-1"
              aria-label="Quitar pago"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange([...payments, emptyPayment()])}
          className="text-sm text-brand-light hover:underline"
        >
          + Agregar otro pago
        </button>
        {Math.abs(remaining) > 0.01 && (
          <span className={`text-xs ${remaining > 0 ? "text-yellow-400" : "text-red-400"}`}>
            {remaining > 0 ? `Restante: ${formatMoney(remaining)}` : `Sobra: ${formatMoney(-remaining)}`}
          </span>
        )}
      </div>
    </div>
  );
}
