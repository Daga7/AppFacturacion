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
  const [profit, setProfit] = useState<ProfitSummary | null>(null);
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
        const [g, pf] = await Promise.all([
          api.get<GeneralSummary>(`/reports/general-summary?days=${DAYS}`),
          api.get<ProfitSummary>(`/reports/profit-summary?days=${DAYS}`),
        ]);
        setGeneral(g);
        setProfit(pf);
      } else {
        const q = `branchId=${scope}&days=${DAYS}`;
        const [ss, tp, inv, pay, pf] = await Promise.all([
          api.get<SalesSummary>(`/reports/sales-summary?${q}`),
          api.get<TopProducts>(`/reports/top-products?${q}&limit=5`),
          api.get<InventoryStatus>(`/reports/inventory-status?branchId=${scope}`),
          api.get<PaymentSummary>(`/reports/payment-summary?${q}`),
          api.get<ProfitSummary>(`/reports/profit-summary?${q}`),
        ]);
        setSalesSummary(ss);
        setTopProducts(tp);
        setInvStatus(inv);
        setPaySummary(pay);
        setProfit(pf);
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
                hint={`últimos ${general.period.days} días · ambas sedes`}
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
                hint="venta menos costo de compra"
                tone="info"
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PaymentMethodsPanel byMethod={general.byMethod} grandTotal={general.grandTotalPayments} />
              <BranchBreakdownPanel byBranch={general.byBranch} />
              {profit && <ProfitPanel data={profit} showBranch />}
            </div>
          </div>
        )
      ) : (
        <div>
          {salesSummary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <StatCard
                label="Ventas totales"
                value={salesSummary.summary.totalSales}
                hint={`últimos ${salesSummary.period.days} días`}
              />
              <StatCard
                label="Ingresos totales"
                value={formatMoney(salesSummary.summary.totalRevenue)}
                hint={`últimos ${salesSummary.period.days} días`}
                tone="success"
              />
              <StatCard
                label="Ticket promedio"
                value={formatMoney(salesSummary.summary.avgTicket)}
                hint="por venta"
                tone="info"
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {topProducts && <TopProductsPanel data={topProducts} />}
            {paySummary && <PaymentMethodsPanel byMethod={paySummary.byMethod} grandTotal={paySummary.grandTotal} />}
            {profit && <ProfitPanel data={profit} />}
            {invStatus && <InventoryStatusPanel data={invStatus} />}
            {salesSummary && <SalesByDayPanel byDay={salesSummary.byDay} />}
          </div>
        </div>
      )}
    </div>
  );
}
