export interface MetricRow {
  label: string;
  // Un valor por sede, en el orden de las columnas, y al final el total.
  values: string[];
}

interface MetricsTableProps {
  branches: string[];
  rows: MetricRow[];
}

// Indicadores por sede con la forma de la tabla del documento: una fila por
// indicador y una columna por sede más el total.
export function MetricsTable({ branches, rows }: MetricsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-800">
            <th className="pb-2 font-medium text-left">Indicador</th>
            {branches.map((name) => (
              <th key={name} className="pb-2 pl-3 font-medium text-right">{name}</th>
            ))}
            <th className="pb-2 pl-3 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-800/50">
              <td className="py-2 text-slate-300">{row.label}</td>
              {row.values.map((value, i) => (
                <td
                  key={i}
                  className={`py-2 pl-3 text-right tabular-nums whitespace-nowrap ${
                    i === row.values.length - 1 ? "text-white font-semibold" : "text-slate-300"
                  }`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
