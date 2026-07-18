import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import type { BranchInfo, Product, Sale } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { SalesList } from "./SalesList";
import { SaleDetailModal } from "./SaleDetailModal";

interface SalesHistoryProps {
  branch: BranchInfo | null;
  products: Product[];
  availability: (productId: string) => number;
  onError: (message: string) => void;
}

const monthLabel = (d: Date) =>
  d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

// "Ventas realizadas" (admin) de la sede elegida en el selector superior:
// mes → días con ventas → ventas del día → detalle editable.
export function SalesHistory({ branch, products, availability, onError }: SalesHistoryProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const loadSales = useCallback(async () => {
    if (!branch) return;
    setLoading(true);
    try {
      const from = month.toISOString();
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      const data = await api.get<Sale[]>(
        `/sales?branchId=${branch.id}&from=${from}&to=${to}&limit=500`,
      );
      setSales(data);
    } catch {
      onError("Error al cargar las ventas del mes");
    }
    setLoading(false);
  }, [branch, month, onError]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadSales();
  }, [loadSales]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!branch) return <EmptyState message="Selecciona una sede en el selector superior" />;

  // Agrupar por día (clave YYYY-MM-DD en hora local), de más reciente a más antiguo.
  const byDay = new Map<string, Sale[]>();
  for (const s of sales) {
    const d = new Date(s.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  const changeMonth = (delta: number) => {
    setExpandedDay(null);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-white">Ventas en {branch.name}</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="px-2 py-1 text-slate-400 hover:text-white" aria-label="Mes anterior">‹</button>
          <span className="text-sm text-white font-medium capitalize w-40 text-center">{monthLabel(month)}</span>
          <button onClick={() => changeMonth(1)} className="px-2 py-1 text-slate-400 hover:text-white" aria-label="Mes siguiente">›</button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : days.length === 0 ? (
        <EmptyState message={`No hay ventas en ${monthLabel(month)}`} />
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const daySales = byDay.get(day)!;
            const dayTotal = daySales
              .filter((s) => s.status === "COMPLETED")
              .reduce((sum, s) => sum + Number(s.total), 0);
            const expanded = expandedDay === day;
            return (
              <Card key={day} className="overflow-hidden">
                <button
                  onClick={() => setExpandedDay(expanded ? null : day)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-800/40 transition-colors"
                >
                  <div>
                    <p className="text-white font-medium capitalize">{dayLabel(daySales[0].createdAt)}</p>
                    <p className="text-xs text-slate-400">
                      {daySales.length} venta{daySales.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-bold text-white">{formatMoney(dayTotal)}</p>
                    <span className={`text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-slate-800 p-3">
                    <SalesList sales={daySales} onSelect={setSelectedSale} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          isAdmin
          products={products}
          availability={availability}
          onClose={() => setSelectedSale(null)}
          onChanged={loadSales}
        />
      )}
    </div>
  );
}
