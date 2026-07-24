import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import type {
  Product,
  PurchaseListItem,
  PurchaseRecommendation,
} from "../lib/types";
import { formatDate } from "../lib/format";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { EmptyState } from "../components/ui/EmptyState";
import { TabPills } from "../components/ui/TabPills";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ProductSelect } from "../components/ui/ProductSelect";
import {
  inputCls,
  primaryBtnCls,
  secondaryBtnCls,
  ghostBtnCls,
} from "../components/ui/inputs";

type Tab = "lista" | "sugerencias";

// Lista de mercancía por comprar. Combina sugerencias automáticas del sistema
// (bajo stock, rotación, agotamiento próximo) con ítems que el vendedor agrega
// a mano con observaciones.
export default function ListaCompras() {
  const user = useAuthStore((s) => s.user);
  const canManage = user?.role !== "SUPERVISOR";

  const [tab, setTab] = useState<Tab>("lista");
  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [recs, setRecs] = useState<PurchaseRecommendation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        await api.get<PurchaseListItem[]>(
          `/purchase-list${showResolved ? "?includeResolved=true" : ""}`,
        ),
      );
    } catch {
      setError("Error al cargar la lista");
    }
    setLoading(false);
  }, [showResolved]);

  const loadRecs = useCallback(async () => {
    try {
      setRecs(await api.get<PurchaseRecommendation[]>("/purchase-list/recommendations"));
    } catch {
      setError("Error al cargar las sugerencias");
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api.get<Product[]>("/products"));
    } catch {
      /* opcional para agregar manual */
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  useEffect(() => {
    if (tab === "lista") loadItems();
    else loadRecs();
  }, [tab, loadItems, loadRecs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addRecommendation = async (rec: PurchaseRecommendation) => {
    setBusyId(rec.productId);
    setError(null);
    try {
      await api.post("/purchase-list/from-recommendation", {
        productId: rec.productId,
        branchId: rec.branchId,
      });
      setSuccess(`"${rec.productName}" agregado a la lista`);
      loadRecs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar");
    }
    setBusyId(null);
  };

  const toggleResolved = async (item: PurchaseListItem) => {
    setBusyId(item.id);
    try {
      await api.patch(`/purchase-list/${item.id}/resolve`, {
        resolved: !item.resolved,
      });
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    }
    setBusyId(null);
  };

  const removeItem = async (item: PurchaseListItem) => {
    setBusyId(item.id);
    try {
      await api.delete(`/purchase-list/${item.id}`);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
    setBusyId(null);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "lista", label: "Lista de compras" },
    { key: "sugerencias", label: "Sugerencias del sistema" },
  ];

  const itemLabel = (i: PurchaseListItem) => i.product?.name ?? i.label ?? "—";

  return (
    <div>
      <PageHeader
        title="Lista de compras"
        subtitle="Qué mercancía hace falta comprar, combinando el sistema y tu experiencia."
      />

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="mb-6">
        <TabPills tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === "lista" && (
        <div className="space-y-5">
          {canManage && (
            <ManualItemForm
              products={products}
              onSaved={() => {
                setSuccess("Agregado a la lista");
                loadItems();
              }}
              onError={setError}
            />
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">
              {showResolved ? "Todos los ítems" : "Pendientes por comprar"}
            </h3>
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="text-xs text-slate-400 hover:text-white"
            >
              {showResolved ? "Ocultar comprados" : "Ver comprados"}
            </button>
          </div>

          {loading ? (
            <p className="text-slate-400">Cargando...</p>
          ) : items.length === 0 ? (
            <EmptyState message="No hay nada en la lista de compras" />
          ) : (
            <div className="space-y-2">
              {items.map((i) => (
                <Card
                  key={i.id}
                  className={`p-4 flex items-start justify-between gap-3 ${
                    i.resolved ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${i.resolved ? "text-slate-400 line-through" : "text-white"}`}>
                        {itemLabel(i)}
                      </p>
                      <StatusBadge tone={i.source === "AUTO" ? "info" : "neutral"}>
                        {i.source === "AUTO" ? "Sugerido" : "Manual"}
                      </StatusBadge>
                      {i.branch && (
                        <span className="text-xs text-slate-500">{i.branch.name}</span>
                      )}
                    </div>
                    {i.note && (
                      <p className="text-xs text-slate-400 mt-1 italic">“{i.note}”</p>
                    )}
                    <p className="text-xs text-slate-600 mt-1">
                      {i.createdBy.username} · {formatDate(i.createdAt)}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <button
                        onClick={() => toggleResolved(i)}
                        disabled={busyId === i.id}
                        className={`${secondaryBtnCls} text-xs whitespace-nowrap`}
                      >
                        {i.resolved ? "Reactivar" : "Marcar comprado"}
                      </button>
                      <button
                        onClick={() => removeItem(i)}
                        disabled={busyId === i.id}
                        className="text-xs text-slate-500 hover:text-red-400 px-2"
                        title="Eliminar"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "sugerencias" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Calculadas por bajo stock, rotación y proyección de agotamiento. Ordenadas por urgencia.
          </p>
          {recs.length === 0 ? (
            <EmptyState message="Sin sugerencias por ahora: el stock está sano." />
          ) : (
            recs.map((r) => (
              <Card key={`${r.branchId}:${r.productId}`} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-medium">{r.productName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {r.categoryName} · {r.branchName} · stock {r.currentStock} u.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.reasons.map((reason, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => addRecommendation(r)}
                      disabled={busyId === r.productId}
                      className={`${ghostBtnCls} shrink-0`}
                    >
                      + Agregar
                    </button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Formulario para agregar un ítem manual: producto existente o texto libre, con
// una observación opcional.
function ManualItemForm({
  products,
  onSaved,
  onError,
}: {
  products: Product[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"product" | "text">("product");
  const [productId, setProductId] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (mode === "product" && !productId) return onError("Elige un producto");
    if (mode === "text" && !label.trim())
      return onError("Escribe qué hace falta comprar");

    setSaving(true);
    try {
      await api.post("/purchase-list", {
        productId: mode === "product" ? productId : undefined,
        label: mode === "text" ? label.trim() : undefined,
        note: note.trim() || undefined,
      });
      setProductId("");
      setLabel("");
      setNote("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo agregar");
    }
    setSaving(false);
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-white font-semibold">Agregar a la lista</h3>
        <TabPills
          tabs={[
            { key: "product", label: "Producto" },
            { key: "text", label: "Texto libre" },
          ]}
          active={mode}
          onChange={(m) => setMode(m)}
          size="sm"
        />
      </div>

      {mode === "product" ? (
        <ProductSelect products={products} value={productId} onChange={setProductId} />
      ) : (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ej: cargador tipo C genérico"
          className={`${inputCls} w-full`}
        />
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Observación (opcional)"
        className={`${inputCls} w-full`}
      />

      <div className="flex justify-end">
        <button onClick={submit} disabled={saving} className={primaryBtnCls}>
          {saving ? "Agregando…" : "Agregar"}
        </button>
      </div>
    </Card>
  );
}
