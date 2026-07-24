import { useState } from "react";
import { api } from "../../lib/api";
import type {
  SpecialOrder,
  SpecialOrderStatus,
  PaymentMethod,
} from "../../lib/types";
import {
  specialOrderStatusLabels,
  paymentMethodLabels,
} from "../../lib/types";
import { formatMoney, formatDateTime, formatDate } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { StatusBadge, type BadgeTone } from "../ui/StatusBadge";
import { inputCls, primaryBtnCls, secondaryBtnCls } from "../ui/inputs";

const STATUS_FLOW: SpecialOrderStatus[] = [
  "DEPOSITED",
  "ORDERED",
  "ARRIVED",
  "PICKED_UP",
];

const statusTone: Record<SpecialOrderStatus, BadgeTone> = {
  DEPOSITED: "info",
  ORDERED: "warning",
  ARRIVED: "success",
  PICKED_UP: "neutral",
};

const methods: PaymentMethod[] = ["CASH", "NEQUI", "BANCOLOMBIA"];

// Detalle de un pedido especial: datos, pagos, registrar abono/saldo y avanzar
// el estado. `readOnly` (supervisor) oculta las acciones; `canEdit` (admin)
// habilita la edición de los datos del pedido.
export function SpecialOrderModal({
  order,
  readOnly = false,
  canEdit = false,
  onClose,
  onChanged,
  onError,
}: {
  order: SpecialOrder;
  readOnly?: boolean;
  canEdit?: boolean;
  onClose: () => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const total = Number(order.totalAmount);
  const deposited = Number(order.depositedAmount);
  const pending = Math.max(0, Math.round((total - deposited) * 100) / 100);
  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const nextStatus = STATUS_FLOW[currentIdx + 1] ?? null;

  const addPayment = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return onError("Ingresa un monto válido");
    if (value > pending + 0.01)
      return onError(`El pago supera el saldo pendiente (${formatMoney(pending)})`);
    setBusy(true);
    try {
      await api.post(`/special-orders/${order.id}/payments`, {
        amount: value,
        paymentMethod: method,
      });
      onChanged("Pago registrado");
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo registrar el pago");
    }
    setBusy(false);
  };

  const advance = async () => {
    if (!nextStatus) return;
    setBusy(true);
    try {
      await api.patch(`/special-orders/${order.id}/status`, { status: nextStatus });
      onChanged(`Estado: ${specialOrderStatusLabels[nextStatus]}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    }
    setBusy(false);
  };

  // Modo edición (solo admin): formulario de datos del pedido.
  if (editing) {
    return (
      <Modal title="Editar pedido" onClose={onClose} maxWidth="max-w-lg">
        <SpecialOrderEditForm
          order={order}
          onCancel={() => setEditing(false)}
          onSaved={(msg) => {
            setEditing(false);
            onChanged(msg);
          }}
          onError={onError}
        />
      </Modal>
    );
  }

  return (
    <Modal title={order.partName} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-white font-medium">{order.customerName}</p>
            <p className="text-xs text-slate-500">
              {order.branch.name} · creado por {order.createdBy.username}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Editar
              </button>
            )}
            <StatusBadge tone={statusTone[order.status]}>
              {specialOrderStatusLabels[order.status]}
            </StatusBadge>
          </div>
        </div>

        {order.description && (
          <p className="text-sm text-slate-400 italic">“{order.description}”</p>
        )}

        {order.estimatedArrival && (
          <p className="text-xs text-slate-500">
            Llegada estimada: {formatDate(order.estimatedArrival)}
          </p>
        )}

        {/* Progreso de estados */}
        <div className="flex items-center gap-1">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded-full ${
                  i <= currentIdx ? "bg-brand" : "bg-slate-700"
                }`}
              />
              <span
                className={`text-[10px] text-center ${
                  i <= currentIdx ? "text-brand-light" : "text-slate-600"
                }`}
              >
                {specialOrderStatusLabels[s]}
              </span>
            </div>
          ))}
        </div>

        {/* Montos */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-white font-semibold">{formatMoney(total)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Abonado</p>
            <p className="text-emerald-400 font-semibold">{formatMoney(deposited)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Saldo</p>
            <p className={pending > 0 ? "text-yellow-400 font-semibold" : "text-slate-400 font-semibold"}>
              {formatMoney(pending)}
            </p>
          </div>
        </div>

        {/* Historial de pagos */}
        {order.payments.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Pagos</p>
            <div className="space-y-1">
              {order.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm bg-slate-800/50 rounded px-3 py-1.5"
                >
                  <span className="text-slate-400">
                    {p.kind === "FINAL" ? "Saldo" : "Abono"} ·{" "}
                    {paymentMethodLabels[p.paymentMethod]}
                  </span>
                  <span className="text-white">{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!readOnly && (
          <>
            {/* Registrar pago */}
            {pending > 0 && (
              <div className="border-t border-slate-800 pt-4 space-y-2">
                <p className="text-sm font-medium text-white">Registrar pago</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Máx ${pending}`}
                    className={`${inputCls} flex-1`}
                  />
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className={inputCls}
                  >
                    {methods.map((m) => (
                      <option key={m} value={m}>
                        {paymentMethodLabels[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAmount(String(pending))}
                    className={`${secondaryBtnCls} text-xs`}
                    type="button"
                  >
                    Pagar saldo completo
                  </button>
                  <button
                    onClick={addPayment}
                    disabled={busy}
                    className={`${primaryBtnCls} flex-1`}
                  >
                    Registrar
                  </button>
                </div>
              </div>
            )}

            {/* Avanzar estado */}
            {nextStatus && (
              <div className="border-t border-slate-800 pt-4">
                <button
                  onClick={advance}
                  disabled={busy}
                  className={`${primaryBtnCls} w-full`}
                >
                  Marcar como “{specialOrderStatusLabels[nextStatus]}”
                </button>
                {nextStatus === "PICKED_UP" && pending > 0 && (
                  <p className="text-xs text-yellow-400/80 mt-2 text-center">
                    Debes registrar el saldo antes de entregar.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <p className="text-xs text-slate-600 text-center">
          Creado {formatDateTime(order.createdAt)}
        </p>
      </div>
    </Modal>
  );
}

// Formulario de edición de datos del pedido (solo admin). No toca pagos ni
// estado. El total no puede quedar por debajo de lo abonado (validado también
// en el backend).
function SpecialOrderEditForm({
  order,
  onCancel,
  onSaved,
  onError,
}: {
  order: SpecialOrder;
  onCancel: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [customerName, setCustomerName] = useState(order.customerName);
  const [partName, setPartName] = useState(order.partName);
  const [description, setDescription] = useState(order.description ?? "");
  const [totalAmount, setTotalAmount] = useState(String(order.totalAmount));
  const [estimatedArrival, setEstimatedArrival] = useState(
    order.estimatedArrival ? order.estimatedArrival.slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);

  const deposited = Number(order.depositedAmount);
  const labelCls = "text-xs text-slate-500 block mb-1";

  const submit = async () => {
    if (!customerName.trim()) return onError("Ingresa el nombre del cliente");
    if (!partName.trim()) return onError("Ingresa el nombre del repuesto");
    const total = Number(totalAmount);
    if (!total || total <= 0) return onError("Ingresa el valor total del pedido");
    if (total < deposited)
      return onError(
        `El total no puede ser menor que lo ya abonado (${formatMoney(deposited)})`,
      );

    setSaving(true);
    try {
      await api.patch(`/special-orders/${order.id}`, {
        customerName: customerName.trim(),
        partName: partName.trim(),
        description: description.trim(),
        totalAmount: total,
        estimatedArrival: estimatedArrival
          ? new Date(estimatedArrival).toISOString()
          : undefined,
      });
      onSaved("Pedido actualizado");
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Cliente</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className={labelCls}>Repuesto</label>
          <input
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Descripción / observaciones</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputCls} w-full`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Valor total</label>
          <input
            type="number"
            min={0}
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className={`${inputCls} w-full`}
          />
          <p className="text-xs text-slate-600 mt-1">
            Abonado: {formatMoney(deposited)}
          </p>
        </div>
        <div>
          <label className={labelCls}>Fecha estimada de llegada</label>
          <input
            type="date"
            value={estimatedArrival}
            onChange={(e) => setEstimatedArrival(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className={secondaryBtnCls} disabled={saving}>
          Cancelar
        </button>
        <button onClick={submit} className={primaryBtnCls} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
