import { create } from "zustand";
import { createStore, get, update } from "idb-keyval";
import type { Customer, PaymentMethod } from "../types";

// Operaciones que el cajero hizo sin internet y aún no llegan al servidor.
// Se guardan en IndexedDB en el orden en que ocurrieron y se envían en ese
// mismo orden (un abono puede apuntar al préstamo de una venta anterior).

export type OperationType = "OPEN_CASH" | "CREATE_SALE" | "LOAN_PAYMENT" | "RETURN_LOAN";

export interface SaleLinePayload {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountReason?: string;
}

interface BaseOperation {
  id: string;
  userId: string;
  username: string;
  branchId: string;
  branchName: string;
  occurredAt: string;
  // Descripción legible para avisos ("Venta de contado por $50.000").
  summary: string;
}

export interface OpenCashOperation extends BaseOperation {
  type: "OPEN_CASH";
  payload: { openingAmount: number };
}

export interface SaleOperation extends BaseOperation {
  type: "CREATE_SALE";
  payload: {
    // Ids generados aquí: las operaciones siguientes pueden referirse al
    // préstamo antes de que exista en el servidor.
    saleId: string;
    loanId?: string;
    branchId: string;
    customerId?: string;
    isCredit: boolean;
    details: SaleLinePayload[];
    payments: { paymentMethod: PaymentMethod; amount: number }[];
  };
  // Para mostrar la venta en pantalla mientras no se envía.
  meta: {
    products: { id: string; name: string; barcode: string }[];
    customer: Customer | null;
  };
}

export interface LoanPaymentOperation extends BaseOperation {
  type: "LOAN_PAYMENT";
  payload: { loanId: string; amount: number; paymentMethod: PaymentMethod };
}

export interface ReturnLoanOperation extends BaseOperation {
  type: "RETURN_LOAN";
  payload: { loanId: string };
  // Mercancía que vuelve al inventario (para el stock mostrado sin internet).
  meta: { details: { productId: string; quantity: number }[] };
}

export type PendingOperation =
  | OpenCashOperation
  | SaleOperation
  | LoanPaymentOperation
  | ReturnLoanOperation;

const store = createStore("bodegon-queue", "operations");
const KEY = "pending";

interface QueueState {
  operations: PendingOperation[];
  syncing: boolean;
  // Registros que el servidor rechazó, para avisarle a quien los hizo.
  notices: string[];
  // Error del último intento de envío (se reintenta solo).
  syncError: string | null;
  // Aumenta cada vez que el servidor aplica operaciones: las pantallas
  // recargan sus datos al verlo cambiar.
  version: number;

  reload: () => Promise<void>;
  add: (op: PendingOperation) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
  bump: () => void;
  addNotice: (message: string) => void;
  dismissNotices: () => void;
}

const sameIds = (a: PendingOperation[], b: PendingOperation[]) =>
  a.length === b.length && a.every((op, i) => op.id === b[i].id);

export const useOfflineQueue = create<QueueState>((set, getState) => ({
  operations: [],
  syncing: false,
  notices: [],
  syncError: null,
  version: 0,

  // Relee lo guardado (otra pestaña pudo agregar o enviar operaciones).
  reload: async () => {
    try {
      const operations = (await get<PendingOperation[]>(KEY, store)) ?? [];
      if (!sameIds(operations, getState().operations)) set({ operations });
    } catch {
      // Sin IndexedDB no hay cola que leer.
    }
  },

  // update() lee y escribe en una sola transacción de IndexedDB: si hay dos
  // pestañas abiertas ninguna pisa lo que agregó la otra.
  add: async (op) => {
    let next: PendingOperation[] = [];
    try {
      await update<PendingOperation[]>(KEY, (ops) => (next = [...(ops ?? []), op]), store);
    } catch {
      throw new Error("No se pudo guardar en este dispositivo; revisa el almacenamiento del navegador");
    }
    set({ operations: next });
  },

  remove: async (ids) => {
    const drop = new Set(ids);
    let next: PendingOperation[] = [];
    await update<PendingOperation[]>(
      KEY,
      (ops) => (next = (ops ?? []).filter((o) => !drop.has(o.id))),
      store,
    );
    set({ operations: next });
  },

  bump: () => set((s) => ({ version: s.version + 1 })),
  addNotice: (message) => set((s) => ({ notices: [...s.notices, message] })),
  dismissNotices: () => set({ notices: [] }),
}));
