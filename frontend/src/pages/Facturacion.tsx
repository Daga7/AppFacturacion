import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, OfflineError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useBranchStore } from "../stores/branch";
import { BranchSelector } from "../components/BranchSelector";
import { Card } from "../components/ui/Card";
import type { BranchInfo, CashSession, Customer, Loan, Product, Sale } from "../lib/types";
import { invoiceCode } from "../lib/format";
import { offlineUrls } from "../lib/offline/cashierData";
import { useOfflineQueue } from "../lib/offline/queue";
import {
  overlayCashSession,
  overlayLoans,
  overlayProducts,
  overlaySales,
} from "../lib/offline/overlay";
import { TabPills } from "../components/ui/TabPills";
import { Alert } from "../components/ui/Alert";
import { ghostBtnCls } from "../components/ui/inputs";
import { SaleForm } from "../components/facturacion/SaleForm";
import type { SaleMode } from "../components/facturacion/saleLines";
import { SalesList } from "../components/facturacion/SalesList";
import { SaleDetailModal } from "../components/facturacion/SaleDetailModal";
import { LoanForm } from "../components/facturacion/LoanForm";
import { LoansList } from "../components/facturacion/LoansList";
import { LoanDetailModal } from "../components/facturacion/LoanDetailModal";
import { CustomerForm } from "../components/facturacion/CustomerForm";
import { CustomersList } from "../components/facturacion/CustomersList";
import { CustomerEditModal } from "../components/facturacion/CustomerEditModal";
import { PendingCustomersList, type CustomerDebt } from "../components/facturacion/PendingCustomersList";
import { CustomerLoansModal } from "../components/facturacion/CustomerLoansModal";
import { SalesHistory } from "../components/facturacion/SalesHistory";

type Tab = "facturacion" | "prestamos" | "pendientes" | "ventas";

const QUEUED_MESSAGE = "sin conexión: se enviará sola cuando vuelva el internet";

// Sin internet y sin copia guardada de esos datos en este equipo.
const loadError = (err: unknown, fallback: string) =>
  err instanceof OfflineError ? `${fallback}: sin conexión y sin datos guardados en este equipo` : fallback;

export default function Facturacion() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  // El supervisor solo consulta: ve ventas y pendientes de ambas sedes, sin
  // registrar ni editar nada (el backend también se lo impide).
  const isSupervisor = user?.role === "SUPERVISOR";
  // El cajero trabaja únicamente en su propia sede: sin selector.
  const isCashier = user?.role === "CASHIER";
  const selectedBranchId = useBranchStore((s) => s.branchId);
  const setSelectedBranchId = useBranchStore((s) => s.setBranchId);
  // Sede activa: la del cajero siempre; para los demás, la elegida en el
  // selector superior o la propia por defecto.
  const branchId = isCashier
    ? user?.branchId ?? ""
    : selectedBranchId ?? user?.branchId ?? "";

  const [tab, setTab] = useState<Tab>(isSupervisor ? "ventas" : "facturacion");
  // Datos tal como llegan del servidor (o de la copia guardada sin internet).
  const [serverProducts, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [serverLoans, setLoans] = useState<Loan[]>([]);
  const [serverTodaySales, setTodaySales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  // Lo registrado sin internet que aún no se envía se muestra encima de esos
  // datos; al enviarse, `version` cambia y todo se recarga del servidor.
  const operations = useOfflineQueue((s) => s.operations);
  const version = useOfflineQueue((s) => s.version);
  const products = useMemo(
    () => overlayProducts(serverProducts, operations, branchId),
    [serverProducts, operations, branchId],
  );
  const loans = useMemo(
    () => overlayLoans(serverLoans, operations, branchId),
    [serverLoans, operations, branchId],
  );
  const todaySales = useMemo(
    () => overlaySales(serverTodaySales, operations, branchId),
    [serverTodaySales, operations, branchId],
  );

  // null = ningún formulario abierto; si no, la modalidad de venta en curso.
  const [saleMode, setSaleMode] = useState<SaleMode | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<CustomerDebt | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Estado de la caja del cajero: sin caja abierta no puede vender ni prestar.
  const navigate = useNavigate();
  // undefined = aún cargando; null = no hay caja abierta en el servidor.
  const [cashSession, setCashSession] = useState<CashSession | null | undefined>(undefined);
  const cashOpen =
    cashSession === undefined ? null : overlayCashSession(cashSession, operations, branchId) !== null;

  // Las consultas con `offline: true` guardan copia para trabajar sin
  // internet y, sin conexión, devuelven la última guardada.
  const loadCashState = useCallback(async () => {
    if (!isCashier) return;
    try {
      setCashSession(await api.get<CashSession | null>(offlineUrls.cash, { offline: true }));
    } catch { setCashSession(null); }
  }, [isCashier]);

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api.get<Product[]>(offlineUrls.products, { offline: true }));
    } catch (err) { setError(loadError(err, "Error al cargar productos")); }
  }, []);

  const loadBranches = useCallback(async () => {
    // El cajero no usa el selector de sede.
    if (isCashier) return;
    try {
      setBranches(await api.get<BranchInfo[]>(offlineUrls.branches));
    } catch { setError("Error al cargar sucursales"); }
  }, [isCashier]);

  const loadCustomers = useCallback(async () => {
    if (!branchId) return;
    try {
      setCustomers(await api.get<Customer[]>(offlineUrls.customers(branchId), { offline: true }));
    } catch (err) { setError(loadError(err, "Error al cargar clientes")); }
  }, [branchId]);

  const loadLoans = useCallback(async () => {
    if (!branchId) return;
    try {
      setLoans(await api.get<Loan[]>(offlineUrls.loans(branchId), { offline: true }));
    } catch (err) { setError(loadError(err, "Error al cargar préstamos")); }
  }, [branchId]);

  // "Ventas de hoy" = el día calendario en Colombia, acotado por ambos
  // extremos, para que se vea igual desde cualquier dispositivo. Se pide sin
  // caché del navegador para ver al instante lo vendido desde otro aparato.
  const loadTodaySales = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      setTodaySales(
        await api.get<Sale[]>(offlineUrls.todaySales(branchId), { fresh: true, offline: true }),
      );
    } catch (err) { setError(loadError(err, "Error al cargar las ventas de hoy")); }
    setLoading(false);
  }, [branchId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    loadProducts();
    loadCashState();
  }, [loadProducts, loadCashState, version]);

  useEffect(() => {
    if (tab === "facturacion") loadTodaySales();
    else if (tab === "prestamos") { loadCustomers(); loadLoans(); }
    else if (tab === "pendientes") loadLoans();
  }, [tab, loadTodaySales, loadCustomers, loadLoans, version]);
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

  const tabs: { key: Tab; label: string }[] = isSupervisor
    ? [
        { key: "ventas", label: "Ventas realizadas" },
        { key: "pendientes", label: "Clientes Pendientes" },
      ]
    : [
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
        {isCashier ? (
          <span className="text-sm text-slate-400">{user?.branchName}</span>
        ) : (
          <BranchSelector branches={branches} value={branchId} onChange={setSelectedBranchId} />
        )}
      </div>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="mb-6">
        <TabPills tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {isCashier && cashOpen === false && (tab === "facturacion" || tab === "prestamos") ? (
        <Card className="p-8 text-center space-y-4">
          <p className="text-white font-medium">La caja está cerrada</p>
          <p className="text-slate-400 text-sm">
            Debes abrir la caja antes de registrar ventas o préstamos.
          </p>
          <button
            onClick={() => navigate("/caja")}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium"
          >
            Ir a abrir la caja
          </button>
        </Card>
      ) : (
        <>
      {tab === "facturacion" && (
        <div className="space-y-4">
          {!saleMode && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setSaleMode("MAYOR"); setSuccess(null); }}
                className={ghostBtnCls}
              >
                + Venta al por mayor
              </button>
              <button
                onClick={() => { setSaleMode("DETAL"); setSuccess(null); }}
                className={ghostBtnCls}
              >
                + Venta al detal
              </button>
            </div>
          )}

          {saleMode && (
            <SaleForm
              key={saleMode}
              mode={saleMode}
              branchId={branchId}
              products={products}
              availability={(productId) => stockOf(branchId, productId)}
              onSaved={(invoiceNumber) => {
                setSaleMode(null);
                setSuccess(
                  invoiceNumber === null
                    ? `Venta guardada ${QUEUED_MESSAGE}`
                    : `Venta ${invoiceCode(invoiceNumber)} registrada`,
                );
              }}
              onCancel={() => setSaleMode(null)}
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
              onSaved={(invoiceNumber) => {
                setSuccess(
                  invoiceNumber === null
                    ? `Préstamo guardado ${QUEUED_MESSAGE}`
                    : `Préstamo generado (factura ${invoiceCode(invoiceNumber)})`,
                );
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
            <CustomersList
              customers={customers}
              onSelect={isAdmin ? (c) => setEditingCustomer(c) : undefined}
            />
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Préstamos generados</h3>
            <LoansList loans={loans} onSelect={setSelectedLoan} />
          </div>
        </div>
      )}
        </>
      )}

      {tab === "pendientes" && (
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">Clientes con préstamos activos</h3>
          <PendingCustomersList loans={activeLoans} onSelect={setSelectedDebt} />
        </div>
      )}

      {tab === "ventas" && (isAdmin || isSupervisor) && (
        <SalesHistory
          branch={branches.find((b) => b.id === branchId) ?? null}
          products={products}
          availability={(productId) => stockOf(branchId, productId)}
          onError={setError}
          canEdit={isAdmin}
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
          // En cola ya se ve encima de los datos; enviado, `version` recarga.
          onChanged={(queued) =>
            setSuccess(queued ? `Abono guardado ${QUEUED_MESSAGE}` : "Abono registrado")
          }
        />
      )}

      {editingCustomer && (
        <CustomerEditModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSaved={() => {
            setEditingCustomer(null);
            setSuccess("Cliente actualizado");
            loadCustomers();
          }}
          onDeleted={() => {
            setEditingCustomer(null);
            setSuccess("Cliente y su historial fueron borrados");
            loadCustomers();
            loadLoans();
          }}
        />
      )}

      {selectedDebt && (
        <CustomerLoansModal
          debt={selectedDebt}
          products={products}
          stockOf={stockOf}
          readOnly={isSupervisor}
          onClose={() => setSelectedDebt(null)}
          onChanged={(queued) => {
            setSuccess(queued ? `Guardado ${QUEUED_MESSAGE}` : "Préstamo actualizado");
            // El cambio de mercancía no pasa por la cola: recargar siempre.
            loadLoans();
            loadProducts();
          }}
        />
      )}
    </div>
  );
}
