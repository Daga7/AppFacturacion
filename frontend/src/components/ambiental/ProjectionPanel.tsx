import { formatMoney } from "../../lib/format";
import {
  branchValues,
  dayLabel,
  equivalences,
  formatDecimal,
  formatSheets,
  type EnvironmentBranch,
  type EnvironmentSummary,
} from "../../lib/environment";
import { Panel } from "../ui/Panel";
import { MetricsTable, type MetricRow } from "./MetricsTable";

// Proyección si las sedes siguen registrando todo en la app: al cierre del
// mes en curso y en un año (línea base × 365 días).
export function ProjectionPanel({ data }: { data: EnvironmentSummary }) {
  const { branches, factors } = data;
  const monthEnd = (b: EnvironmentBranch) => equivalences(b.monthEndSheets, factors);
  const year = (b: EnvironmentBranch) => equivalences(b.yearSheets, factors);
  const closing = dayLabel(data.monthEnd);

  const rows: MetricRow[] = [
    {
      label: `Proyección al ${closing} (hojas)`,
      values: branchValues(branches, (b) => b.monthEndSheets, formatSheets),
    },
    {
      label: "Proyección en cuadernos",
      values: branchValues(branches, (b) => monthEnd(b).notebooks, formatDecimal),
    },
    {
      label: "Proyección en resmas",
      values: branchValues(branches, (b) => monthEnd(b).reams, formatDecimal),
    },
    {
      label: "Proyección anual (hojas, 365 días)",
      values: branchValues(branches, (b) => b.yearSheets, formatSheets),
    },
    {
      label: "Anual en cuadernos",
      values: branchValues(branches, (b) => year(b).notebooks, formatDecimal),
    },
    {
      label: "Anual en resmas",
      values: branchValues(branches, (b) => year(b).reams, formatDecimal),
    },
    {
      label: "CO₂e evitado al año (kg)",
      values: branchValues(branches, (b) => year(b).co2eKg, formatDecimal),
    },
    {
      label: "Ahorro anual en papel",
      values: branchValues(branches, (b) => year(b).savings, formatMoney),
    },
  ];

  return (
    <Panel title="Proyección">
      <MetricsTable branches={branches.map((b) => b.name)} rows={rows} />
    </Panel>
  );
}
