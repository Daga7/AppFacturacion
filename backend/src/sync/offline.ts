import type { OfflineIssueType, Prisma } from '@prisma/client';

// Contexto de una operación hecha sin internet que se está sincronizando.
// Los servicios lo reciben para no rechazar lo que ya ocurrió en la vida real
// (stock insuficiente, abono mayor al saldo, caja cerrada...): lo registran
// igual y anotan la novedad en `issues` para que el administrador la revise.
export interface OfflineContext {
  occurredAt: Date;
  issues: IssueDraft[];
}

export interface IssueDraft {
  type: OfflineIssueType;
  message: string;
  saleId?: string;
  loanId?: string;
}

// Las operaciones leen y escriben varias tablas; con la base en Supabase una
// venta con muchos productos puede pasar del límite por defecto (5 s).
export const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

export type Tx = Prisma.TransactionClient;

export const money = (n: number | string | Prisma.Decimal) =>
  `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

// Mismo formato que el frontend ("F0001").
export const invoiceCode = (n: number) => `F${String(n).padStart(4, '0')}`;

export const bogotaDateTime = (date: Date) =>
  date.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  });
