import { formatMoney } from "../../lib/format";
import { Panel } from "../ui/Panel";

interface BranchBreakdownPanelProps {
  byBranch: Record<string, { tickets: number; revenue: number }>;
}

// Comparativo rápido entre sedes (vista General).
export function BranchBreakdownPanel({ byBranch }: BranchBreakdownPanelProps) {
  return (
    <Panel title="Por sede">
      <div className="space-y-3">
        {Object.entries(byBranch).map(([name, data]) => (
          <div key={name} className="flex justify-between text-sm">
            <span className="text-slate-300">{name}</span>
            <span className="text-slate-500">{data.tickets} tickets</span>
            <span className="text-white font-medium">{formatMoney(data.revenue)}</span>
          </div>
        ))}
        {Object.keys(byBranch).length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
      </div>
    </Panel>
  );
}
