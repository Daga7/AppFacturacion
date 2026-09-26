import type { ProfitSummary } from "../../lib/reports";
import { formatMoney, formatDate, invoiceCode } from "../../lib/format";
import { Panel } from "../ui/Panel";

interface ProfitPanelProps {
  data: ProfitSummary;
  showBranch?: boolean;
}

// Tabla de ganancias: por cada venta, el total cobrado (sin lo devuelto)
// menos lo que costaron los productos que se quedó el cliente; al final la
// suma general.
export function ProfitPanel({ data, showBranch = false }: ProfitPanelProps) {
  return (
    <Panel title="Ganancias" className="lg:col-span-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="pb-2 font-medium">Factura</th>
              <th className="pb-2 font-medium">Fecha</th>
              {showBranch && <th className="pb-2 font-medium">Sede</th>}
              <th className="pb-2 font-medium text-right">Venta</th>
              <th className="pb-2 font-medium text-right">Costo</th>
              <th className="pb-2 font-medium text-right">Ganancia</th>
            </tr>
          </thead>
          <tbody className="max-h-64">
            {data.rows.map((r) => (
              <tr key={r.saleId} className="border-b border-slate-800/50">
                <td className="py-2 text-white font-medium">{invoiceCode(r.invoiceNumber)}</td>
                <td className="py-2 text-slate-400">{formatDate(r.createdAt)}</td>
                {showBranch && <td className="py-2 text-slate-400">{r.branch}</td>}
                <td className="py-2 text-right text-slate-300">
                  {formatMoney(r.total)}
                  {r.returned > 0 && (
                    <span className="block text-xs text-red-400">devolución −{formatMoney(r.returned)}</span>
                  )}
                </td>
                <td className="py-2 text-right text-slate-400">{formatMoney(r.cost)}</td>
                <td className={`py-2 text-right font-semibold ${r.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatMoney(r.profit)}
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={showBranch ? 6 : 5} className="py-6 text-center text-slate-500">
                  Sin ventas en el período
                </td>
              </tr>
            )}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td colSpan={showBranch ? 3 : 2} className="pt-3 text-white font-semibold">
                  Total general
                </td>
                <td className="pt-3 text-right text-white font-semibold">{formatMoney(data.totals.revenue)}</td>
                <td className="pt-3 text-right text-slate-400 font-semibold">{formatMoney(data.totals.cost)}</td>
                <td className={`pt-3 text-right font-bold text-lg ${data.totals.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatMoney(data.totals.profit)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Panel>
  );
}
