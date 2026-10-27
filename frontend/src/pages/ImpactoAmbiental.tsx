import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import {
  dayLabel,
  equivalences,
  formatDecimal,
  formatSheets,
  type EnvironmentPeriod,
  type EnvironmentSummary,
} from "../lib/environment";
import { PageHeader } from "../components/ui/PageHeader";
import { TabPills } from "../components/ui/TabPills";
import { StatCard } from "../components/ui/StatCard";
import { Alert } from "../components/ui/Alert";
import { SheetsChartPanel } from "../components/ambiental/SheetsChartPanel";
import { BranchSheetsPanel } from "../components/ambiental/BranchSheetsPanel";
import { ProjectionPanel } from "../components/ambiental/ProjectionPanel";
import { DigitalRecordsPanel } from "../components/ambiental/DigitalRecordsPanel";

const PERIODS: { key: EnvironmentPeriod; label: string }[] = [
  { key: "month", label: "Este mes" },
  { key: "total", label: "Acumulado" },
];

// Impacto ambiental: papel que las sedes dejan de usar al registrar sus
// operaciones en la app (hojas, cuadernos, resmas, CO2e y ahorro).
export default function ImpactoAmbiental() {
  const [period, setPeriod] = useState<EnvironmentPeriod>("month");
  const [data, setData] = useState<EnvironmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<EnvironmentSummary>(`/environment/summary?period=${period}`));
    } catch { setError("Error al cargar el impacto ambiental"); }
    setLoading(false);
  }, [period]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sheets = data?.branches.reduce((sum, b) => sum + b.sheets, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="🌱 Impacto ambiental"
        subtitle="Papel que se deja de usar al registrar las operaciones en la aplicación"
      >
        <TabPills tabs={PERIODS} active={period} onChange={setPeriod} size="sm" />
      </PageHeader>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}

      {!data ? (
        loading && <p className="text-slate-400">Cargando...</p>
      ) : (
        // Al cambiar de período se conserva lo anterior atenuado mientras carga.
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Hojas de papel evitadas"
              value={formatSheets(sheets)}
              hint={
                data.period === "month"
                  ? `${dayLabel(data.from)} – ${dayLabel(data.asOf)} · ambas sedes`
                  : `desde la implementación (${dayLabel(data.pilotStart)})`
              }
              tone="success"
            />
            <StatCard
              label="Cuadernos equivalentes"
              value={formatDecimal(equivalences(sheets, data.factors).notebooks)}
              hint={`de ${data.factors.sheetsPerNotebook} hojas`}
            />
            <StatCard
              label="Resmas equivalentes"
              value={formatDecimal(equivalences(sheets, data.factors).reams)}
              hint={`de ${data.factors.sheetsPerReam} hojas`}
            />
            <StatCard
              label="CO₂e evitado"
              value={`${formatDecimal(equivalences(sheets, data.factors).co2eKg)} kg`}
              hint={`${formatDecimal(data.factors.co2eKgPerSheet * 1000)} g por hoja`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SheetsChartPanel data={data} />
            <BranchSheetsPanel data={data} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProjectionPanel data={data} />
            <DigitalRecordsPanel data={data} />
          </div>

          <p className="text-xs text-slate-500 mt-6">
            Hojas evitadas = consumo diario de papel de cada sede antes de la app
            (diagnóstico ambiental) × días en que la sede registró ventas o abrió caja
            en la app. Equivalencias: 1 cuaderno = {data.factors.sheetsPerNotebook} hojas ·
            1 resma = {data.factors.sheetsPerReam} hojas ·{" "}
            {formatDecimal(data.factors.co2eKgPerSheet * 1000)} g de CO₂e por hoja ·{" "}
            {formatMoney(data.factors.costPerSheet)} por hoja.
          </p>
        </div>
      )}
    </div>
  );
}
