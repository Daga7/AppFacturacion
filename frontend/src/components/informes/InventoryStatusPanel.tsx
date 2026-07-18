import type { InventoryStatus } from "../../lib/reports";
import { Panel } from "../ui/Panel";

const tile = (label: string, value: number, cls = "text-white") => (
  <div className="bg-slate-800/50 rounded-lg p-3">
    <p className="text-xs text-slate-400">{label}</p>
    <p className={`text-xl font-bold ${cls}`}>{value}</p>
  </div>
);

// Resumen del inventario de la sede: totales, stock bajo y por categoría.
export function InventoryStatusPanel({ data }: { data: InventoryStatus }) {
  return (
    <Panel title="Estado del inventario">
      <div className="grid grid-cols-2 gap-3 mb-4">
        {tile("Productos", data.summary.totalProducts)}
        {tile("Unidades", data.summary.totalUnits)}
        {tile("Stock bajo", data.summary.lowStock, "text-yellow-400")}
        {tile("Agotados", data.summary.outOfStock, "text-red-400")}
      </div>
      <h4 className="text-xs font-medium text-slate-400 mb-2">Por categoría</h4>
      <div className="space-y-2">
        {Object.entries(data.byCategory).map(([cat, d]) => (
          <div key={cat} className="flex justify-between text-sm">
            <span className="text-slate-300">{cat}</span>
            <span className="text-slate-500">{d.count} prod. / {d.units} uds.</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
