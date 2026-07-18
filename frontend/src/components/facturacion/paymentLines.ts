import type { PaymentMethod } from "../../lib/types";

// Modelo y helpers de las líneas de pago, separados del componente editor.

export interface PaymentLine {
  paymentMethod: PaymentMethod;
  amount: string;
}

export const emptyPayment = (): PaymentLine => ({ paymentMethod: "CASH", amount: "" });

export const paymentsTotal = (payments: PaymentLine[]) =>
  payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

export function parsePayments(
  payments: PaymentLine[],
): { payments: { paymentMethod: PaymentMethod; amount: number }[] } | { error: string } {
  const parsed = payments
    .filter((p) => p.amount !== "" && parseFloat(p.amount) > 0)
    .map((p) => ({ paymentMethod: p.paymentMethod, amount: parseFloat(p.amount) }));
  if (parsed.some((p) => isNaN(p.amount) || p.amount < 0)) return { error: "Hay montos de pago inválidos" };
  return { payments: parsed };
}
