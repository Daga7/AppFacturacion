import { useState } from "react";
import { api } from "../../lib/api";
import type { CashSummary, DiscountDetail } from "../../lib/types";
import { formatMoney, formatDateTime, formatTime, invoiceCode } from "../../lib/format";
import { ghostBtnCls } from "../ui/inputs";

// Resumen del cierre de caja: base, ventas, medios de pago, préstamos,
// descuentos, y efectivo esperado vs contado. El detalle de descuentos se
// carga bajo demanda.
export function CashSummaryView({ summary }: { summary: CashSummary }) {
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [discounts, setDiscounts] = useState<DiscountDetail[] | null>(null);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = summary;
  const diff = s.difference ?? 0;

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
        {row(`Ventas del día (${s.salesCount})`, formatMoney(s.totalSales))}
        {row("Recibido en efectivo", formatMoney(s.cashReceived), "text-emerald-400")}
        {row(
          `Recibido por transferencias (Nequi ${formatMoney(s.nequiReceived)} · Bancolombia ${formatMoney(s.bancolombiaReceived)})`,
          formatMoney(s.transferReceived),
          "text-blue-400",
        )}
        {row(`Préstamos realizados (${s.loans.count})`, formatMoney(s.loans.total), "text-yellow-400")}
        {row(`Descuentos aplicados (${s.discounts.count})`, formatMoney(s.discounts.total), "text-yellow-400")}
        {s.specialOrders.count > 0 &&
          row(
            `Pedidos especiales (${s.specialOrders.count} · efectivo ${formatMoney(s.specialOrders.cash)})`,
            formatMoney(s.specialOrders.total),
            "text-emerald-400",
          )}
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-slate-300">
            Efectivo esperado (base + efectivo recibido
            {s.specialOrders.cash > 0 ? " + pedidos especiales" : ""})
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
