import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import type { Product, WarrantyClaim } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { EmptyState } from "../components/ui/EmptyState";
import { TabPills } from "../components/ui/TabPills";
import { ProductSelect } from "../components/ui/ProductSelect";
import { RequestStatusBadge } from "../components/ui/RequestStatusBadge";
import { useRequestList, requestStatusTabs } from "../hooks/useRequestList";
import {
  inputCls,
  primaryBtnCls,
  ghostBtnCls,
  secondaryBtnCls,
} from "../components/ui/inputs";

// Módulo de garantías con el proveedor. El vendedor registra la mercancía
// defectuosa que se le devolverá al proveedor (queda PENDING sin mover
// inventario); el administrador la aprueba (sale del stock de la sede) o la
// rechaza. El supervisor solo consulta.
export default function Garantias() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const isCashier = user?.role === "CASHIER";

  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);

  const {
    items: claims,
    loading,
    filter,
    setFilter,
    busyId,
    error,
    setError,
    success,
    setSuccess,
    reload,
    resolve,
  } = useRequestList<WarrantyClaim>({
    resource: "/warranties",
    initialFilter: isAdmin ? "PENDING" : "ALL",
    approveMessage: "Garantía aprobada: la mercancía salió del inventario",
    rejectMessage: "Garantía rechazada: el inventario no cambió",
  });

  // Catálogo con el stock por sede, para el formulario del vendedor.
  const loadProducts = useCallback(async () => {
    if (!isCashier) return;
    try {
      setProducts(await api.get<Product[]>("/products"));
    } catch {
      setError("Error al cargar los productos");
    }
  }, [isCashier, setError]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div>
      <PageHeader
        title="Garantías con proveedores"
        subtitle={
          isCashier
            ? "Registra la mercancía defectuosa que se le devolverá al proveedor. El administrador la aprueba."
            : "Aprueba o rechaza la mercancía que sale del inventario hacia el proveedor."
        }
      >
        {isCashier && !showForm && (
          <button onClick={() => { setShowForm(true); setSuccess(null); }} className={ghostBtnCls}>
            + Nueva garantía
          </button>
        )}
      </PageHeader>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      {isCashier && showForm && (
        <div className="mb-6">
          <WarrantyForm
            products={products}
            myBranchId={user?.branchId ?? ""}
            myBranchName={user?.branchName ?? ""}
            onCancel={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false);
              setSuccess("Garantía registrada: queda pendiente de aprobación del administrador");
              reload();
            }}
            onError={setError}
          />
        </div>
      )}

      <div className="mb-4">
        <TabPills tabs={requestStatusTabs} active={filter} onChange={setFilter} size="sm" />
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : claims.length === 0 ? (
        <EmptyState message="No hay garantías registradas" />
      ) : (
        <div className="space-y-3">
          {claims.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-medium">{c.product.name}</p>
                    <RequestStatusBadge status={c.status} />
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    <span className="text-white font-medium">{c.quantity}</span> u. · {c.branch.name}
                    {c.supplier && <> · Proveedor: <span className="text-slate-300">{c.supplier}</span></>}
                  </p>
                  <p className="text-sm text-slate-300 mt-1">Falla: {c.reason}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Registrada por {c.requestedBy.username} · {formatDateTime(c.createdAt)}
                  </p>
                  {c.resolvedBy && (
                    <p className="text-xs text-slate-500 mt-1">
                      {c.status === "APPROVED" ? "Aprobada (salió del inventario)" : "Rechazada"} por{" "}
                      {c.resolvedBy.username}
                      {c.resolvedAt ? ` · ${formatDateTime(c.resolvedAt)}` : ""}
                    </p>
                  )}
                </div>

                {isAdmin && c.status === "PENDING" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resolve(c.id, "approve")}
                      disabled={busyId === c.id}
                      className={primaryBtnCls}
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => resolve(c.id, "reject")}
                      disabled={busyId === c.id}
                      className={secondaryBtnCls}
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Formulario de nueva garantía (vendedor): la mercancía sale de su propia
// sede cuando el administrador la aprueba.
function WarrantyForm({
  products,
  myBranchId,
  myBranchName,
  onCancel,
  onSaved,
  onError,
}: {
  products: Product[];
  myBranchId: string;
  myBranchName: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [supplier, setSupplier] = useState("");
  const [saving, setSaving] = useState(false);

  // Stock actual del producto elegido en la sede.
  const available =
    products
      .find((p) => p.id === productId)
      ?.inventories?.find((i) => i.branchId === myBranchId)?.amount ?? 0;

  const submit = async () => {
    if (!productId) return onError("Elige el producto");
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return onError("La cantidad debe ser al menos 1");
    if (qty > available)
      return onError(`Stock insuficiente en ${myBranchName} (disponible: ${available})`);
    if (!reason.trim()) return onError("Describe la falla de la mercancía");

    setSaving(true);
    try {
      await api.post("/warranties", {
        productId,
        quantity: qty,
        reason: reason.trim(),
        supplier: supplier.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo registrar la garantía");
    }
    setSaving(false);
  };

  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-white font-semibold">Nueva garantía</h3>

      <div>
        <label className="text-xs text-slate-500 block mb-1">Producto</label>
        <ProductSelect products={products} value={productId} onChange={setProductId} />
        {productId && (
          <p className="text-xs text-slate-500 mt-1">
            Disponible en {myBranchName}: {available} u.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Cantidad</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Proveedor (opcional)</label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="A quién se le devuelve"
            maxLength={120}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 block mb-1">Falla</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej.: no da imagen, touch no responde, líneas en la pantalla"
          maxLength={300}
          className={`${inputCls} w-full`}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className={secondaryBtnCls} disabled={saving}>
          Cancelar
        </button>
        <button onClick={submit} className={primaryBtnCls} disabled={saving}>
          {saving ? "Enviando…" : "Enviar al administrador"}
        </button>
      </div>
    </Card>
  );
}
