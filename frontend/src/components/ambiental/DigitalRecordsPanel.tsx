import { formatSheets, type EnvironmentSummary } from "../../lib/environment";
import { Panel } from "../ui/Panel";

// Registros del período que antes se anotaban en papel (facturas, cuadernos
// de abonos, planillas de inventario y de cierre) y ahora quedan en la app.
export function DigitalRecordsPanel({ data }: { data: EnvironmentSummary }) {
  const { records } = data;
  const rows = [
    { label: "Facturas de venta", count: records.sales },
    { label: "Abonos a préstamos", count: records.loanPayments },
    { label: "Movimientos de inventario", count: records.inventoryMovements },
    { label: "Cierres de caja", count: records.cashCloses },
    { label: "Traslados, pedidos especiales y garantías", count: records.requests },
  ];
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Panel title="Operaciones registradas sin papel">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="pb-2 font-medium">Registro digital</th>
            <th className="pb-2 font-medium text-right">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-slate-800/50">
              <td className="py-2 text-slate-300">{r.label}</td>
              <td className="py-2 text-right text-slate-300 tabular-nums">{formatSheets(r.count)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-700">
            <td className="pt-3 text-white font-semibold">Total</td>
            <td className="pt-3 text-right text-white font-semibold tabular-nums">{formatSheets(total)}</td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}
