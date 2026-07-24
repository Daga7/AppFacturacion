import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import type { Product, PriceChangeRequest, RequestStatus } from "../lib/types";
import { formatMoney, formatDateTime } from "../lib/format";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { EmptyState } from "../components/ui/EmptyState";
import { TabPills } from "../components/ui/TabPills";
import { ProductSelect } from "../components/ui/ProductSelect";
import { RequestStatusBadge } from "../components/ui/RequestStatusBadge";
import {
  inputCls,
  primaryBtnCls,
  ghostBtnCls,
  secondaryBtnCls,
} from "../components/ui/inputs";

type StatusFilter = RequestStatus | "ALL";

// Solicitudes de cambio de precio. El vendedor propone un precio con un motivo;
// el precio NO cambia hasta que el administrador aprueba. Al aprobar se
// actualiza el producto y queda registrado quién y cuándo.
export default function SolicitudesPrecio() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const isCashier = user?.role === "CASHIER";

  const [requests, setRequests] = useState<PriceChangeRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>(isAdmin ? "PENDING" : "ALL");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      setRequests(await api.get<PriceChangeRequest[]>(`/price-requests${q}`));
    } catch {
      setError("Error al cargar las solicitudes");
    }
    setLoading(false);
  }, [filter]);

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api.get<Product[]>("/products"));
    } catch {
      setError("Error al cargar productos");
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resolve = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/price-requests/${id}/${action}`, {});
      setSuccess(
        action === "approve"
          ? "Precio actualizado y solicitud aprobada"
          : "Solicitud rechazada",
      );
      loadRequests();
      if (action === "approve") loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar");
    }
    setBusyId(null);
  };

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "PENDING", label: "Pendientes" },
    { key: "APPROVED", label: "Aprobadas" },
    { key: "REJECTED", label: "Rechazadas" },
    { key: "ALL", label: "Todas" },
  ];

  return (
    <div>
      <PageHeader
        title="Solicitudes de cambio de precio"
        subtitle={
          isCashier
            ? "Propón un nuevo precio. El administrador decide si se aplica."
            : "Aprueba (se actualiza el precio) o rechaza cada propuesta."
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
          <PriceRequestForm
            products={products}
            onCancel={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false);
              setSuccess("Solicitud enviada");
              loadRequests();
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
        <EmptyState message="No hay solicitudes de cambio de precio" />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const up = Number(r.suggestedPrice) > Number(r.currentPrice);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-medium">{r.product.name}</p>
                      <RequestStatusBadge status={r.status} />
                    </div>
                    <p className="text-sm text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="line-through text-slate-500">
                        {formatMoney(r.currentPrice)}
                      </span>
                      <span className="text-slate-500">→</span>
                      <span className={up ? "text-emerald-400 font-medium" : "text-yellow-400 font-medium"}>
                        {formatMoney(r.suggestedPrice)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Solicitado por {r.requestedBy.username} · {formatDateTime(r.createdAt)}
                    </p>
                    {r.reason && (
                      <p className="text-xs text-slate-400 mt-1 italic">“{r.reason}”</p>
                    )}
                    {r.resolvedBy && (
                      <p className="text-xs text-slate-500 mt-1">
                        {r.status === "APPROVED" ? "Aprobada" : "Rechazada"} por{" "}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

function PriceRequestForm({
  products,
  onCancel,
  onSaved,
  onError,
}: {
  products: Product[];
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const product = products.find((p) => p.id === productId) ?? null;

  const submit = async () => {
    if (!productId) return onError("Elige un producto");
    const value = Number(price);
    if (!value || value <= 0) return onError("Ingresa un precio válido");

    setSaving(true);
    try {
      await api.post("/price-requests", {
        productId,
        suggestedPrice: value,
        reason: reason.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear la solicitud");
    }
    setSaving(false);
  };

  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-white font-semibold">Nueva solicitud de precio</h3>

      <div>
        <label className="text-xs text-slate-500 block mb-1">Producto</label>
        <ProductSelect products={products} value={productId} onChange={setProductId} />
        {product && (
          <p className="text-xs text-slate-500 mt-1">
            Precio actual: {formatMoney(product.salePrice)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Precio sugerido</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Motivo (opcional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Justificación del cambio"
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
