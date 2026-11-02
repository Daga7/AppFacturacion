/**
 * Continuación de las ventas de demostración: completa octubre de 2026 (del
 * 27 al 31) y carga noviembre hasta hoy (1 y 2), con los parámetros de
 * demo-octubre.ts: ritmo de 2.000 ventas al mes repartidas 5:3 entre
 * Aguachica y Ocaña, ticket promedio de $70.000 exactos por sede, ganancia de
 * 35,7 %, ~5 % a crédito y la pantalla del Samsung A35 como la más vendida.
 *
 * Las metas son del mes completo y cuentan lo que ya hay en la BD (lo de
 * demo-octubre.ts y las ventas reales, como la F1134 del 27 de octubre): así
 * octubre cierra con 2.000 ventas, $140.000.000 y 35,7 % de ganancia, y
 * noviembre va al mismo ritmo. La ganancia se cuadra eligiendo qué pantallas
 * se venden; los costos de compra no se tocan.
 *
 * Además los préstamos de octubre que quedaron con saldo siguen recibiendo
 * abonos, cada sede abre y cierra caja todos los días y una compra al
 * proveedor el 27 de octubre cubre lo vendido (el stock actual no cambia).
 *
 * Uso (desde backend/, con demo-octubre.ts ya cargado):
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-continuacion.ts           # simulación
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-continuacion.ts --apply   # escribe
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-continuacion.ts --remove  # borra lo cargado
 *
 * Lo cargado queda en prisma/demo-continuacion.manifest.json; --remove lo
 * borra y deja los préstamos de octubre como estaban. Para recargar todo:
 * borrar esta continuación antes que demo-modulos.ts y demo-octubre.ts, y
 * cargarla después de ellos.
 */
import 'dotenv/config';
import { PrismaClient, Prisma, type LoanStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  BRANCHES,
  CREDIT_SHARE,
  HOLIDAY_WEIGHT,
  MONTHLY_SALES,
  PAYDAYS,
  SEED,
  TARGET_MARGIN,
  TARGET_TICKET,
  TX,
  WEEKDAY_WEIGHT,
  chunks,
  discount,
  ids,
  localTime,
  makeTicket,
  money,
  nameKey,
  pick,
  productSampler,
  rand,
  randInt,
  reseed,
  saleSecond,
  salePaymentsFor,
  shuffle,
  thousands,
  ticketTotal,
  weighted,
  withPopularity,
  allocate,
  type CatalogItem,
  type Day,
  type Product,
  type Ticket,
} from './demo-octubre';

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const MANIFEST = path.join(__dirname, 'demo-continuacion.manifest.json');
const OCTOBER_MANIFEST = path.join(__dirname, 'demo-octubre.manifest.json');

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// Los días se cuentan desde el 1 de octubre (localTime de demo-octubre): el
// 32 es el 1 de noviembre, porque Date.UTC pasa al mes siguiente.
const YEAR = 2026;
const START = 27; // 27 de octubre
const END = 33; // 2 de noviembre: hoy
// Lunes 2 de noviembre: Día de Todos los Santos (festivo trasladado).
const HOLIDAYS = [33];
const PERIODS = [
  // Meses en el rango: primer y último día del mes y días que se cargan.
  { name: 'Octubre', first: 1, last: 31, from: START, to: 31 },
  { name: 'Noviembre', first: 32, last: 61, from: 32, to: END },
];
// Intentos al elegir las ventas de una sede: se queda la que deja la ganancia
// más cerca de la meta.
const ATTEMPTS = 20_000;

const dayOfMonth = (ord: number) =>
  new Date(Date.UTC(YEAR, 9, ord)).getUTCDate();
// Día (contado desde el 1 de octubre) de un instante, en hora de Colombia.
const ordinal = (date: Date) =>
  Math.floor((date.getTime() - localTime(1, 0).getTime()) / 86_400_000) + 1;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

interface Branch {
  id: string;
  name: string;
  share: number;
  openingAmount: number;
  userId: string;
  customerIds: string[];
  inventoryIds: Map<string, string>;
  nextInvoice: number;
  // Instante de su última venta: las nuevas van después, así la numeración
  // sigue el orden de las horas.
  notBefore: Date;
  days: Map<number, Day>;
}

interface LoanUpdate {
  id: string;
  pendingAmount: number;
  loanStatus: LoanStatus;
  updatedAt: string;
}

interface Plan {
  cashSessions: Prisma.CashSessionCreateManyInput[];
  sales: Prisma.SaleCreateManyInput[];
  saleDetails: Prisma.SaleDetailCreateManyInput[];
  salePayments: Prisma.SalePaymentCreateManyInput[];
  loans: Prisma.LoanCreateManyInput[];
  loanPayments: Prisma.LoanPaymentCreateManyInput[];
  inventories: Prisma.InventoryCreateManyInput[];
  movements: Prisma.InventoryMovementCreateManyInput[];
  // Préstamos de octubre que reciben abonos: estado nuevo y anterior.
  loanUpdates: { next: LoanUpdate; previous: LoanUpdate }[];
}

interface MonthTotals {
  sales: number;
  revenue: number;
  cost: number;
}

// --- Elección de las ventas -------------------------------------------------

const ticketsCost = (tickets: Ticket[], costOf: Map<string, number>) =>
  tickets.reduce(
    (sum, t) =>
      sum +
      t.lines.reduce((s, l) => s + costOf.get(l.productId)! * l.quantity, 0),
    0,
  );

// Reparte el excedente en descuentos pequeños; false si no cupo.
function settle(tickets: Ticket[], excess: number) {
  for (const t of shuffle(tickets.filter((t) => t.lines[0].discount === 0))) {
    if (excess === 0) break;
    excess -= discount(
      t.lines[0],
      Math.min(excess, 1000 * randInt(1, 5)),
      'Cliente frecuente',
    );
  }
  return excess === 0;
}

// n ventas que suman exactamente `revenue` y cuyo costo queda lo más cerca
// posible de `cost`.
function pickTickets(
  n: number,
  revenue: number,
  cost: number,
  sample: () => Product,
  costOf: Map<string, number>,
) {
  const maxExcess = Math.max(30_000, n * 300);
  let best: Ticket[] | null = null;
  let bestGap = Infinity;
  for (let i = 0; i < ATTEMPTS && bestGap >= 100; i++) {
    const tickets = Array.from({ length: n }, () => makeTicket(sample));
    const excess =
      tickets.reduce((sum, t) => sum + ticketTotal(t), 0) - revenue;
    if (excess < 0 || excess > maxExcess) continue;
    const gap = Math.abs(ticketsCost(tickets, costOf) - cost);
    if (gap < bestGap && settle(tickets, excess)) {
      best = tickets;
      bestGap = gap;
    }
  }
  if (!best) {
    throw new Error('No se logró el ticket promedio con los precios actuales');
  }
  return best;
}

// --- Plan -------------------------------------------------------------------

function buildDays(): Map<number, Day> {
  return new Map(
    range(START, END).map((ord) => {
      const weekday = new Date(Date.UTC(YEAR, 9, ord)).getUTCDay();
      const holiday = HOLIDAYS.includes(ord);
      const short = weekday === 0 || holiday;
      return [
        ord,
        {
          day: ord,
          short,
          // Mismos horarios de caja que en demo-octubre.
          openAt:
            (short ? 8 * 3600 + 50 * 60 : 7 * 3600 + 50 * 60) + randInt(0, 900),
          closeAt: (short ? 13 * 3600 + 30 * 60 : 19 * 3600) + randInt(0, 1500),
          weight:
            (holiday ? HOLIDAY_WEIGHT : WEEKDAY_WEIGHT[weekday]) *
            (PAYDAYS.includes(dayOfMonth(ord)) ? 1.15 : 1) *
            (0.85 + 0.3 * rand()),
          sessionId: randomUUID(),
          cash: 0,
        },
      ];
    }),
  );
}

const loanMethod = () =>
  weighted<'CASH' | 'NEQUI' | 'BANCOLOMBIA'>([
    ['CASH', 0.6],
    ['NEQUI', 0.25],
    ['BANCOLOMBIA', 0.15],
  ]);

// Abonos de un préstamo desde el día `day` (ya sorteado) cada 2 a 9 días,
// hasta END y hasta completar 3 abonos. Devuelve lo que queda debiendo y la
// fecha del último abono.
function addLoanPayments(
  plan: Plan,
  branch: Branch,
  loanId: string,
  pending: number,
  day: number,
  done: number,
) {
  let last: Date | null = null;
  for (let k = done; k < 3 && pending > 0; k++) {
    if (k > done) day += randInt(2, 9);
    if (day > END) break;
    const d = branch.days.get(day)!;
    let paid =
      rand() < 0.5 ? pending : thousands(pending * (0.3 + rand() * 0.4));
    if (paid <= 0) paid = pending;
    const method = loanMethod();
    last = localTime(day, saleSecond(d));
    plan.loanPayments.push({
      id: randomUUID(),
      loanId,
      amount: paid,
      paymentMethod: method,
      cashSessionId: d.sessionId,
      createdAt: last,
    });
    if (method === 'CASH') d.cash += paid;
    pending -= paid;
  }
  return { pending, last };
}

function buildPlan(
  products: Product[],
  branches: Branch[],
  existing: Map<string, MonthTotals>[],
  costOf: Map<string, number>,
  activeLoans: {
    id: string;
    branchId: string;
    pendingAmount: number;
    updatedAt: Date;
    payments: number;
    lastActivity: Date;
  }[],
) {
  const sample = productSampler(products);
  const plan: Plan = {
    cashSessions: [],
    sales: [],
    saleDetails: [],
    salePayments: [],
    loans: [],
    loanPayments: [],
    inventories: [],
    movements: [],
    loanUpdates: [],
  };
  const sold = new Map<string, number>();
  const newInventory = new Map<string, string>();
  const inventoryFor = (branch: Branch, productId: string) => {
    const existingId = branch.inventoryIds.get(productId);
    if (existingId) return existingId;
    const key = `${branch.id}|${productId}`;
    if (!newInventory.has(key)) newInventory.set(key, randomUUID());
    return newInventory.get(key)!;
  };

  PERIODS.forEach((period, p) => {
    // Ventas del mes al ritmo mensual (si el mes no termina, la parte que
    // va), repartidas entre las sedes como en demo-octubre.
    const monthDays = period.last - period.first + 1;
    const elapsed = period.to - period.first + 1;
    const monthSales = Math.round((MONTHLY_SALES * elapsed) / monthDays);
    let assigned = 0;
    const goals = branches.map((branch, b) => {
      const target =
        b === branches.length - 1
          ? monthSales - assigned
          : Math.round(monthSales * branch.share);
      assigned += target;
      const have = existing[p].get(branch.id) ?? {
        sales: 0,
        revenue: 0,
        cost: 0,
      };
      const n = target - have.sales;
      const revenue = target * TARGET_TICKET - have.revenue;
      if (n <= 0 || revenue / n < 40_000 || revenue / n > 120_000) {
        throw new Error(
          `${period.name} en ${branch.name}: ya hay ${have.sales} ventas por ${money(have.revenue)}; no se puede llegar a ${target} con ticket de ${money(TARGET_TICKET)}.`,
        );
      }
      return { n, revenue, have };
    });
    // La ganancia del mes (las dos sedes) debe dar TARGET_MARGIN: el costo que
    // les falta a las ventas nuevas se reparte según lo que vende cada sede, y
    // la última cubre lo que las anteriores quedaron lejos de su parte.
    const newRevenue = goals.reduce((sum, g) => sum + g.revenue, 0);
    const neededCost =
      (1 - TARGET_MARGIN) *
        goals.reduce((sum, g) => sum + g.revenue + g.have.revenue, 0) -
      goals.reduce((sum, g) => sum + g.have.cost, 0);
    let costMiss = 0;

    branches.forEach((branch, b) => {
      const { n, revenue } = goals[b];
      const cost = (neededCost * revenue) / newRevenue + costMiss;
      const tickets = shuffle(pickTickets(n, revenue, cost, sample, costOf));
      costMiss = cost - ticketsCost(tickets, costOf);

      const days = range(period.from, period.to).map(
        (ord) => branch.days.get(ord)!,
      );
      const counts = allocate(
        n,
        days.map((d) => d.weight),
      );
      const slots = days.flatMap((d, i) =>
        Array.from({ length: counts[i] }, () => {
          for (let k = 0; k < 10_000; k++) {
            const s = saleSecond(d);
            if (localTime(d.day, s) > branch.notBefore) return s;
          }
          throw new Error(
            `${branch.name} ya tiene ventas después del cierre del día ${dayOfMonth(d.day)}.`,
          );
        })
          .sort((x, y) => x - y)
          .map((s) => ({ day: d, at: localTime(d.day, s) })),
      );
      const credit = new Set(
        branch.customerIds.length > 0
          ? shuffle([...Array(n).keys()]).slice(0, Math.round(n * CREDIT_SHARE))
          : [],
      );

      slots.forEach((slot, i) => {
        const ticket = tickets[i];
        const saleId = randomUUID();
        const total = ticketTotal(ticket);
        const isCredit = credit.has(i);
        const customerId = isCredit ? pick(branch.customerIds) : null;
        plan.sales.push({
          id: saleId,
          invoiceNumber: branch.nextInvoice++,
          total,
          isCredit,
          status: 'COMPLETED',
          branchId: branch.id,
          userId: branch.userId,
          customerId,
          cashSessionId: slot.day.sessionId,
          createdAt: slot.at,
          updatedAt: slot.at,
        });
        for (const line of ticket.lines) {
          const detailId = randomUUID();
          plan.saleDetails.push({
            id: detailId,
            saleId,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.price,
            discount: line.discount,
            discountReason: line.discountReason,
            subtotal: line.price * line.quantity - line.discount,
            createdAt: slot.at,
            updatedAt: slot.at,
          });
          plan.movements.push({
            id: randomUUID(),
            inventoryId: inventoryFor(branch, line.productId),
            productId: line.productId,
            branchId: branch.id,
            quantity: -line.quantity,
            type: 'SALE',
            saleDetailId: detailId,
            createdAt: slot.at,
          });
          const key = `${branch.id}|${line.productId}`;
          sold.set(key, (sold.get(key) ?? 0) + line.quantity);
        }
        const payments = salePaymentsFor(total, isCredit);
        for (const pay of payments) {
          plan.salePayments.push({
            id: randomUUID(),
            saleId,
            amount: pay.amount,
            paymentMethod: pay.method,
            createdAt: slot.at,
          });
          if (pay.method === 'CASH') slot.day.cash += pay.amount;
        }
        if (!isCredit) return;

        const loanId = randomUUID();
        const amount = total - payments.reduce((sum, x) => sum + x.amount, 0);
        const paid = addLoanPayments(
          plan,
          branch,
          loanId,
          amount,
          slot.day.day + randInt(2, 9),
          0,
        );
        plan.loans.push({
          id: loanId,
          originalAmount: amount,
          pendingAmount: paid.pending,
          saleId,
          customerId: customerId!,
          loanStatus: paid.pending > 0 ? 'ACTIVE' : 'PAID',
          createdAt: slot.at,
          updatedAt: paid.last ?? slot.at,
        });
      });
    });
  });

  // Préstamos de octubre con saldo: el abono que no alcanzó a caer antes del
  // 27 cae ahora (de 2 a 9 días después del último movimiento).
  for (const loan of activeLoans) {
    if (loan.payments >= 3) continue;
    const last = ordinal(loan.lastActivity);
    const minGap = Math.max(2, START - last);
    if (minGap > 9) continue;
    const branch = branches.find((b) => b.id === loan.branchId)!;
    const paid = addLoanPayments(
      plan,
      branch,
      loan.id,
      loan.pendingAmount,
      last + randInt(minGap, 9),
      loan.payments,
    );
    if (!paid.last) continue;
    plan.loanUpdates.push({
      previous: {
        id: loan.id,
        pendingAmount: loan.pendingAmount,
        loanStatus: 'ACTIVE',
        updatedAt: loan.updatedAt.toISOString(),
      },
      next: {
        id: loan.id,
        pendingAmount: paid.pending,
        loanStatus: paid.pending > 0 ? 'ACTIVE' : 'PAID',
        updatedAt: paid.last.toISOString(),
      },
    });
  }

  // Cada caja cierra con lo esperado: base + efectivo recibido.
  for (const branch of branches) {
    for (const d of branch.days.values()) {
      plan.cashSessions.push({
        id: d.sessionId,
        branchId: branch.id,
        openedById: branch.userId,
        openingAmount: branch.openingAmount,
        closingAmount: branch.openingAmount + d.cash,
        status: 'CLOSED',
        openedAt: localTime(d.day, d.openAt),
        closedAt: localTime(d.day, d.closeAt),
      });
    }
  }

  // Compra al proveedor el 27 antes de abrir: cubre lo vendido.
  const stockInAt = localTime(START, 7 * 3600 + 30 * 60);
  for (const [key, units] of sold) {
    const [branchId, productId] = key.split('|');
    const newId = newInventory.get(key);
    const leftover = newId ? randInt(3, 12) : 0;
    if (newId) {
      plan.inventories.push({
        id: newId,
        branchId,
        productId,
        amount: leftover,
        createdAt: stockInAt,
        updatedAt: stockInAt,
      });
    }
    plan.movements.push({
      id: randomUUID(),
      inventoryId:
        newId ??
        branches.find((b) => b.id === branchId)!.inventoryIds.get(productId)!,
      productId,
      branchId,
      quantity: units + leftover,
      type: 'STOCK_IN',
      note: 'Compra a proveedor',
      createdAt: stockInAt,
    });
  }

  return plan;
}

// --- Resumen ----------------------------------------------------------------

const invoice = (n: number) => `F${String(n).padStart(4, '0')}`;

function printSummary(
  plan: Plan,
  branches: Branch[],
  existing: Map<string, MonthTotals>[],
  costOf: Map<string, number>,
  names: Map<string, string>,
) {
  const detailsBySale = new Map<string, Prisma.SaleDetailCreateManyInput[]>();
  for (const d of plan.saleDetails) {
    detailsBySale.set(d.saleId, [...(detailsBySale.get(d.saleId) ?? []), d]);
  }
  const saleCost = (saleId: string) =>
    detailsBySale
      .get(saleId)!
      .reduce((sum, d) => sum + costOf.get(d.productId)! * d.quantity, 0);

  PERIODS.forEach((period, p) => {
    const from = localTime(period.from, 0).getTime();
    const to = localTime(period.to + 1, 0).getTime();
    const month = { sales: 0, revenue: 0, cost: 0 };
    console.log(
      `\n${period.name} (días ${dayOfMonth(period.from)} a ${dayOfMonth(period.to)}):`,
    );
    for (const branch of branches) {
      const sales = plan.sales.filter(
        (s) =>
          s.branchId === branch.id &&
          new Date(s.createdAt!).getTime() >= from &&
          new Date(s.createdAt!).getTime() < to,
      );
      const revenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
      const cost = sales.reduce((sum, s) => sum + saleCost(s.id!), 0);
      const have = existing[p].get(branch.id) ?? {
        sales: 0,
        revenue: 0,
        cost: 0,
      };
      const all = {
        sales: have.sales + sales.length,
        revenue: have.revenue + revenue,
        cost: have.cost + cost,
      };
      month.sales += all.sales;
      month.revenue += all.revenue;
      month.cost += all.cost;
      console.log(
        `  ${branch.name}: ${sales.length} ventas nuevas (${invoice(sales[0].invoiceNumber)}–${invoice(sales[sales.length - 1].invoiceNumber)}) por ${money(revenue)} · ganancia ${((100 * (revenue - cost)) / revenue).toFixed(2)} %`,
      );
      console.log(
        `    mes completo: ${all.sales} ventas · ${money(all.revenue)} · ticket ${money(all.revenue / all.sales)} · ganancia ${money(all.revenue - all.cost)} (${((100 * (all.revenue - all.cost)) / all.revenue).toFixed(2)} %)`,
      );
    }
    console.log(
      `  Total del mes: ${month.sales} ventas · ${money(month.revenue)} · ticket ${money(month.revenue / month.sales)} · ganancia ${money(month.revenue - month.cost)} (${((100 * (month.revenue - month.cost)) / month.revenue).toFixed(2)} %)`,
    );
  });

  console.log('');
  for (const branch of branches) {
    const sales = plan.sales.filter((s) => s.branchId === branch.id);
    const saleIds = new Set(sales.map((s) => s.id));
    const perDay = new Map<number, number>();
    for (const s of sales) {
      const d = dayOfMonth(ordinal(new Date(s.createdAt!)));
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    const units = new Map<string, number>();
    for (const d of plan.saleDetails) {
      if (saleIds.has(d.saleId)) {
        units.set(d.productId, (units.get(d.productId) ?? 0) + d.quantity);
      }
    }
    const loans = plan.loans.filter((l) => saleIds.has(l.saleId));
    const sessionIds = new Set(
      plan.cashSessions
        .filter((c) => c.branchId === branch.id)
        .map((c) => c.id),
    );
    console.log(
      `${branch.name}: por día ${[...perDay].map(([d, n]) => `${d}:${n}`).join(' ')} · ${loans.length} a crédito · ${plan.loanPayments.filter((x) => sessionIds.has(x.cashSessionId!)).length} abonos · ${sessionIds.size} cajas`,
    );
    console.log(
      `  más vendidos: ${[...units]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, n]) => `${names.get(id)} (${n})`)
        .join(' · ')}`,
    );
  }
  const paidOff = plan.loanUpdates.filter(
    (u) => u.next.loanStatus === 'PAID',
  ).length;
  console.log(
    `Préstamos de octubre que reciben abonos: ${plan.loanUpdates.length} (${paidOff} quedan pagados)`,
  );
  console.log(
    `Inventario: ${plan.movements.length} movimientos (${plan.movements.filter((m) => m.type === 'STOCK_IN').length} entradas), ${plan.inventories.length} registros nuevos`,
  );
}

// --- Base de datos ----------------------------------------------------------

interface Manifest {
  createdAt: string;
  inventories: string[];
  cashSessions: string[];
  sales: string[];
  saleDetails: string[];
  salePayments: string[];
  loans: string[];
  loanPayments: string[];
  movements: string[];
  loanUpdates: LoanUpdate[]; // estado anterior de los préstamos de octubre
}

async function monthTotals(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<
    { branchId: string; sales: number; revenue: number; cost: number }[]
  >`
    SELECT s."branchId",
           COUNT(DISTINCT s."id")::int AS sales,
           COALESCE(SUM(sd."subtotal" - COALESCE(r."refunded", 0)), 0)::float AS revenue,
           COALESCE(SUM(p."purchasePrice" * (sd."quantity" - COALESCE(r."units", 0))), 0)::float AS cost
    FROM "Sale" s
    JOIN "SaleDetail" sd ON sd."saleId" = s."id"
    JOIN "Product" p ON p."id" = sd."productId"
    LEFT JOIN (
      SELECT "saleDetailId", SUM("quantity") AS "units", SUM("refundAmount") AS "refunded"
      FROM "SaleReturn" GROUP BY "saleDetailId"
    ) r ON r."saleDetailId" = sd."id"
    WHERE s."status" = 'COMPLETED' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
    GROUP BY s."branchId"
  `;
  return new Map(rows.map((r) => [r.branchId, r]));
}

async function main() {
  if (REMOVE) return remove();
  if (fs.existsSync(MANIFEST)) {
    throw new Error(
      `La continuación ya está cargada (${path.basename(MANIFEST)}). Bórrala con --remove antes de volver a cargarla.`,
    );
  }
  if (!fs.existsSync(OCTOBER_MANIFEST)) {
    throw new Error('Primero carga demo-octubre.ts --apply.');
  }
  const october = JSON.parse(fs.readFileSync(OCTOBER_MANIFEST, 'utf8')) as {
    loans: string[];
  };

  const sessions = await prisma.cashSession.count({
    where: {
      openedAt: { gte: localTime(START, 0), lt: localTime(END + 1, 0) },
    },
  });
  if (sessions > 0) {
    throw new Error(
      `Ya hay ${sessions} cajas abiertas entre el 27 de octubre y hoy: no se cargan días que ya tienen caja.`,
    );
  }

  const allBranches = await prisma.branch.findMany();
  const branches: Branch[] = [];
  for (const cfg of BRANCHES) {
    const branch = allBranches.find(
      (b) => nameKey(b.name) === nameKey(cfg.name),
    );
    if (!branch) throw new Error(`No existe la sucursal "${cfg.name}".`);
    const cashier = await prisma.user.findFirst({
      where: { branchId: branch.id, role: 'CASHIER' },
      orderBy: { createdAt: 'asc' },
    });
    if (!cashier) throw new Error(`${cfg.name} no tiene vendedor.`);
    const customers = await prisma.customer.findMany({
      where: { branchId: branch.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const inventory = await prisma.inventory.findMany({
      where: { branchId: branch.id },
      select: { id: true, productId: true },
    });
    const last = await prisma.sale.findFirst({
      where: { branchId: branch.id },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const latest = await prisma.sale.findFirst({
      where: { branchId: branch.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    branches.push({
      id: branch.id,
      name: branch.name,
      share: cfg.share,
      openingAmount: cfg.openingAmount,
      userId: cashier.id,
      customerIds: customers.map((c) => c.id),
      inventoryIds: new Map(inventory.map((i) => [i.productId, i.id])),
      nextInvoice: (last?.invoiceNumber ?? 0) + 1,
      notBefore: latest?.createdAt ?? localTime(1, 0),
      days: new Map(),
    });
  }

  // Mismo catálogo y en el mismo orden que demo-octubre: con su semilla se
  // repite la popularidad de cada pantalla.
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      retailPrice: true,
      salePrice: true,
      purchasePrice: true,
    },
    orderBy: { barcode: 'asc' },
  });
  const catalog: CatalogItem[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    price:
      Number(p.retailPrice) > 0 ? Number(p.retailPrice) : Number(p.salePrice),
    cost: Number(p.purchasePrice),
  }));
  reseed(SEED);
  const products = withPopularity(catalog).filter((p) => p.cost > 0);
  const uncosted = catalog.filter((p) => p.price > 0 && p.cost === 0).length;
  if (uncosted > 0) {
    console.log(
      `Aviso: ${uncosted} productos sin costo de compra no se venden.\n`,
    );
  }
  reseed(20261102);
  for (const b of branches) b.days = buildDays();
  const costOf = new Map(catalog.map((p) => [p.id, p.cost]));

  const existing = await Promise.all(
    PERIODS.map((p) =>
      monthTotals(localTime(p.first, 0), localTime(p.last + 1, 0)),
    ),
  );

  const loans = await prisma.loan.findMany({
    where: { id: { in: october.loans }, loanStatus: 'ACTIVE' },
    include: {
      payments: { select: { createdAt: true }, orderBy: { createdAt: 'asc' } },
      sale: { select: { branchId: true, createdAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const activeLoans = loans.map((l) => ({
    id: l.id,
    branchId: l.sale.branchId,
    pendingAmount: Number(l.pendingAmount),
    updatedAt: l.updatedAt,
    payments: l.payments.length,
    lastActivity: l.payments.at(-1)?.createdAt ?? l.sale.createdAt,
  }));

  const plan = buildPlan(products, branches, existing, costOf, activeLoans);
  printSummary(
    plan,
    branches,
    existing,
    costOf,
    new Map(catalog.map((p) => [p.id, p.name])),
  );

  const now = new Date();
  const future = [
    ...plan.sales.map((s) => s.createdAt),
    ...plan.loanPayments.map((x) => x.createdAt),
    ...plan.cashSessions.map((c) => c.closedAt),
  ].filter((d) => new Date(d!) > now).length;
  if (future > 0) {
    throw new Error(
      `${future} registros quedarían en el futuro: hoy la caja aún no ha cerrado. Corre el script después del cierre.`,
    );
  }

  if (!APPLY) {
    console.log(
      '\n-- SIMULACIÓN: no se escribió nada. Añade --apply para cargarlo. --',
    );
    return;
  }

  const manifest: Manifest = {
    createdAt: now.toISOString(),
    inventories: ids(plan.inventories),
    cashSessions: ids(plan.cashSessions),
    sales: ids(plan.sales),
    saleDetails: ids(plan.saleDetails),
    salePayments: ids(plan.salePayments),
    loans: ids(plan.loans),
    loanPayments: ids(plan.loanPayments),
    movements: ids(plan.movements),
    loanUpdates: plan.loanUpdates.map((u) => u.previous),
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest));

  try {
    await prisma.$transaction(async (tx) => {
      for (const data of chunks(plan.inventories))
        await tx.inventory.createMany({ data });
      for (const data of chunks(plan.cashSessions))
        await tx.cashSession.createMany({ data });
      for (const data of chunks(plan.sales)) await tx.sale.createMany({ data });
      for (const data of chunks(plan.saleDetails))
        await tx.saleDetail.createMany({ data });
      for (const data of chunks(plan.salePayments))
        await tx.salePayment.createMany({ data });
      for (const data of chunks(plan.loans)) await tx.loan.createMany({ data });
      for (const data of chunks(plan.loanPayments))
        await tx.loanPayment.createMany({ data });
      for (const data of chunks(plan.movements))
        await tx.inventoryMovement.createMany({ data });
      for (const { next } of plan.loanUpdates) {
        await tx.loan.update({
          where: { id: next.id },
          data: {
            pendingAmount: next.pendingAmount,
            loanStatus: next.loanStatus,
            updatedAt: new Date(next.updatedAt),
          },
        });
      }
    }, TX);
  } catch (e) {
    fs.unlinkSync(MANIFEST);
    throw e;
  }
  console.log('\nListo: datos cargados. Para borrarlos: --remove');
}

async function remove() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(
      `La continuación no está cargada (falta ${path.basename(MANIFEST)}).`,
    );
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Manifest;
  await prisma.$transaction(async (tx) => {
    const byId = (list: string[]) => ({ id: { in: list } });
    await tx.inventoryMovement.deleteMany({ where: byId(m.movements) });
    await tx.loanPayment.deleteMany({ where: byId(m.loanPayments) });
    await tx.loan.deleteMany({ where: byId(m.loans) });
    await tx.salePayment.deleteMany({ where: byId(m.salePayments) });
    await tx.saleDetail.deleteMany({ where: byId(m.saleDetails) });
    await tx.sale.deleteMany({ where: byId(m.sales) });
    await tx.cashSession.deleteMany({ where: byId(m.cashSessions) });
    await tx.inventory.deleteMany({
      where: { ...byId(m.inventories), movements: { none: {} } },
    });
    for (const loan of m.loanUpdates) {
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          pendingAmount: loan.pendingAmount,
          loanStatus: loan.loanStatus,
          updatedAt: new Date(loan.updatedAt),
        },
      });
    }
  }, TX);
  fs.unlinkSync(MANIFEST);
  console.log(
    `Borrado: ${m.sales.length} ventas, ${m.loans.length} préstamos, ${m.loanPayments.length} abonos, ${m.cashSessions.length} cajas y ${m.movements.length} movimientos; ${m.loanUpdates.length} préstamos de octubre restaurados.`,
  );
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
