import { useState } from "react";
import type { Product } from "../../lib/types";
import { saleOperation, submitOperation } from "../../lib/offline/operations";
import { formatMoney } from "../../lib/format";
import { Card } from "../ui/Card";
import { primaryBtnCls, secondaryBtnCls } from "../ui/inputs";
import { ProductLinesEditor } from "./ProductLinesEditor";
import {
  emptySaleLine,
  linesTotal,
  parseLines,
  type SaleLine,
  type SaleMode,
} from "./saleLines";
import { PaymentsEditor } from "./PaymentsEditor";
import { emptyPayment, paymentsTotal, parsePayments, type PaymentLine } from "./paymentLines";

interface SaleFormProps {
  branchId: string;
  products: Product[];
  availability: (productId: string) => number;
  // Número de factura asignado, o null si quedó guardada sin conexión.
  onSaved: (invoiceNumber: number | null) => void;
  onCancel: () => void;
  mode?: SaleMode;
}

// Formulario de Nueva Venta (contado). Compone los editores de productos y
// pagos; lo usan vendedor y administrador por igual.
// El modo decide de dónde sale el precio: de la base de datos (mayor) o
// digitado por el cajero (detal).
export function SaleForm({
  branchId,
  products,
  availability,
  onSaved,
  onCancel,
  mode = "MAYOR",
}: SaleFormProps) {
  const [lines, setLines] = useState<SaleLine[]>([emptySaleLine()]);
  const [payments, setPayments] = useState<PaymentLine[]>([emptyPayment()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = linesTotal(lines);

  const handleSubmit = async () => {
    const parsedLines = parseLines(lines);
    if ("error" in parsedLines) { setError(parsedLines.error); return; }
    const parsedPayments = parsePayments(payments);
    if ("error" in parsedPayments) { setError(parsedPayments.error); return; }
    if (Math.abs(paymentsTotal(payments) - total) > 0.01) {
      setError("Los pagos deben cubrir exactamente el total de la venta");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const outcome = await submitOperation(
        saleOperation({
          branchId,
          customer: null,
          isCredit: false,
          details: parsedLines.details,
          payments: parsedPayments.payments,
          products,
        }),
      );
      onSaved(outcome.queued ? null : Number(outcome.result.invoiceNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar la venta");
    }
    setSaving(false);
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h4 className="text-white font-medium">
          {mode === "DETAL" ? "Venta al detal" : "Venta al por mayor"}
        </h4>
        <p className="text-xs text-slate-500 mt-0.5">
          {mode === "DETAL"
            ? "Escribe el precio de cada producto."
            : "Los precios se cargan desde la base de datos."}
        </p>
      </div>

      <ProductLinesEditor
        products={products}
        lines={lines}
        onChange={setLines}
        availability={availability}
        mode={mode}
      />

      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="text-slate-400 text-sm">Total</span>
        <span className="text-2xl font-bold text-white">{formatMoney(total)}</span>
      </div>

      <div>
        <p className="text-sm text-slate-400 mb-2">Pagos</p>
        <PaymentsEditor payments={payments} onChange={setPayments} total={total} />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving} className={primaryBtnCls}>
          {saving ? "Guardando..." : "Registrar venta"}
        </button>
        <button onClick={onCancel} className={secondaryBtnCls}>
          Cancelar
        </button>
      </div>
    </Card>
  );
}
