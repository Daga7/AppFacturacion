import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

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

const methodLabels: Record<string, string> = { CASH: "Efectivo", NEQUI: "Nequi", BANCOLOMBIA: "Bancolombia" };

export default function Informes() {
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProducts | null>(null);
  const [invStatus, setInvStatus] = useState<InventoryStatus | null>(null);
  const [paySummary, setPaySummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const [ss, tp, inv, pay] = await Promise.all([
        api.get<SalesSummary>("/reports/sales-summary?days=30"),
        api.get<TopProducts>("/reports/top-products?days=30&limit=5"),
        api.get<InventoryStatus>("/reports/inventory-status"),
        api.get<PaymentSummary>("/reports/payment-summary?days=30"),
      ]);
      setSalesSummary(ss);
      setTopProducts(tp);
      setInvStatus(inv);
      setPaySummary(pay);
    } catch { setError("Error al cargar informes"); }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports();
  }, [loadReports]);

  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Informes</h2>
        <p className="text-slate-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Informes</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline">Cerrar</button>
        </div>
      )}

      {salesSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-sm text-slate-400 mb-1">Ventas totales</p>
            <p className="text-3xl font-bold text-white">{salesSummary.summary.totalSales}</p>
            <p className="text-xs text-slate-500 mt-1">últimos {salesSummary.period.days} días</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-sm text-slate-400 mb-1">Ingresos totales</p>
            <p className="text-3xl font-bold text-emerald-400">${salesSummary.summary.totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">últimos {salesSummary.period.days} días</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-sm text-slate-400 mb-1">Ticket promedio</p>
            <p className="text-3xl font-bold text-blue-400">${salesSummary.summary.avgTicket.toLocaleString()}</p>
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
                    <p className="text-sm text-white font-medium">${p.total.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{p.quantity} uds.</p>
                  </div>
                </div>
              ))}
              {topProducts.top.length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
            </div>
          </div>
        )}

        {paySummary && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Métodos de pago</h3>
            <div className="space-y-3">
              {Object.entries(paySummary.byMethod).map(([method, data]) => (
                <div key={method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">{methodLabels[method] ?? method}</span>
                    <span className="text-white font-medium">${data.total.toLocaleString()} ({data.share}%)</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div className="bg-brand h-2 rounded-full" style={{ width: `${data.share}%` }} />
                  </div>
                </div>
              ))}
              {Object.keys(paySummary.byMethod).length === 0 && <p className="text-sm text-slate-500">Sin datos</p>}
            </div>
            <p className="text-xs text-slate-500 mt-4">Total: ${paySummary.grandTotal.toLocaleString()}</p>
          </div>
        )}

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
                    <span className="text-white font-medium">${data.total.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
