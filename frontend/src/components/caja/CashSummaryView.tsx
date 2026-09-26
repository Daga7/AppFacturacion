import { useState } from "react";
import { api } from "../../lib/api";
import type { CashSummary, DiscountDetail } from "../../lib/types";
import { paymentMethodLabels } from "../../lib/types";
import { formatMoney, formatDateTime, formatTime, invoiceCode } from "../../lib/format";
import { ghostBtnCls } from "../ui/inputs";

// Resumen del cierre de caja: base, lo recibido por medio de pago (que suma
// las ventas del día, abonos incluidos), préstamos aparte, descuentos,
// devoluciones, y efectivo esperado vs contado. El detalle de descuentos se
// carga bajo demanda.
export function CashSummaryView({ summary }: { summary: CashSummary }) {
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [discounts, setDiscounts] = useState<DiscountDetail[] | null>(null);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = summary;
  const diff = s.difference ?? 0;

  // De dónde salió lo recibido (solo las partes que tuvieron movimiento).
  const breakdown = [
    `${s.salesCount} venta${s.salesCount === 1 ? "" : "s"} ${formatMoney(s.salesReceived)}`,
    ...(s.loanPayments.count > 0 ? [`abonos de clientes ${formatMoney(s.loanPayments.total)}`] : []),
    ...(s.specialOrders.count > 0 ? [`pedidos especiales ${formatMoney(s.specialOrders.total)}`] : []),
  ].join(" · ");

  const toggleDiscounts = async () => {
    if (showDiscounts) { setShowDiscounts(false); return; }
    setShowDiscounts(true);
    if (discounts) return;
    setLoadingDiscounts(true);
    try {
      setDiscounts(await api.get<DiscountDetail[]>(`/cash/${s.session.id}/discounts`));
    } catch { setError("Error al cargar el detalle de descuentos"); }
    setLoadingDiscounts(false);
  };

  const row = (label: string, value: string, cls = "text-white") => (
    <div className="flex justify-between text-sm py-1.5 border-b border-slate-800/60">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium ${cls}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        {s.session.branch.name} · abierta {formatDateTime(s.session.openedAt)}
        {s.session.closedAt ? ` · cerrada ${formatTime(s.session.closedAt)}` : ""}
        {s.session.openedBy ? ` · por ${s.session.openedBy.username}` : ""}
      </p>

      <div>
        {row("Base inicial de efectivo", formatMoney(s.session.openingAmount))}
        {s.session.closingAmount != null &&
          row("Efectivo final contado", formatMoney(s.session.closingAmount))}
        {row("Recibido en efectivo", formatMoney(s.cashReceived), "text-emerald-400")}
        {row(
          `Recibido por transferencias (Nequi ${formatMoney(s.nequiReceived)} · Bancolombia ${formatMoney(s.bancolombiaReceived)})`,
          formatMoney(s.transferReceived),
          "text-blue-400",
        )}
        <div className="py-2 border-b border-slate-800/60">
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-sm text-white font-medium">Ventas del día (efectivo + transferencias)</span>
            <span className="text-lg text-white font-bold">{formatMoney(s.totalSales)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Incluye: {breakdown}</p>
        </div>
        {row(
          `Préstamos realizados (${s.loans.count}) · no se suman a las ventas`,
          formatMoney(s.loans.total),
          "text-yellow-400",
        )}
        {row(`Descuentos aplicados (${s.discounts.count})`, formatMoney(s.discounts.total), "text-yellow-400")}
        {s.returns.count > 0 &&
          row(
            `Devoluciones (${s.returns.count} · efectivo ${formatMoney(s.returns.cash)})`,
            `−${formatMoney(s.returns.total)}`,
            "text-red-400",
          )}
      </div>

      {s.loanPayments.count > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-2">
            Clientes que pagaron mercancía pendiente
          </h4>
          <div className="space-y-2">
            {s.loanPayments.rows.map((r, i) => (
              <div key={i} className="border border-slate-800 rounded-lg p-3 text-sm space-y-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-white font-medium">{r.customerName}</span>
                  <span className="text-emerald-400 font-semibold">{formatMoney(r.amount)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                  <span>{paymentMethodLabels[r.paymentMethod] ?? r.paymentMethod}</span>
                  <span>{formatTime(r.createdAt)}</span>
                  <span className={r.settled ? "text-emerald-400" : "text-yellow-400"}>
                    {r.settled ? "Quedó al día ✓" : `Queda debiendo ${formatMoney(r.pendingAfter)}`}
                  </span>
                </div>
                {r.products && <p className="text-xs text-slate-500">{r.products}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {s.returns.count > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-2">Devoluciones del turno</h4>
          <div className="space-y-2">
            {s.returns.rows.map((r, i) => (
              <div key={i} className="border border-slate-800 rounded-lg p-3 text-sm space-y-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-white font-medium">{r.productName} × {r.quantity}</span>
                  <span className="text-red-400 font-semibold">−{formatMoney(r.amount)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                  <span>{paymentMethodLabels[r.paymentMethod] ?? r.paymentMethod}</span>
                  <span>Venta {invoiceCode(r.invoiceNumber)}</span>
                  <span>Por: {r.user}</span>
                  <span>{formatTime(r.createdAt)}</span>
                </div>
                {r.reason && <p className="text-xs text-slate-500">Motivo: {r.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 rounded-lg p-4 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-slate-300">
            Efectivo esperado (base + efectivo recibido
            {s.returns.cash > 0 ? " − devoluciones en efectivo" : ""})
          </span>
          <span className="text-white font-semibold">{formatMoney(s.expectedCash)}</span>
        </div>
        {s.session.closingAmount != null && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Efectivo recibido (contado por ti)</span>
              <span className="text-white font-semibold">{formatMoney(s.session.closingAmount)}</span>
            </div>
            <div className="flex justify-between text-base border-t border-slate-700 pt-2 mt-1">
              <span className="text-slate-300 font-medium">Diferencia</span>
              <span className={`font-bold ${diff === 0 ? "text-emerald-400" : diff > 0 ? "text-blue-400" : "text-red-400"}`}>
                {diff === 0 ? "Cuadra exacto ✓" : `${diff > 0 ? "Sobran" : "Faltan"} ${formatMoney(Math.abs(diff))}`}
              </span>
            </div>
          </>
        )}
      </div>

      {s.discounts.count > 0 && (
        <button onClick={toggleDiscounts} className={ghostBtnCls}>
          {showDiscounts ? "Ocultar detalles de descuentos" : "Ver detalles de descuentos"}
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {showDiscounts && (
        loadingDiscounts ? (
          <p className="text-slate-400 text-sm">Cargando descuentos...</p>
        ) : (
          discounts && (
            <div className="space-y-2">
              {discounts.map((d, i) => (
                <div key={i} className="border border-slate-800 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-white font-medium">
                      {d.productName} × {d.quantity}
                    </span>
                    <span className="text-yellow-400 font-semibold">−{formatMoney(d.discount)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                    <span>Precio original: <span className="text-slate-300">{formatMoney(d.originalPrice)}</span></span>
                    <span>Con descuento: <span className="text-slate-300">{formatMoney(d.discountedPrice)}</span></span>
                    <span>{invoiceCode(d.invoiceNumber)}</span>
                    <span>Por: {d.user}</span>
                    <span>{formatTime(d.createdAt)}</span>
                  </div>
                  {d.reason && <p className="text-xs text-slate-500">Motivo: {d.reason}</p>}
                </div>
              ))}
            </div>
          )
        )
      )}
    </div>
  );
}
