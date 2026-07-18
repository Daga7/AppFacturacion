import { formatMoney } from "../../lib/format";
import { Panel } from "../ui/Panel";

interface SalesByDayPanelProps {
  byDay: Record<string, { count: number; total: number }>;
}

// Ventas agrupadas por día, de la más reciente a la más antigua.
export function SalesByDayPanel({ byDay }: SalesByDayPanelProps) {
  const days = Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a));
  return (
    <Panel title="Ventas por día">
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {days.map(([day, data]) => (
          <div key={day} className="flex justify-between text-sm">
            <span className="text-slate-400">{day}</span>
            <span className="text-slate-300">{data.count} ventas</span>
            <span className="text-white font-medium">{formatMoney(data.total)}</span>
          </div>
        ))}
        {days.length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
      </div>
    </Panel>
  );
}
