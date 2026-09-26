import type { CashSession, Loan, LoanPayment, Product, Sale } from "../types";
import type { LoanPaymentOperation, PendingOperation, SaleOperation } from "./queue";

// Lo que se muestra mientras hay operaciones sin enviar: los datos guardados
// del servidor más el efecto de cada operación pendiente (stock descontado,
// préstamos nuevos, abonos, devoluciones), para que quien cobra sin internet
// vea las cuentas como van.

const lineSubtotal = (d: { unitPrice: number; quantity: number; discount: number }) =>
  d.unitPrice * d.quantity - d.discount;

function pendingSale(op: SaleOperation): Sale {
  const { payload, meta } = op;
  const total = payload.details.reduce((sum, d) => sum + lineSubtotal(d), 0);
  const paid = payload.payments.reduce((sum, p) => sum + p.amount, 0);
  return {
    id: payload.saleId,
    invoiceNumber: 0,
    total,
    isCredit: payload.isCredit,
    status: "COMPLETED",
    customer: meta.customer,
    user: { id: op.userId, username: op.username },
    branch: { id: op.branchId, name: op.branchName },
    details: payload.details.map((d, i) => {
      const product = meta.products.find((p) => p.id === d.productId);
      return {
        id: `${op.id}-${i}`,
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        discount: d.discount,
        discountReason: d.discountReason ?? null,
        subtotal: lineSubtotal(d),
        product: {
          id: d.productId,
          name: product?.name ?? "Producto",
          barcode: product?.barcode ?? "",
          purchasePrice: 0,
          salePrice: d.unitPrice,
          retailPrice: 0,
          wholesalePrice: 0,
          isActive: true,
          category: { id: "", name: "" },
        },
      };
    }),
    payments: payload.payments.map((p, i) => ({ id: `${op.id}-p${i}`, ...p })),
    loan:
      payload.isCredit && payload.loanId
        ? {
            id: payload.loanId,
            originalAmount: total - paid,
            pendingAmount: total - paid,
            loanStatus: "ACTIVE",
            payments: [],
          }
        : null,
    createdAt: op.occurredAt,
    pending: true,
  };
}

function pendingLoan(op: SaleOperation): Loan {
  const sale = pendingSale(op);
  const customerId = op.payload.customerId ?? "";
  return {
    id: op.payload.loanId!,
    originalAmount: sale.loan!.originalAmount,
    pendingAmount: sale.loan!.pendingAmount,
    loanStatus: "ACTIVE",
    customerId,
    customer: op.meta.customer ?? {
      id: customerId,
      firstName: "Cliente",
      type: "SPECIAL",
      branchId: op.branchId,
    },
    payments: [],
    sale,
    createdAt: op.occurredAt,
    pending: true,
  };
}

function withPayment<L extends { pendingAmount: number; loanStatus: "ACTIVE" | "PAID"; payments: LoanPayment[] }>(
  loan: L,
  op: LoanPaymentOperation,
): L {
  const pending = Math.max(0, Number(loan.pendingAmount) - op.payload.amount);
  return {
    ...loan,
    pendingAmount: pending,
    loanStatus: pending <= 0.01 ? "PAID" : "ACTIVE",
    payments: [
      {
        id: op.id,
        amount: op.payload.amount,
        paymentMethod: op.payload.paymentMethod,
        createdAt: op.occurredAt,
        pending: true,
      },
      ...loan.payments,
    ],
  };
}

// Stock de la sede: menos lo vendido y más lo devuelto sin enviar.
export function overlayProducts(products: Product[], ops: PendingOperation[], branchId: string): Product[] {
  const delta = new Map<string, number>();
  const add = (productId: string, qty: number) => delta.set(productId, (delta.get(productId) ?? 0) + qty);
  for (const op of ops) {
    if (op.branchId !== branchId) continue;
    if (op.type === "CREATE_SALE") op.payload.details.forEach((d) => add(d.productId, -d.quantity));
    if (op.type === "RETURN_LOAN") op.meta.details.forEach((d) => add(d.productId, d.quantity));
  }
  if (delta.size === 0) return products;

  return products.map((p) => {
    const d = delta.get(p.id);
    if (!d) return p;
    const inventories = p.inventories ?? [];
    const exists = inventories.some((i) => i.branchId === branchId);
    return {
      ...p,
      inventories: exists
        ? inventories.map((i) => (i.branchId === branchId ? { ...i, amount: i.amount + d } : i))
        : [...inventories, { branchId, amount: d, branch: { id: branchId, name: "" } }],
    };
  });
}

export function overlayLoans(loans: Loan[], ops: PendingOperation[], branchId: string): Loan[] {
  if (ops.length === 0) return loans;
  let list = loans;
  for (const op of ops) {
    if (op.type === "CREATE_SALE") {
      const { isCredit, loanId } = op.payload;
      if (op.branchId === branchId && isCredit && loanId && !list.some((l) => l.id === loanId)) {
        list = [pendingLoan(op), ...list];
      }
    } else if (op.type === "LOAN_PAYMENT") {
      list = list.map((l) => (l.id === op.payload.loanId ? withPayment(l, op) : l));
    } else if (op.type === "RETURN_LOAN") {
      list = list.filter((l) => l.id !== op.payload.loanId);
    }
  }
  return list;
}

export function overlaySales(sales: Sale[], ops: PendingOperation[], branchId: string): Sale[] {
  if (ops.length === 0) return sales;
  let list = [
    ...ops
      .filter((op): op is SaleOperation => op.type === "CREATE_SALE" && op.branchId === branchId)
      .filter((op) => !sales.some((s) => s.id === op.payload.saleId))
      .map(pendingSale),
    ...sales,
  ];
  for (const op of ops) {
    if (op.type === "LOAN_PAYMENT") {
      list = list.map((s) => (s.loan?.id === op.payload.loanId ? { ...s, loan: withPayment(s.loan, op) } : s));
    } else if (op.type === "RETURN_LOAN") {
      list = list.map((s) => (s.loan?.id === op.payload.loanId ? { ...s, status: "CANCELLED" } : s));
    }
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Caja abierta sin internet y aún sin enviar.
export function overlayCashSession(
  session: CashSession | null,
  ops: PendingOperation[],
  branchId: string,
): CashSession | null {
  if (session) return session;
  const open = ops.find((op) => op.type === "OPEN_CASH" && op.branchId === branchId);
  if (!open || open.type !== "OPEN_CASH") return null;
  return {
    id: open.id,
    openingAmount: open.payload.openingAmount,
    status: "OPEN",
    branch: { id: open.branchId, name: open.branchName },
    openedBy: { id: open.userId, username: open.username },
    openedAt: open.occurredAt,
    pending: true,
  };
}
