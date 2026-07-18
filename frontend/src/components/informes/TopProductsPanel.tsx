import type { TopProducts } from "../../lib/reports";
import { formatMoney } from "../../lib/format";
import { Panel } from "../ui/Panel";

// Ranking de productos más vendidos del período.
export function TopProductsPanel({ data }: { data: TopProducts }) {
  return (
    <Panel title="Productos más vendidos">
      <div className="space-y-3">
        {data.top.map((p, i) => (
          <div key={p.productId} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-500 w-5">{i + 1}</span>
              <span className="text-sm text-white">{p.name}</span>
            </div>
            <div className="text-right">
              <p className="text-sm text-white font-medium">{formatMoney(p.total)}</p>
              <p className="text-xs text-slate-500">{p.quantity} uds.</p>
            </div>
          </div>
        ))}
        {data.top.length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
      </div>
    </Panel>
  );
}
