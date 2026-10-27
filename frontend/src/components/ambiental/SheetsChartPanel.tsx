import { useState } from "react";
import {
  dayLabel,
  formatSheets,
  monthLabel,
  type EnvironmentSummary,
} from "../../lib/environment";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

interface Bar {
  key: string;
  // Parte registrada y parte proyectada (los días del mes que aún no llegan).
  recorded: number;
  projected: number;
  axisLabel: string;
  title: string;
  detail?: string;
}

// Mes en curso: hojas acumuladas día a día (los días que faltan, proyectados).
// Acumulado: hojas de cada mes, con lo que falta del mes en curso encima.
function buildBars(data: EnvironmentSummary): Bar[] {
  if (data.period === "month") {
    const last = data.series.length;
    let recorded = 0;
    let projected = 0;
    return data.series.map((p) => {
      recorded += p.sheets;
      projected += p.projected;
      const day = Number(p.key.slice(8));
      const axisLabel =
        day === 1 || day === last || (day % 5 === 0 && day <= last - 3) ? String(day) : "";
      if (p.projected > 0) {
        return {
          key: p.key,
          recorded: 0,
          projected: recorded + projected,
          axisLabel,
          title: `${dayLabel(p.key)} · proyección`,
        };
      }
      return {
        key: p.key,
        recorded,
        projected: 0,
        axisLabel,
        title: dayLabel(p.key),
        detail: p.sheets > 0 ? `+${formatSheets(p.sheets)} ese día` : "Sin operación ese día",
      };
    });
  }
  return data.series.map((p) => ({
    key: p.key,
    recorded: p.sheets,
    projected: p.projected,
    axisLabel: monthLabel(p.key).split(" ")[0],
    title: monthLabel(p.key),
    detail: p.projected > 0 ? `+${formatSheets(p.projected)} proyectadas al cierre` : undefined,
  }));
}

// Eje Y con pasos redondos (1, 2 o 5 × 10ⁿ) y aire arriba para la etiqueta.
function niceTicks(max: number) {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  const top = Math.ceil((max * 1.15) / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

export function SheetsChartPanel({ data }: { data: EnvironmentSummary }) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const bars = buildBars(data);
  const totals = bars.map((b) => b.recorded + b.projected);
  const max = Math.max(0, ...totals);
  const hasProjection = bars.some((b) => b.projected > 0);
  const daily = data.period === "month";

  // Etiqueta solo en lo que cuenta la historia: hoy y el cierre del mes (o
  // cada mes, si son pocos).
  const labeled = new Set<number>();
  if (daily) {
    labeled.add(bars.findLastIndex((b) => b.recorded > 0));
    if (hasProjection) labeled.add(bars.length - 1);
  } else {
    bars.forEach((_, i) => {
      if (bars.length <= 6 || i === bars.length - 1) labeled.add(i);
    });
  }

  const ticks = max > 0 ? niceTicks(max) : [0];
  const top = ticks[ticks.length - 1];
  const tip = active !== null ? bars[active] : null;
  const tipPos = active !== null ? (active + 0.5) / bars.length : 0;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-white">
          {daily ? "Hojas evitadas en el mes" : "Hojas evitadas por mes"}
        </h3>
        {max > 0 && (
          <button
            onClick={() => setShowTable(!showTable)}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            {showTable ? "Ver gráfico" : "Ver tabla"}
          </button>
        )}
      </div>

      {max === 0 ? (
        <EmptyState message="Sin operaciones registradas en el período" />
      ) : showTable ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="pb-2 font-medium">{daily ? "Día" : "Mes"}</th>
                <th className="pb-2 font-medium text-right">{daily ? "Acumulado" : "Registradas"}</th>
                <th className="pb-2 font-medium text-right">Proyección</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key} className="border-b border-slate-800/50">
                  <td className="py-1.5 text-slate-300">{daily ? dayLabel(b.key) : b.title}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">
                    {daily && b.projected > 0 ? "—" : formatSheets(b.recorded)}
                  </td>
                  <td className="py-1.5 text-right text-slate-400 tabular-nums">
                    {b.projected > 0 ? formatSheets(b.projected) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <div className="relative h-64 ml-9">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-slate-800"
                style={{ bottom: `${(t / top) * 100}%` }}
              >
                <span className="absolute -left-9 w-7 -translate-y-1/2 text-right text-[10px] text-slate-500 tabular-nums">
                  {formatSheets(t)}
                </span>
              </div>
            ))}

            <div className="absolute inset-0 flex items-end">
              {bars.map((b, i) => (
                <div
                  key={b.key}
                  tabIndex={0}
                  aria-label={[b.title, `${formatSheets(totals[i])} hojas`, b.detail].filter(Boolean).join(", ")}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="flex-1 h-full flex flex-col justify-end items-center px-px rounded-sm focus:outline-none focus-visible:bg-slate-800/60"
                >
                  {labeled.has(i) && (
                    <span className="shrink-0 mb-1 text-xs font-medium text-slate-200 tabular-nums">
                      {formatSheets(totals[i])}
                    </span>
                  )}
                  {b.projected > 0 && (
                    <div
                      className={`shrink-0 w-full max-w-6 rounded-t bg-emerald-700 ${b.recorded > 0 ? "mb-0.5" : ""} ${
                        active === i ? "brightness-125" : ""
                      }`}
                      style={{ height: `${(b.projected / top) * 100}%` }}
                    />
                  )}
                  {b.recorded > 0 && (
                    <div
                      className={`shrink-0 w-full max-w-6 bg-emerald-500 ${b.projected > 0 ? "" : "rounded-t"} ${
                        active === i ? "brightness-125" : ""
                      }`}
                      style={{ height: `${(b.recorded / top) * 100}%` }}
                    />
                  )}
                </div>
              ))}
            </div>

            {tip && (
              <div
                className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-lg whitespace-nowrap"
                style={{
                  left: `${tipPos * 100}%`,
                  transform: `translateX(${tipPos < 0.2 ? "0" : tipPos > 0.8 ? "-100%" : "-50%"})`,
                }}
              >
                <p className="flex items-center gap-1.5 text-sm font-semibold text-white tabular-nums">
                  <span
                    className={`inline-block w-3 h-0.5 rounded ${tip.recorded > 0 ? "bg-emerald-500" : "bg-emerald-700"}`}
                  />
                  {formatSheets(tip.recorded + tip.projected)} hojas
                </p>
                <p className="text-slate-400 mt-0.5">{tip.title}</p>
                {tip.detail && <p className="text-slate-500">{tip.detail}</p>}
              </div>
            )}
          </div>

          <div className="flex ml-9 mt-1.5">
            {bars.map((b) => (
              <div key={b.key} className="flex-1 text-center text-[10px] text-slate-500 tabular-nums">
                {b.axisLabel}
              </div>
            ))}
          </div>

          {hasProjection && (
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                Registrado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-700" />
                Proyección al {dayLabel(data.monthEnd)}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
