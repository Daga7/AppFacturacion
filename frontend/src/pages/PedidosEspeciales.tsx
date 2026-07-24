import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import type {
  SpecialOrder,
  SpecialOrderStatus,
  PaymentMethod,
} from "../lib/types";
import {
  specialOrderStatusLabels,
  paymentMethodLabels,
} from "../lib/types";
import { formatMoney } from "../lib/format";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { EmptyState } from "../components/ui/EmptyState";
import { TabPills } from "../components/ui/TabPills";
import { StatusBadge, type BadgeTone } from "../components/ui/StatusBadge";
import { SpecialOrderModal } from "../components/pedidos/SpecialOrderModal";
import {
  inputCls,
  primaryBtnCls,
  ghostBtnCls,
  secondaryBtnCls,
} from "../components/ui/inputs";

type StatusFilter = SpecialOrderStatus | "ALL";

const statusTone: Record<SpecialOrderStatus, BadgeTone> = {
  DEPOSITED: "info",
  ORDERED: "warning",
  ARRIVED: "success",
  PICKED_UP: "neutral",
};

// Pedidos especiales: repuestos que un cliente pide y que no se registran en el
// inventario. Se crean con un abono (que entra a caja), avanzan de estado y al
// final se cobra el saldo. El supervisor solo consulta.
export default function PedidosEspeciales() {
  const user = useAuthStore((s) => s.user);
  const isSupervisor = user?.role === "SUPERVISOR";
  const canManage = !isSupervisor;

  const [orders, setOrders] = useState<SpecialOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<SpecialOrder | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      setOrders(await api.get<SpecialOrder[]>(`/special-orders${q}`));
    } catch {
      setError("Error al cargar los pedidos");
    }
    setLoading(false);
  }, [filter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mantiene el modal sincronizado tras registrar un pago o cambiar estado.
  const refreshSelected = useCallback(
    async (id: string) => {
      try {
        setSelected(await api.get<SpecialOrder>(`/special-orders/${id}`));
      } catch {
        setSelected(null);
      }
    },
    [],
  );

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "Todos" },
    { key: "DEPOSITED", label: "Abonados" },
    { key: "ORDERED", label: "Pedidos" },
    { key: "ARRIVED", label: "En el local" },
    { key: "PICKED_UP", label: "Recogidos" },
  ];

  return (
    <div>
      <PageHeader
        title="Pedidos especiales"
        subtitle="Repuestos por encargo, sin registrarlos en el inventario."
      >
        {canManage && !showForm && (
          <button onClick={() => setShowForm(true)} className={ghostBtnCls}>
            + Nuevo pedido
          </button>
        )}
      </PageHeader>

      {error && <Alert kind="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert kind="success" message={success} onClose={() => setSuccess(null)} />}

      {canManage && showForm && (
        <div className="mb-6">
          <SpecialOrderForm
            onCancel={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false);
              setSuccess("Pedido especial creado");
              load();
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
      ) : orders.length === 0 ? (
        <EmptyState message="No hay pedidos especiales" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {orders.map((o) => {
            const pending =
              Math.round((Number(o.totalAmount) - Number(o.depositedAmount)) * 100) / 100;
            return (
              <Card
                key={o.id}
                className="p-4 cursor-pointer hover:border-slate-600 transition-colors"
                onClick={() => setSelected(o)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{o.partName}</p>
                    <p className="text-sm text-slate-400 truncate">{o.customerName}</p>
                  </div>
                  <StatusBadge tone={statusTone[o.status]}>
                    {specialOrderStatusLabels[o.status]}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-slate-500">
                    Total {formatMoney(o.totalAmount)}
                  </span>
                  {pending > 0 ? (
                    <span className="text-yellow-400">
                      Saldo {formatMoney(pending)}
                    </span>
                  ) : (
                    <span className="text-emerald-400">Pagado</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <SpecialOrderModal
          order={selected}
          readOnly={!canManage}
          onClose={() => setSelected(null)}
          onError={setError}
          onChanged={(msg) => {
            setSuccess(msg);
            refreshSelected(selected.id);
            load();
          }}
        />
      )}
    </div>
  );
}

const methods: PaymentMethod[] = ["CASH", "NEQUI", "BANCOLOMBIA"];

// Formulario de creación. El abono inicial es opcional; si es > 0 entra a la
// caja abierta de la sede.
function SpecialOrderForm({
  onCancel,
  onSaved,
  onError,
}: {
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [partName, setPartName] = useState("");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("CASH");
  const [estimatedArrival, setEstimatedArrival] = useState("");
  const [saving, setSaving] = useState(false);

  const deposit = Number(depositAmount) || 0;

  const submit = async () => {
    if (!customerName.trim()) return onError("Ingresa el nombre del cliente");
    if (!partName.trim()) return onError("Ingresa el nombre del repuesto");
    const total = Number(totalAmount);
    if (!total || total <= 0) return onError("Ingresa el valor total del pedido");
    if (deposit > total) return onError("El abono no puede superar el total");

    setSaving(true);
    try {
      await api.post("/special-orders", {
        customerName: customerName.trim(),
        partName: partName.trim(),
        description: description.trim() || undefined,
        totalAmount: total,
        depositAmount: deposit,
        depositMethod: deposit > 0 ? depositMethod : undefined,
        estimatedArrival: estimatedArrival
          ? new Date(estimatedArrival).toISOString()
          : undefined,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear el pedido");
    }
    setSaving(false);
  };

  const labelCls = "text-xs text-slate-500 block mb-1";

  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-white font-semibold">Nuevo pedido especial</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Cliente</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="Nombre del cliente"
          />
        </div>
        <div>
          <label className={labelCls}>Repuesto</label>
          <input
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="Qué se pide"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Descripción / observaciones (opcional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputCls} w-full`}
          placeholder="Detalles, referencia, marca…"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Valor total</label>
          <input
            type="number"
            min={0}
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelCls}>Abono inicial (opcional)</label>
          <input
            type="number"
            min={0}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelCls}>Método del abono</label>
          <select
            value={depositMethod}
            onChange={(e) => setDepositMethod(e.target.value as PaymentMethod)}
            className={`${inputCls} w-full`}
            disabled={deposit <= 0}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {paymentMethodLabels[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Fecha estimada de llegada (opcional)</label>
        <input
          type="date"
          value={estimatedArrival}
          onChange={(e) => setEstimatedArrival(e.target.value)}
          className={`${inputCls} w-full sm:w-auto`}
        />
      </div>

      {deposit > 0 && (
        <p className="text-xs text-slate-500">
          El abono de {formatMoney(deposit)} quedará registrado en la caja abierta.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className={secondaryBtnCls} disabled={saving}>
          Cancelar
        </button>
        <button onClick={submit} className={primaryBtnCls} disabled={saving}>
          {saving ? "Guardando…" : "Crear pedido"}
        </button>
      </div>
    </Card>
  );
}
