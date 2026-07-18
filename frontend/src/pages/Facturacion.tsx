import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useBranchStore } from "../stores/branch";
import { BranchSelector } from "../components/BranchSelector";
import type { BranchInfo, Customer, Loan, Product, Sale } from "../lib/types";
import { invoiceCode } from "../lib/format";
import { TabPills } from "../components/ui/TabPills";
import { Alert } from "../components/ui/Alert";
import { ghostBtnCls } from "../components/ui/inputs";
import { SaleForm } from "../components/facturacion/SaleForm";
import { SalesList } from "../components/facturacion/SalesList";
import { SaleDetailModal } from "../components/facturacion/SaleDetailModal";
import { LoanForm } from "../components/facturacion/LoanForm";
import { LoansList } from "../components/facturacion/LoansList";
import { LoanDetailModal } from "../components/facturacion/LoanDetailModal";
import { CustomerForm } from "../components/facturacion/CustomerForm";
import { CustomersList } from "../components/facturacion/CustomersList";
import { PendingCustomersList, type CustomerDebt } from "../components/facturacion/PendingCustomersList";
import { CustomerLoansModal } from "../components/facturacion/CustomerLoansModal";
import { SalesHistory } from "../components/facturacion/SalesHistory";

type Tab = "facturacion" | "prestamos" | "pendientes" | "ventas";

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export default function Facturacion() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const selectedBranchId = useBranchStore((s) => s.branchId);
  const setSelectedBranchId = useBranchStore((s) => s.setBranchId);
  // Sede activa: la elegida en el selector superior, o la del usuario.
  const branchId = selectedBranchId ?? user?.branchId ?? "";

  const [tab, setTab] = useState<Tab>("facturacion");
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  const [showSaleForm, setShowSaleForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<CustomerDebt | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api.get<Product[]>("/products"));
    } catch { setError("Error al cargar productos"); }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      setBranches(await api.get<BranchInfo[]>("/branches"));
    } catch { setError("Error al cargar sucursales"); }
  }, []);

  const loadCustomers = useCallback(async () => {
    if (!branchId) return;
    try {
      setCustomers(await api.get<Customer[]>(`/customers?branchId=${branchId}`));
    } catch { setError("Error al cargar clientes"); }
  }, [branchId]);

  const loadLoans = useCallback(async () => {
    if (!branchId) return;
    try {
      setLoans(await api.get<Loan[]>(`/loans?branchId=${branchId}`));
    } catch { setError("Error al cargar préstamos"); }
  }, [branchId]);

  const loadTodaySales = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      setTodaySales(
        await api.get<Sale[]>(`/sales?branchId=${branchId}&from=${todayStart()}&limit=200`),
      );
    } catch { setError("Error al cargar las ventas de hoy"); }
    setLoading(false);
  }, [branchId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadProducts();
    loadBranches();
  }, [loadProducts, loadBranches]);

  useEffect(() => {
    if (tab === "facturacion") loadTodaySales();
    else if (tab === "prestamos") { loadCustomers(); loadLoans(); }
    else if (tab === "pendientes") loadLoans();
  }, [tab, loadTodaySales, loadCustomers, loadLoans]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Stock disponible de un producto en una sede, según los inventarios que
  // vienen incluidos en /products.
  const stockOf = (forBranchId: string, productId: string) =>
    products
      .find((p) => p.id === productId)
      ?.inventories?.find((i) => i.branchId === forBranchId)?.amount ?? 0;

  const refreshAfterSale = () => {
    loadProducts();
    loadTodaySales();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "facturacion", label: "Facturación" },
    { key: "prestamos", label: "Préstamos" },
    { key: "pendientes", label: "Clientes Pendientes" },
    ...(isAdmin ? [{ key: "ventas" as Tab, label: "Ventas realizadas" }] : []),
  ];

  const activeLoans = loans.filter((l) => l.loanStatus === "ACTIVE");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-white">Facturación</h2>
        <BranchSelector branches={branches} value={branchId} onChange={setSelectedBranchId} />
      </div>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="mb-6">
        <TabPills tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === "facturacion" && (
        <div className="space-y-4">
          {!showSaleForm && (
            <button onClick={() => { setShowSaleForm(true); setSuccess(null); }} className={ghostBtnCls}>
              + Nueva venta
            </button>
          )}

          {showSaleForm && (
            <SaleForm
              branchId={branchId}
              products={products}
              availability={(productId) => stockOf(branchId, productId)}
              onSaved={(sale) => {
                setShowSaleForm(false);
                setSuccess(`Venta ${invoiceCode(sale.invoiceNumber)} registrada`);
                refreshAfterSale();
              }}
              onCancel={() => setShowSaleForm(false)}
            />
          )}

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Ventas de hoy</h3>
            {loading ? (
              <p className="text-slate-400">Cargando...</p>
            ) : (
              <SalesList
                sales={todaySales}
                onSelect={setSelectedSale}
                emptyMessage="Aún no hay ventas hoy"
              />
            )}
          </div>
        </div>
      )}

      {tab === "prestamos" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <LoanForm
              branchId={branchId}
              products={products}
              customers={customers}
              availability={(productId) => stockOf(branchId, productId)}
              onSaved={(sale) => {
                setSuccess(`Préstamo generado (factura ${invoiceCode(sale.invoiceNumber)})`);
                loadProducts();
                loadLoans();
              }}
            />
            <CustomerForm
              branchId={branchId}
              onSaved={(c) => {
                setSuccess(`Cliente ${c.firstName} creado`);
                loadCustomers();
              }}
            />
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Clientes registrados</h3>
            <CustomersList customers={customers} />
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Préstamos generados</h3>
            <LoansList loans={loans} onSelect={setSelectedLoan} />
          </div>
        </div>
      )}

      {tab === "pendientes" && (
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">Clientes con préstamos activos</h3>
          <PendingCustomersList loans={activeLoans} onSelect={setSelectedDebt} />
        </div>
      )}

      {tab === "ventas" && isAdmin && (
        <SalesHistory
          branch={branches.find((b) => b.id === branchId) ?? null}
          products={products}
          availability={(productId) => stockOf(branchId, productId)}
          onError={setError}
        />
      )}

      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          isAdmin={isAdmin}
          products={products}
          availability={(productId) => stockOf(branchId, productId)}
          onClose={() => setSelectedSale(null)}
          onChanged={refreshAfterSale}
        />
      )}

      {selectedLoan && (
        <LoanDetailModal
          loan={selectedLoan}
          onClose={() => setSelectedLoan(null)}
          onChanged={() => {
            setSuccess("Abono registrado");
            loadLoans();
          }}
        />
      )}

      {selectedDebt && (
        <CustomerLoansModal
          debt={selectedDebt}
          onClose={() => setSelectedDebt(null)}
          onChanged={() => {
            setSuccess("Abono registrado");
            loadLoans();
          }}
        />
      )}
    </div>
  );
}
