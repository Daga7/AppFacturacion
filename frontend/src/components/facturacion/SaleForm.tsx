import { useState } from "react";
import { api } from "../../lib/api";
import type { Product, Sale } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { Card } from "../ui/Card";
import { primaryBtnCls, secondaryBtnCls } from "../ui/inputs";
import { ProductLinesEditor } from "./ProductLinesEditor";
import { emptySaleLine, linesTotal, parseLines, type SaleLine } from "./saleLines";
import { PaymentsEditor } from "./PaymentsEditor";
import { emptyPayment, paymentsTotal, parsePayments, type PaymentLine } from "./paymentLines";

interface SaleFormProps {
  branchId: string;
  products: Product[];
  availability: (productId: string) => number;
  onSaved: (sale: Sale) => void;
  onCancel: () => void;
}

// Formulario de Nueva Venta (contado). Compone los editores de productos y
// pagos; lo usan vendedor y administrador por igual.
export function SaleForm({ branchId, products, availability, onSaved, onCancel }: SaleFormProps) {
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
      const sale = await api.post<Sale>("/sales", {
        branchId,
        details: parsedLines.details,
        payments: parsedPayments.payments,
      });
      onSaved(sale);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar la venta");
    }
    setSaving(false);
  };

  return (
    <Card className="p-4 space-y-4">
      <h4 className="text-white font-medium">Nueva venta</h4>

      <ProductLinesEditor
        products={products}
        lines={lines}
        onChange={setLines}
        availability={availability}
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
