import type { PaymentMethodBreakdown } from "../../lib/reports";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { Panel } from "../ui/Panel";

interface PaymentMethodsPanelProps {
  byMethod: PaymentMethodBreakdown;
  grandTotal: number;
}

// Desglose de métodos de pago con barras de porcentaje.
export function PaymentMethodsPanel({ byMethod, grandTotal }: PaymentMethodsPanelProps) {
  return (
    <Panel title="Métodos de pago">
      <div className="space-y-3">
        {Object.entries(byMethod).map(([method, data]) => (
          <div key={method}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">
                {paymentMethodLabels[method as keyof typeof paymentMethodLabels] ?? method}
              </span>
              <span className="text-white font-medium">
                {formatMoney(data.total)} ({data.share}%)
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div className="bg-brand h-2 rounded-full" style={{ width: `${data.share}%` }} />
            </div>
          </div>
        ))}
        {Object.keys(byMethod).length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
      </div>
      <p className="text-xs text-slate-500 mt-4">Total: {formatMoney(grandTotal)}</p>
    </Panel>
  );
}
