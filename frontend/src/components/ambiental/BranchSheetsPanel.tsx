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

// Cálculo por sede: línea base × días con operación = hojas evitadas, y sus
// equivalencias (cuadernos, resmas, CO2e y ahorro).
export function BranchSheetsPanel({ data }: { data: EnvironmentSummary }) {
  const { branches, factors } = data;
  const eq = (b: EnvironmentBranch) => equivalences(b.sheets, factors);
  const daysInMonth = Number(data.monthEnd.slice(8));
  const days = new Set(branches.map((b) => b.activeDays));
  const range = `${dayLabel(data.from)} – ${dayLabel(data.asOf)}`;

  const rows: MetricRow[] = [
    {
      label: "Consumo promedio diario (hojas)",
      values: branchValues(branches, (b) => b.dailySheets, formatSheets),
    },
    ...(data.period === "month"
      ? [
          {
            label: `Línea base mensual (hojas, ${daysInMonth} días)`,
            values: branchValues(branches, (b) => b.dailySheets * daysInMonth, formatSheets),
          },
        ]
      : []),
    {
      label: `Días con operación (${range})`,
      values: [
        ...branches.map((b) => String(b.activeDays)),
        days.size === 1 ? String([...days][0]) : "—",
      ],
    },
    {
      label: `Hojas evitadas al ${dayLabel(data.asOf)}`,
      values: branchValues(branches, (b) => b.sheets, formatSheets),
    },
    {
      label: `Equivalente en cuadernos (${factors.sheetsPerNotebook} hojas)`,
      values: branchValues(branches, (b) => eq(b).notebooks, formatDecimal),
    },
    {
      label: `Equivalente en resmas (${factors.sheetsPerReam} hojas)`,
      values: branchValues(branches, (b) => eq(b).reams, formatDecimal),
    },
    {
      label: "CO₂e evitado (kg)",
      values: branchValues(branches, (b) => eq(b).co2eKg, formatDecimal),
    },
    {
      label: "Ahorro en papel",
      values: branchValues(branches, (b) => eq(b).savings, formatMoney),
    },
  ];

  return (
    <Panel title="Hojas evitadas por sede">
      <MetricsTable branches={branches.map((b) => b.name)} rows={rows} />
    </Panel>
  );
}
