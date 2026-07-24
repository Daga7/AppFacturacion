import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import type { BranchInfo, Product, TransferRequest } from "../lib/types";
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

// Módulo de traslados entre sucursales. El vendedor crea solicitudes (quedan
// PENDING sin mover inventario); el administrador aprueba (aplica el traslado)
// o rechaza. El supervisor solo consulta.
export default function Traslados() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const isCashier = user?.role === "CASHIER";

  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [showForm, setShowForm] = useState(false);

  const {
    items: requests,
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
  } = useRequestList<TransferRequest>({
    resource: "/transfers",
    initialFilter: isAdmin ? "PENDING" : "ALL",
    approveMessage: "Traslado aprobado y aplicado al inventario",
  });

  const loadCatalogs = useCallback(async () => {
    try {
      const [prods, brs] = await Promise.all([
        api.get<Product[]>("/products"),
        api.get<BranchInfo[]>("/branches"),
      ]);
      setProducts(prods);
      setBranches(brs);
    } catch {
      setError("Error al cargar productos o sucursales");
    }
  }, [setError]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const statusTabs = requestStatusTabs;

  return (
    <div>
      <PageHeader
        title="Traslados entre sucursales"
        subtitle={
          isCashier
            ? "Solicita enviar mercancía a otra sede. El administrador la aprueba."
            : "Aprueba o rechaza las solicitudes de traslado."
        }
      >
        {isCashier && !showForm && (
          <button onClick={() => setShowForm(true)} className={ghostBtnCls}>
            + Nueva solicitud
          </button>
        )}
      </PageHeader>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      {isCashier && showForm && (
        <div className="mb-6">
          <TransferForm
            products={products}
            branches={branches}
            myBranchId={user?.branchId ?? ""}
            myBranchName={user?.branchName ?? ""}
            onCancel={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false);
              setSuccess("Solicitud de traslado creada");
              reload();
            }}
            onError={setError}
          />
        </div>
      )}

      <div className="mb-4">
        <TabPills tabs={statusTabs} active={filter} onChange={setFilter} size="sm" />
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : requests.length === 0 ? (
        <EmptyState message="No hay solicitudes de traslado" />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-medium">{r.product.name}</p>
                    <RequestStatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    <span className="text-white font-medium">{r.quantity}</span> u. ·{" "}
                    {r.fromBranch.name} <span className="text-slate-500">→</span>{" "}
                    {r.toBranch.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Solicitado por {r.requestedBy.username} · {formatDateTime(r.createdAt)}
                  </p>
                  {r.note && (
                    <p className="text-xs text-slate-400 mt-1 italic">“{r.note}”</p>
                  )}
                  {r.resolvedBy && (
                    <p className="text-xs text-slate-500 mt-1">
                      {r.status === "APPROVED" ? "Aprobado" : "Rechazado"} por{" "}
                      {r.resolvedBy.username}
                      {r.resolvedAt ? ` · ${formatDateTime(r.resolvedAt)}` : ""}
                    </p>
                  )}
                </div>

                {isAdmin && r.status === "PENDING" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resolve(r.id, "approve")}
                      disabled={busyId === r.id}
                      className={primaryBtnCls}
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => resolve(r.id, "reject")}
                      disabled={busyId === r.id}
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

// Formulario de nueva solicitud de traslado (vendedor). El origen es su propia
// sede; elige destino, producto y cantidad.
function TransferForm({
  products,
  branches,
  myBranchId,
  myBranchName,
  onCancel,
  onSaved,
  onError,
}: {
  products: Product[];
  branches: BranchInfo[];
  myBranchId: string;
  myBranchName: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [toBranchId, setToBranchId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const otherBranches = branches.filter((b) => b.id !== myBranchId);

  // Stock disponible en la sede de origen del producto elegido.
  const available =
    products
      .find((p) => p.id === productId)
      ?.inventories?.find((i) => i.branchId === myBranchId)?.amount ?? 0;

  const submit = async () => {
    if (!toBranchId) return onError("Elige la sucursal de destino");
    if (!productId) return onError("Elige un producto");
    const qty = Number(quantity);
    if (!qty || qty < 1) return onError("La cantidad debe ser al menos 1");
    if (qty > available)
      return onError(`Stock insuficiente en ${myBranchName} (disponible: ${available})`);

    setSaving(true);
    try {
      await api.post("/transfers", {
        toBranchId,
        productId,
        quantity: qty,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear la solicitud");
    }
    setSaving(false);
  };

  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-white font-semibold">Nueva solicitud de traslado</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Origen</label>
          <div className={`${inputCls} w-full opacity-70`}>{myBranchName}</div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Destino</label>
          <select
            value={toBranchId}
            onChange={(e) => setToBranchId(e.target.value)}
            className={`${inputCls} w-full`}
          >
            <option value="">Selecciona…</option>
            {otherBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

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
          <label className="text-xs text-slate-500 block mb-1">Nota (opcional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo o detalle"
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className={secondaryBtnCls} disabled={saving}>
          Cancelar
        </button>
        <button onClick={submit} className={primaryBtnCls} disabled={saving}>
          {saving ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </Card>
  );
}
