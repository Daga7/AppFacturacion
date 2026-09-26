import { api, OfflineError, sessionTokens } from "../api";
import { useAuthStore } from "../../stores/auth";
import { formatMoney } from "../format";
import type { Customer, Loan, PaymentMethod, Product } from "../types";
import { offlineLimitReached, useConnection, uuid } from "./connection";
import {
  useOfflineQueue,
  type LoanPaymentOperation,
  type OpenCashOperation,
  type PendingOperation,
  type ReturnLoanOperation,
  type SaleLinePayload,
  type SaleOperation,
} from "./queue";
import { syncNow, toWire, type SyncResult } from "./sync";

// Registro de las operaciones que el cajero puede hacer sin internet: abrir
// caja, vender (contado o préstamo), abonar y registrar devoluciones.
// Con conexión se envían y se espera la respuesta, con las validaciones de
// siempre. Sin conexión (y solo para el cajero) quedan en la cola y se envían
// solas cuando vuelve la red.

const ONLINE_TIMEOUT_MS = 20_000;

export type SubmitOutcome =
  | { queued: true }
  | { queued: false; result: Record<string, unknown> };

export async function submitOperation(op: PendingOperation): Promise<SubmitOutcome> {
  const user = useAuthStore.getState().user;
  const canQueue = user?.role === "CASHIER";
  const queue = useOfflineQueue.getState();
  await queue.reload();

  // Si ya hay registros suyos en cola, lo nuevo va detrás para respetar el
  // orden (un abono puede depender de un préstamo aún sin enviar).
  const mustQueue =
    canQueue &&
    (!useConnection.getState().online ||
      !sessionTokens.read().accessToken ||
      useOfflineQueue.getState().operations.some((o) => o.userId === user.id));

  if (!mustQueue) {
    try {
      const { results } = await api.post<{ results: SyncResult[] }>(
        "/sync",
        { operations: [toWire(op, "online")] },
        { timeoutMs: ONLINE_TIMEOUT_MS },
      );
      const [res] = results;
      if (res.status === "rejected") throw new Error(res.error ?? "No se pudo registrar");
      queue.bump();
      return { queued: false, result: res.result ?? {} };
    } catch (err) {
      // Sin respuesta: se guarda con el mismo id; si el servidor alcanzó a
      // registrarlo, al reenviarlo lo reconoce y no lo duplica.
      if (!(err instanceof OfflineError) || !canQueue) throw err;
    }
  }

  if (offlineLimitReached()) {
    throw new Error(
      "Llevas más de 10 horas sin conexión. Conéctate a internet para seguir registrando.",
    );
  }
  await queue.add(op);
  void syncNow();
  return { queued: true };
}

// --- Construcción de operaciones -------------------------------------------

export const customerName = (c: { firstName: string; lastName?: string | null }) =>
  `${c.firstName} ${c.lastName ?? ""}`.trim();

function base(summary: string, branchId?: string) {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error("Inicia sesión de nuevo");
  return {
    id: uuid(),
    userId: user.id,
    username: user.username,
    branchId: branchId ?? user.branchId,
    branchName: user.branchName,
    occurredAt: new Date().toISOString(),
    summary,
  };
}

export function openCashOperation(openingAmount: number): OpenCashOperation {
  return {
    ...base(`Apertura de caja con base ${formatMoney(openingAmount)}`),
    type: "OPEN_CASH",
    payload: { openingAmount },
  };
}

export function saleOperation(input: {
  branchId: string;
  customer: Customer | null;
  isCredit: boolean;
  details: SaleLinePayload[];
  payments: { paymentMethod: PaymentMethod; amount: number }[];
  products: Product[];
}): SaleOperation {
  const { branchId, customer, isCredit, details, payments, products } = input;
  const total = details.reduce((sum, d) => sum + d.unitPrice * d.quantity - d.discount, 0);
  const summary =
    isCredit && customer
      ? `Préstamo a ${customerName(customer)} por ${formatMoney(total)}`
      : `Venta de contado por ${formatMoney(total)}`;
  return {
    ...base(summary, branchId),
    type: "CREATE_SALE",
    payload: {
      saleId: uuid(),
      loanId: isCredit ? uuid() : undefined,
      branchId,
      customerId: customer?.id,
      isCredit,
      details,
      payments,
    },
    meta: {
      products: details.map((d) => {
        const p = products.find((x) => x.id === d.productId);
        return { id: d.productId, name: p?.name ?? "Producto", barcode: p?.barcode ?? "" };
      }),
      customer,
    },
  };
}

export function loanPaymentOperation(
  loan: Loan,
  amount: number,
  paymentMethod: PaymentMethod,
): LoanPaymentOperation {
  return {
    ...base(`Abono de ${formatMoney(amount)} de ${customerName(loan.customer)}`, loan.sale?.branch.id),
    type: "LOAN_PAYMENT",
    payload: { loanId: loan.id, amount, paymentMethod },
  };
}

export function returnLoanOperation(loan: Loan): ReturnLoanOperation {
  const details = loan.sale?.details ?? [];
  const products = details.map((d) => `${d.quantity} × ${d.product?.name}`).join(", ");
  return {
    ...base(`Devolución de ${products || "mercancía"} de ${customerName(loan.customer)}`, loan.sale?.branch.id),
    type: "RETURN_LOAN",
    payload: { loanId: loan.id },
    meta: { details: details.map((d) => ({ productId: d.productId, quantity: d.quantity })) },
  };
}
