import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useBranchStore } from "../stores/branch";
import type { BranchInfo } from "../lib/types";
import { paymentMethodLabels } from "../lib/types";
import { formatMoney } from "../lib/format";
import { BranchSelector } from "../components/BranchSelector";
import { Alert } from "../components/ui/Alert";

interface SalesSummary {
  period: { since: string; days: number };
  summary: { totalSales: number; totalRevenue: number; avgTicket: number };
  byDay: Record<string, { count: number; total: number }>;
}
interface TopProduct {
  productId: string; name: string; quantity: number; total: number;
}
interface TopProducts {
  period: { since: string; days: number };
  top: TopProduct[];
}
interface InventoryStatus {
  summary: { totalProducts: number; totalUnits: number; lowStock: number; outOfStock: number };
  byCategory: Record<string, { count: number; units: number }>;
}
interface PaymentSummary {
  period: { since: string; days: number };
  byMethod: Record<string, { count: number; total: number; share: number }>;
  grandTotal: number;
}
interface GeneralSummary {
  period: { since: string; days: number };
  summary: { totalRevenue: number; totalTickets: number; totalProfit: number };
  byMethod: Record<string, { count: number; total: number; share: number }>;
  grandTotalPayments: number;
  byBranch: Record<string, { tickets: number; revenue: number }>;
}

const GENERAL = "general";

export default function Informes() {
  const user = useAuthStore((s) => s.user);
  const selectedBranchId = useBranchStore((s) => s.branchId);
  const setSelectedBranchId = useBranchStore((s) => s.setBranchId);

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  // Alcance del informe: una sede concreta o "general" (todas unidas).
  const [scope, setScope] = useState<string>(selectedBranchId ?? user?.branchId ?? "");

  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProducts | null>(null);
  const [invStatus, setInvStatus] = useState<InventoryStatus | null>(null);
  const [paySummary, setPaySummary] = useState<PaymentSummary | null>(null);
  const [general, setGeneral] = useState<GeneralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBranches = useCallback(async () => {
    try {
      setBranches(await api.get<BranchInfo[]>("/branches"));
    } catch { setError("Error al cargar sucursales"); }
  }, []);

  const loadReports = useCallback(async () => {
    if (!scope) return;
    setLoading(true);
    try {
      if (scope === GENERAL) {
        setGeneral(await api.get<GeneralSummary>("/reports/general-summary?days=30"));
      } else {
        const q = `branchId=${scope}&days=30`;
        const [ss, tp, inv, pay] = await Promise.all([
          api.get<SalesSummary>(`/reports/sales-summary?${q}`),
          api.get<TopProducts>(`/reports/top-products?${q}&limit=5`),
          api.get<InventoryStatus>(`/reports/inventory-status?branchId=${scope}`),
          api.get<PaymentSummary>(`/reports/payment-summary?${q}`),
        ]);
        setSalesSummary(ss);
        setTopProducts(tp);
        setInvStatus(inv);
        setPaySummary(pay);
      }
    } catch { setError("Error al cargar informes"); }
    setLoading(false);
  }, [scope]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadBranches(); }, [loadBranches]);
  useEffect(() => { loadReports(); }, [loadReports]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleScopeChange = (key: string) => {
    setScope(key);
    // Elegir una sede concreta también actualiza la sede global compartida
    // con Facturación; "General" es solo de Informes.
    if (key !== GENERAL) setSelectedBranchId(key);
  };

  const methodBars = (
    byMethod: Record<string, { count: number; total: number; share: number }>,
    grandTotal: number,
  ) => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Métodos de pago</h3>
      <div className="space-y-3">
        {Object.entries(byMethod).map(([method, data]) => (
          <div key={method}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">{paymentMethodLabels[method as keyof typeof paymentMethodLabels] ?? method}</span>
              <span className="text-white font-medium">{formatMoney(data.total)} ({data.share}%)</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div className="bg-brand h-2 rounded-full" style={{ width: `${data.share}%` }} />
            </div>
          </div>
        ))}
        {Object.keys(byMethod).length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
      </div>
      <p className="text-xs text-slate-500 mt-4">Total: {formatMoney(grandTotal)}</p>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-white">Informes</h2>
        <BranchSelector
          branches={branches}
          value={scope}
          onChange={handleScopeChange}
          extraTabs={[{ key: GENERAL, label: "General" }]}
        />
      </div>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : scope === GENERAL ? (
        general && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Ventas en total</p>
                <p className="text-3xl font-bold text-emerald-400">{formatMoney(general.summary.totalRevenue)}</p>
                <p className="text-xs text-slate-500 mt-1">últimos {general.period.days} días · ambas sedes</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Tickets en total</p>
                <p className="text-3xl font-bold text-white">{general.summary.totalTickets}</p>
                <p className="text-xs text-slate-500 mt-1">ventas registradas</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Ganancias en total</p>
                <p className="text-3xl font-bold text-blue-400">{formatMoney(general.summary.totalProfit)}</p>
                <p className="text-xs text-slate-500 mt-1">venta menos costo de compra</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {methodBars(general.byMethod, general.grandTotalPayments)}

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-4">Por sede</h3>
                <div className="space-y-3">
                  {Object.entries(general.byBranch).map(([name, data]) => (
                    <div key={name} className="flex justify-between text-sm">
                      <span className="text-slate-300">{name}</span>
                      <span className="text-slate-500">{data.tickets} tickets</span>
                      <span className="text-white font-medium">{formatMoney(data.revenue)}</span>
                    </div>
                  ))}
                  {Object.keys(general.byBranch).length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <div>
          {salesSummary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Ventas totales</p>
                <p className="text-3xl font-bold text-white">{salesSummary.summary.totalSales}</p>
                <p className="text-xs text-slate-500 mt-1">últimos {salesSummary.period.days} días</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Ingresos totales</p>
                <p className="text-3xl font-bold text-emerald-400">{formatMoney(salesSummary.summary.totalRevenue)}</p>
                <p className="text-xs text-slate-500 mt-1">últimos {salesSummary.period.days} días</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-sm text-slate-400 mb-1">Ticket promedio</p>
                <p className="text-3xl font-bold text-blue-400">{formatMoney(salesSummary.summary.avgTicket)}</p>
                <p className="text-xs text-slate-500 mt-1">por venta</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {topProducts && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-4">Productos más vendidos</h3>
                <div className="space-y-3">
                  {topProducts.top.map((p, i) => (
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
                  {topProducts.top.length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
                </div>
              </div>
            )}

            {paySummary && methodBars(paySummary.byMethod, paySummary.grandTotal)}

            {invStatus && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-4">Estado del inventario</h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Productos</p>
                    <p className="text-xl font-bold text-white">{invStatus.summary.totalProducts}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Unidades</p>
                    <p className="text-xl font-bold text-white">{invStatus.summary.totalUnits}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Stock bajo</p>
                    <p className="text-xl font-bold text-yellow-400">{invStatus.summary.lowStock}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Agotados</p>
                    <p className="text-xl font-bold text-red-400">{invStatus.summary.outOfStock}</p>
                  </div>
                </div>
                <h4 className="text-xs font-medium text-slate-400 mb-2">Por categoría</h4>
                <div className="space-y-2">
                  {Object.entries(invStatus.byCategory).map(([cat, data]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span className="text-slate-300">{cat}</span>
                      <span className="text-slate-500">{data.count} prod. / {data.units} uds.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {salesSummary && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-4">Ventas por día</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(salesSummary.byDay)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([day, data]) => (
                      <div key={day} className="flex justify-between text-sm">
                        <span className="text-slate-400">{day}</span>
                        <span className="text-slate-300">{data.count} ventas</span>
                        <span className="text-white font-medium">{formatMoney(data.total)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
