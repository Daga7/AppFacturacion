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
// el estado. `readOnly` (supervisor) oculta las acciones.
export function SpecialOrderModal({
  order,
  readOnly = false,
  onClose,
  onChanged,
  onError,
}: {
  order: SpecialOrder;
  readOnly?: boolean;
  onClose: () => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [busy, setBusy] = useState(false);

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
          <StatusBadge tone={statusTone[order.status]}>
            {specialOrderStatusLabels[order.status]}
          </StatusBadge>
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
