import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useBranchStore } from "../stores/branch";
import type { BranchInfo } from "../lib/types";
import type {
  SalesSummary,
  TopProducts,
  InventoryStatus,
  PaymentSummary,
  GeneralSummary,
  ProfitSummary,
  ProfitTotal,
} from "../lib/reports";
import { formatMoney } from "../lib/format";
import { BranchSelector } from "../components/BranchSelector";
import { Alert } from "../components/ui/Alert";
import { StatCard } from "../components/ui/StatCard";
import { PaymentMethodsPanel } from "../components/informes/PaymentMethodsPanel";
import { TopProductsPanel } from "../components/informes/TopProductsPanel";
import { InventoryStatusPanel } from "../components/informes/InventoryStatusPanel";
import { SalesByDayPanel } from "../components/informes/SalesByDayPanel";
import { BranchBreakdownPanel } from "../components/informes/BranchBreakdownPanel";
import { ProfitPanel } from "../components/informes/ProfitPanel";

const GENERAL = "general";
const DAYS = 30;

// Nota de las tarjetas de ventas: los montos ya vienen sin lo devuelto.
const refundHint = (base: string, refunded: number) =>
  refunded > 0 ? `${base} · ya descuenta ${formatMoney(refunded)} devueltos` : base;

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
  const [profitTotal, setProfitTotal] = useState<ProfitTotal | null>(null);
  const [general, setGeneral] = useState<GeneralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // La tabla de ganancias se carga solo al hacer clic en la tarjeta, porque
  // trae una fila por venta y puede ser pesada.
  const [showProfitTable, setShowProfitTable] = useState(false);
  const [profitDetail, setProfitDetail] = useState<ProfitSummary | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);

  const loadBranches = useCallback(async () => {
    try {
      setBranches(await api.get<BranchInfo[]>("/branches"));
    } catch { setError("Error al cargar sucursales"); }
  }, []);

  const loadReports = useCallback(async () => {
    if (!scope) return;
    setLoading(true);
    setShowProfitTable(false);
    setProfitDetail(null);
    try {
      if (scope === GENERAL) {
        setGeneral(await api.get<GeneralSummary>(`/reports/general-summary?days=${DAYS}`));
      } else {
        const q = `branchId=${scope}&days=${DAYS}`;
        const [ss, tp, inv, pay, pt] = await Promise.all([
          api.get<SalesSummary>(`/reports/sales-summary?${q}`),
          api.get<TopProducts>(`/reports/top-products?${q}&limit=5`),
          api.get<InventoryStatus>(`/reports/inventory-status?branchId=${scope}`),
          api.get<PaymentSummary>(`/reports/payment-summary?${q}`),
          api.get<ProfitTotal>(`/reports/profit-total?${q}`),
        ]);
        setSalesSummary(ss);
        setTopProducts(tp);
        setInvStatus(inv);
        setPaySummary(pay);
        setProfitTotal(pt);
      }
    } catch { setError("Error al cargar informes"); }
    setLoading(false);
  }, [scope]);

  // Clic en la tarjeta de Ganancias: alterna la tabla y la carga la primera vez.
  const toggleProfitTable = async () => {
    if (showProfitTable) { setShowProfitTable(false); return; }
    setShowProfitTable(true);
    if (profitDetail) return;
    setProfitLoading(true);
    try {
      const q = scope === GENERAL ? `days=${DAYS}` : `branchId=${scope}&days=${DAYS}`;
      setProfitDetail(await api.get<ProfitSummary>(`/reports/profit-summary?${q}`));
    } catch { setError("Error al cargar el detalle de ganancias"); }
    setProfitLoading(false);
  };

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
              <StatCard
                label="Ventas en total"
                value={formatMoney(general.summary.totalRevenue)}
                hint={refundHint(`últimos ${general.period.days} días · ambas sedes`, general.summary.refunded)}
                tone="success"
              />
              <StatCard
                label="Tickets en total"
                value={general.summary.totalTickets}
                hint="ventas registradas"
              />
              <StatCard
                label="Ganancias en total"
                value={formatMoney(general.summary.totalProfit)}
                hint={
                  general.specialOrders.count > 0
                    ? `incluye ${formatMoney(general.specialOrders.profit)} de ${general.specialOrders.count} pedido(s) especial(es) · clic para el detalle`
                    : "venta menos costo de compra · clic para ver el detalle"
                }
                tone="info"
                onClick={toggleProfitTable}
              />
            </div>

            {showProfitTable && (
              <div className="mb-8">
                {profitLoading ? (
                  <p className="text-slate-400">Cargando detalle de ganancias...</p>
                ) : (
                  profitDetail && <ProfitPanel data={profitDetail} showBranch />
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PaymentMethodsPanel byMethod={general.byMethod} grandTotal={general.grandTotalPayments} />
              <BranchBreakdownPanel byBranch={general.byBranch} />
            </div>
          </div>
        )
      ) : (
        <div>
          {salesSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Ventas totales"
                value={salesSummary.summary.totalSales}
                hint={`últimos ${salesSummary.period.days} días`}
              />
              <StatCard
                label="Ingresos totales"
                value={formatMoney(salesSummary.summary.totalRevenue)}
                hint={refundHint(`últimos ${salesSummary.period.days} días`, salesSummary.summary.refunded)}
                tone="success"
              />
              <StatCard
                label="Ticket promedio"
                value={formatMoney(salesSummary.summary.avgTicket)}
                hint="por venta"
                tone="info"
              />
              {profitTotal && (
                <StatCard
                  label="Ganancias"
                  value={formatMoney(profitTotal.profit)}
                  hint="clic para ver el detalle"
                  tone="success"
                  onClick={toggleProfitTable}
                />
              )}
            </div>
          )}

          {showProfitTable && (
            <div className="mb-8">
              {profitLoading ? (
                <p className="text-slate-400">Cargando detalle de ganancias...</p>
              ) : (
                profitDetail && <ProfitPanel data={profitDetail} />
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {topProducts && <TopProductsPanel data={topProducts} />}
            {paySummary && <PaymentMethodsPanel byMethod={paySummary.byMethod} grandTotal={paySummary.grandTotal} />}
            {invStatus && <InventoryStatusPanel data={invStatus} />}
            {salesSummary && <SalesByDayPanel byDay={salesSummary.byDay} />}
          </div>
        </div>
      )}
    </div>
  );
}
