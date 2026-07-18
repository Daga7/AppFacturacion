import { useState } from "react";
import { api } from "../../lib/api";
import type { Customer, Product, Sale } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { Card } from "../ui/Card";
import { inputCls, primaryBtnCls } from "../ui/inputs";
import { ProductLinesEditor } from "./ProductLinesEditor";
import { emptySaleLine, linesTotal, parseLines, type SaleLine } from "./saleLines";
import { PaymentsEditor } from "./PaymentsEditor";
import { paymentsTotal, parsePayments, type PaymentLine } from "./paymentLines";

interface LoanFormProps {
  branchId: string;
  products: Product[];
  customers: Customer[];
  availability: (productId: string) => number;
  onSaved: (sale: Sale) => void;
}

// Generar préstamo = venta a crédito: el cliente se lleva productos y queda
// con saldo pendiente (puede dar un abono inicial opcional).
export function LoanForm({ branchId, products, customers, availability, onSaved }: LoanFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([emptySaleLine()]);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = linesTotal(lines);
  const abono = paymentsTotal(payments);
  const pendiente = total - abono;

  const handleSubmit = async () => {
    if (!customerId) { setError("Selecciona el cliente"); return; }
    const parsedLines = parseLines(lines);
    if ("error" in parsedLines) { setError(parsedLines.error); return; }
    const parsedPayments = parsePayments(payments);
    if ("error" in parsedPayments) { setError(parsedPayments.error); return; }
    if (pendiente <= 0.01) {
      setError("El abono inicial cubre todo; regístrala como venta de contado");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sale = await api.post<Sale>("/sales", {
        branchId,
        customerId,
        isCredit: true,
        details: parsedLines.details,
        payments: parsedPayments.payments,
      });
      setCustomerId("");
      setLines([emptySaleLine()]);
      setPayments([]);
      onSaved(sale);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el préstamo");
    }
    setSaving(false);
  };

  return (
    <Card className="p-4 space-y-4">
      <h4 className="text-white font-medium">Generar préstamo</h4>

      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`${inputCls} w-full md:w-80`}>
        <option value="">Seleccionar cliente</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.firstName} {c.lastName ?? ""} {c.phone ? `— ${c.phone}` : ""}
          </option>
        ))}
      </select>

      <ProductLinesEditor
        products={products}
        lines={lines}
        onChange={setLines}
        availability={availability}
        showDiscount={false}
      />

      <div>
        <p className="text-sm text-slate-400 mb-2">Abono inicial (opcional)</p>
        <PaymentsEditor payments={payments} onChange={setPayments} total={total} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-sm">
        <span className="text-slate-400">
          Total: <span className="text-white font-semibold">{formatMoney(total)}</span>
        </span>
        {abono > 0 && (
          <span className="text-slate-400">
            Abono: <span className="text-emerald-400 font-semibold">{formatMoney(abono)}</span>
          </span>
        )}
        <span className="text-slate-400">
          Queda debiendo: <span className="text-yellow-400 font-semibold">{formatMoney(Math.max(0, pendiente))}</span>
        </span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button onClick={handleSubmit} disabled={saving} className={primaryBtnCls + " w-full"}>
        {saving ? "Generando..." : "Generar préstamo"}
      </button>
    </Card>
  );
}
