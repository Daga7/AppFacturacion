import { useState } from "react";
import { api } from "../../lib/api";
import type { Loan, PaymentMethod, Product } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney, formatDateTime, invoiceCode } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { inputCls, primaryBtnCls, secondaryBtnCls } from "../ui/inputs";
import { ProductLinesEditor } from "./ProductLinesEditor";
import { emptySaleLine, linesTotal, parseLines, type SaleLine } from "./saleLines";
import type { CustomerDebt } from "./PendingCustomersList";

interface CustomerLoansModalProps {
  debt: CustomerDebt;
  products: Product[];
  stockOf: (branchId: string, productId: string) => number;
  onClose: () => void;
  onChanged: () => void;
  readOnly?: boolean;
}

type LoanAction = { loanId: string; type: "abono" | "cambio" } | null;

// Detalle de la deuda de un cliente. Por cada préstamo el cajero/admin puede:
// abonar a ese préstamo específico, cambiar la mercancía por otra (código del
// producto nuevo) o eliminarlo por devolución. Abajo queda el abono general
// que se reparte entre los préstamos más antiguos.
export function CustomerLoansModal({ debt, products, stockOf, onClose, onChanged, readOnly = false }: CustomerLoansModalProps) {
  const [action, setAction] = useState<LoanAction>(null);
  const [abonoAmount, setAbonoAmount] = useState("");
  const [abonoMethod, setAbonoMethod] = useState<PaymentMethod>("CASH");
  const [exchangeLines, setExchangeLines] = useState<SaleLine[]>([emptySaleLine()]);

  const [globalAmount, setGlobalAmount] = useState("");
  const [globalMethod, setGlobalMethod] = useState<PaymentMethod>("CASH");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedLoans = [...debt.loans].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const startAction = (loan: Loan, type: "abono" | "cambio") => {
    setAction({ loanId: loan.id, type });
    setAbonoAmount("");
    setExchangeLines([emptySaleLine()]);
    setError(null);
  };

  const finish = () => {
    onChanged();
    onClose();
  };

  const submitAbono = async (loan: Loan) => {
    const value = parseFloat(abonoAmount);
    const pending = Number(loan.pendingAmount);
    if (!value || value <= 0) { setError("Ingresa un monto válido"); return; }
    if (value > pending + 0.01) {
      setError(`El abono supera lo pendiente de este préstamo (${formatMoney(pending)})`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/loans/${loan.id}/payments`, { amount: value, paymentMethod: abonoMethod });
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el abono");
      setSaving(false);
    }
  };

  const submitCambio = async (loan: Loan) => {
    const parsed = parseLines(exchangeLines);
    if ("error" in parsed) { setError(parsed.error); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/loans/${loan.id}/exchange`, {
        details: parsed.details.map((d) => ({
          productId: d.productId,
          quantity: d.quantity,
          unitPrice: d.unitPrice,
        })),
      });
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar la mercancía");
      setSaving(false);
    }
  };

  const submitDevolucion = async (loan: Loan) => {
    const conAbonos = loan.payments.length > 0
      ? " Sus abonos registrados también se eliminarán (devuélvele el dinero al cliente)."
      : "";
    if (!confirm(`¿Eliminar este préstamo por devolución? La mercancía vuelve al inventario.${conAbonos}`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/loans/${loan.id}`);
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar la devolución");
      setSaving(false);
    }
  };

  const submitGlobalAbono = async () => {
    const value = parseFloat(globalAmount);
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
          paymentMethod: globalMethod,
        });
        remaining -= pay;
      }
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el abono");
      onChanged();
      setSaving(false);
    }
  };

  const actionBtnCls = "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors";

  return (
    <Modal
      title={`${debt.customer.firstName} ${debt.customer.lastName ?? ""}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {debt.loans.length} préstamo{debt.loans.length === 1 ? "" : "s"} activo{debt.loans.length === 1 ? "" : "s"}
        </span>
        <div className="text-right">
          <p className="text-xs text-slate-500">Debe en total</p>
          <p className="text-2xl font-bold text-yellow-400">{formatMoney(debt.totalPending)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {sortedLoans.map((loan) => {
          const abonado = loan.payments.reduce((sum, p) => sum + Number(p.amount), 0);
          const branchId = loan.sale?.branch.id ?? "";
          const active = action?.loanId === loan.id ? action.type : null;
          const newTotal = linesTotal(exchangeLines);
          // Pagos hechos al momento de la venta = total de la venta − monto
          // original del préstamo; sirven para estimar el nuevo saldo del cambio.
          const saleTotal = loan.sale
            ? loan.sale.details.reduce((sum, d) => sum + Number(d.subtotal), 0)
            : Number(loan.originalAmount);
          const paymentsAtSale = Math.max(0, saleTotal - Number(loan.originalAmount));
          const estimatedPending = Math.max(0, newTotal - paymentsAtSale - abonado);
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
                      <span className="text-slate-300">{d.quantity} × {d.product?.name}</span>
                      <span className="text-white">{formatMoney(d.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-500 border-t border-slate-800 pt-2">
                <span>Original: {formatMoney(loan.originalAmount)}</span>
                <span>Abonado: {formatMoney(abonado)}</span>
              </div>

              {!readOnly && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => (active === "abono" ? setAction(null) : startAction(loan, "abono"))}
                    className={`${actionBtnCls} ${active === "abono" ? "bg-brand text-white" : "bg-brand/20 text-brand-light hover:bg-brand/30"}`}
                  >
                    Abonar
                  </button>
                  <button
                    onClick={() => (active === "cambio" ? setAction(null) : startAction(loan, "cambio"))}
                    className={`${actionBtnCls} ${active === "cambio" ? "bg-yellow-600 text-white" : "bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50"}`}
                  >
                    Cambiar mercancía
                  </button>
                  <button
                    onClick={() => submitDevolucion(loan)}
                    disabled={saving}
                    className={`${actionBtnCls} bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50`}
                  >
                    Devolución
                  </button>
                </div>
              )}

              {active === "abono" && (
                <div className="border-t border-slate-800 pt-2 space-y-2">
                  <p className="text-xs text-slate-400">Abono a este préstamo</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number" min="0" step="0.01" placeholder="Monto"
                      value={abonoAmount}
                      onChange={(e) => setAbonoAmount(e.target.value)}
                      className={`${inputCls} w-36`}
                      autoFocus
                    />
                    <select value={abonoMethod} onChange={(e) => setAbonoMethod(e.target.value as PaymentMethod)} className={`${inputCls} w-40`}>
                      {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
                        <option key={m} value={m}>{paymentMethodLabels[m]}</option>
                      ))}
                    </select>
                    <button onClick={() => submitAbono(loan)} disabled={saving} className={primaryBtnCls}>
                      {saving ? "Guardando..." : "Confirmar abono"}
                    </button>
                  </div>
                </div>
              )}

              {active === "cambio" && (
                <div className="border-t border-slate-800 pt-2 space-y-2">
                  <p className="text-xs text-slate-400">
                    Escanea o escribe el código de la mercancía nueva; reemplaza a la actual y el saldo se recalcula.
                  </p>
                  <ProductLinesEditor
                    products={products}
                    lines={exchangeLines}
                    onChange={setExchangeLines}
                    availability={(productId) => stockOf(branchId, productId)}
                    showDiscount={false}
                  />
                  <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                    <span>Nuevo total: <span className="text-white font-semibold">{formatMoney(newTotal)}</span></span>
                    <span>Ya pagado/abonado: <span className="text-emerald-400">{formatMoney(paymentsAtSale + abonado)}</span></span>
                    <span>
                      Nuevo saldo:{" "}
                      <span className="text-yellow-400 font-semibold">{formatMoney(estimatedPending)}</span>
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => submitCambio(loan)} disabled={saving} className={primaryBtnCls}>
                      {saving ? "Guardando..." : "Confirmar cambio"}
                    </button>
                    <button onClick={() => setAction(null)} className={secondaryBtnCls}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!readOnly && (
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <p className="text-sm font-medium text-slate-400">Abono general</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number" min="0" step="0.01" placeholder="Monto"
              value={globalAmount}
              onChange={(e) => setGlobalAmount(e.target.value)}
              className={`${inputCls} w-36`}
            />
            <select value={globalMethod} onChange={(e) => setGlobalMethod(e.target.value as PaymentMethod)} className={`${inputCls} w-40`}>
              {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{paymentMethodLabels[m]}</option>
              ))}
            </select>
            <button onClick={submitGlobalAbono} disabled={saving} className={primaryBtnCls}>
              {saving ? "Registrando..." : "Abonar"}
            </button>
          </div>
          {debt.loans.length > 1 && (
            <p className="text-xs text-slate-500">
              El abono general se aplica primero a los préstamos más antiguos.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
