/**
 * Ventas ficticias de octubre de 2026 para la demostración del proyecto.
 *
 * Carga ventas al ritmo de 2.000 al mes del 1 al 26 de octubre (1.677),
 * repartidas entre Aguachica y Ocaña en proporción 5:3 (la misma de su
 * consumo de papel), con ticket promedio de $70.000 exactos en cada sede y
 * margen de ganancia de 35,7 %. Cada día cada sede abre y cierra caja; ~5 %
 * de las ventas son a crédito y reciben abonos en los días siguientes. Cada
 * venta deja su movimiento de inventario, y una entrada de mercancía el 1 de
 * octubre cubre lo vendido, así que el stock actual no cambia.
 *
 * A los productos con costo de compra 0 se les pone un costo proporcional a
 * su precio, el que hace que la ganancia total dé 35,7 %.
 *
 * Uso (desde backend/):
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-octubre.ts           # simulación
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-octubre.ts --apply   # escribe
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-octubre.ts --remove  # borra lo cargado
 *
 * Lo cargado queda listado en prisma/demo-octubre.manifest.json; --remove
 * borra exactamente eso y devuelve los costos de compra que se cambiaron.
 */
import 'dotenv/config';
import { PrismaClient, Prisma, type PaymentMethod } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const MANIFEST = path.join(__dirname, 'demo-octubre.manifest.json');

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// --- Parámetros (datos del documento) --------------------------------------
const YEAR = 2026;
const MONTH = 10;
const DAYS_IN_MONTH = 31;
const LAST_DAY = 26; // del 1 al 26 de octubre: hasta hoy
const MONTHLY_SALES = 2000;
const TARGET_TICKET = 70_000;
const TARGET_MARGIN = 0.357;
const CREDIT_SHARE = 0.05;

const BRANCHES = [
  { name: 'Aguachica', share: 5 / 8, openingAmount: 200_000 },
  { name: 'Ocaña', share: 3 / 8, openingAmount: 150_000 },
];

// Clientes (técnicos y locales) para las ventas a crédito, si la sede tiene
// menos de 8.
const CUSTOMERS: Record<string, [string, string][]> = {
  aguachica: [
    ['Carlos', 'Quintero'],
    ['Yesica', 'Pallares'],
    ['Luis Fernando', 'Ropero'],
    ['Mayerly', 'Durán'],
    ['Jhon Jairo', 'Ortega'],
    ['Deivis', 'Barbosa'],
    ['Kelly Johana', 'Rincón'],
    ['Over Alfonso', 'Páez'],
  ],
  ocana: [
    ['Yeison', 'Navarro'],
    ['Marta Lucía', 'Pacheco'],
    ['Edwin', 'Sanguino'],
    ['Leidy', 'Carrascal'],
    ['Fabián', 'Jácome'],
    ['Dairo', 'Arévalo'],
    ['Sandra Milena', 'Lobo'],
    ['Wilmer', 'Bayona'],
  ],
};

// Lunes festivo (Día de la Diversidad Étnica y Cultural).
const HOLIDAYS = [12];
// Peso de cada día de la semana (domingo = 0) y de los días de pago.
const WEEKDAY_WEIGHT = [0.55, 0.9, 0.85, 0.9, 0.95, 1.1, 1.35];
const HOLIDAY_WEIGHT = 0.7;
const PAYDAYS = [1, 15, 16, 30, 31];
// Ventas por hora: de lunes a sábado de 8 a. m. a 7 p. m.; domingos y
// festivos de 9 a. m. a 1:30 p. m.
const HOURS: [number, number][] = [
  [8, 0.5],
  [9, 0.9],
  [10, 1.2],
  [11, 1.3],
  [12, 0.9],
  [13, 0.6],
  [14, 0.9],
  [15, 1.1],
  [16, 1.2],
  [17, 1.1],
  [18, 0.7],
];
const SHORT_DAY_HOURS: [number, number][] = [
  [9, 0.9],
  [10, 1.2],
  [11, 1.3],
  [12, 1.0],
  [13, 0.4],
];
// 85 % de las ventas son una pantalla, 7 % dos iguales y 8 % dos distintas.
const ITEMS_PER_TICKET = 0.85 + 0.07 * 2 + 0.08 * 2;
const DISCOUNT_REASONS = [
  'Cliente frecuente',
  'Pago de contado',
  'Técnico del sector',
];

// --- Azar reproducible ------------------------------------------------------
// Con semilla fija: la simulación y --apply generan los mismos datos (salvo
// los ids) mientras la BD no cambie.
let seed = 20261026;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min: number, max: number) =>
  min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];
const weighted = <T>(options: [T, number][]) => {
  let x = rand() * options.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, w] of options) {
    x -= w;
    if (x < 0) return value;
  }
  return options[options.length - 1][0];
};
const gaussian = () =>
  Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const shuffle = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
const thousands = (n: number) => Math.floor(n / 1000) * 1000;

// Instante de una hora de Colombia (UTC-5) de octubre: segundos desde la
// medianoche local.
const localTime = (day: number, seconds: number) =>
  new Date(Date.UTC(YEAR, MONTH - 1, day, 5) + seconds * 1000);

const nameKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// --- Plan -------------------------------------------------------------------

export interface CatalogItem {
  id: string;
  name: string;
  price: number; // precio al detal
  cost: number; // costo de compra actual (0 = sin costear)
}

interface Product extends CatalogItem {
  popularity: number;
}

export interface BranchInput {
  id: string;
  name: string;
  share: number;
  openingAmount: number;
  userId: string;
  nextInvoice: number;
  customerIds: string[];
  // Inventario que ya existe en la sede: productId -> id.
  inventoryIds: Map<string, string>;
}

interface Line {
  productId: string;
  price: number;
  quantity: number;
  discount: number;
  discountReason: string | null;
}

interface Ticket {
  lines: Line[];
}

interface Day {
  day: number;
  short: boolean;
  openAt: number; // segundos desde la medianoche
  closeAt: number;
  weight: number;
  sessionId: string;
  cash: number;
}

export interface Plan {
  cashSessions: Prisma.CashSessionCreateManyInput[];
  sales: Prisma.SaleCreateManyInput[];
  saleDetails: Prisma.SaleDetailCreateManyInput[];
  salePayments: Prisma.SalePaymentCreateManyInput[];
  loans: Prisma.LoanCreateManyInput[];
  loanPayments: Prisma.LoanPaymentCreateManyInput[];
  inventories: Prisma.InventoryCreateManyInput[];
  movements: Prisma.InventoryMovementCreateManyInput[];
  productCosts: { id: string; previous: number; cost: number }[];
}

const ticketTotal = (t: Ticket) =>
  t.lines.reduce((sum, l) => sum + l.price * l.quantity - l.discount, 0);

const newLine = (p: Product, quantity: number): Line => ({
  productId: p.id,
  price: p.price,
  quantity,
  discount: 0,
  discountReason: null,
});

// Descuento en miles sobre una línea, de máximo 10 % de la línea. Devuelve
// lo que de verdad se descontó.
function discount(line: Line, amount: number, reason: string) {
  const room = thousands(line.price * line.quantity * 0.1) - line.discount;
  const applied = Math.max(0, Math.min(amount, room));
  if (applied > 0) {
    line.discount += applied;
    line.discountReason = reason;
  }
  return applied;
}

// Se venden más las pantallas baratas: el peso de cada producto es su
// popularidad × e^(−λ·precio), con λ tal que el ticket esperado sea el
// objetivo.
function productSampler(products: Product[]) {
  const min = Math.min(...products.map((p) => p.price));
  const weights = (lambda: number) =>
    products.map((p) => p.popularity * Math.exp(-lambda * (p.price - min)));
  const expectedTicket = (lambda: number) => {
    const w = weights(lambda);
    const total = w.reduce((a, b) => a + b, 0);
    return (
      (w.reduce((sum, x, i) => sum + x * products[i].price, 0) / total) *
      ITEMS_PER_TICKET
    );
  };
  let lo = -1e-4;
  let hi = 1e-3;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (expectedTicket(mid) > TARGET_TICKET) lo = mid;
    else hi = mid;
  }

  const cumulative: number[] = [];
  let total = 0;
  for (const w of weights((lo + hi) / 2)) cumulative.push((total += w));
  return () => {
    const x = rand() * total;
    let a = 0;
    let b = cumulative.length - 1;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (cumulative[mid] < x) a = mid + 1;
      else b = mid;
    }
    return products[a];
  };
}

function makeTicket(sample: () => Product): Ticket {
  const first = sample();
  const kind = rand();
  const lines = [newLine(first, kind >= 0.85 && kind < 0.92 ? 2 : 1)];
  if (kind >= 0.92) {
    let second = sample();
    for (let i = 0; second.id === first.id && i < 10; i++) second = sample();
    if (second.id === first.id) lines[0].quantity = 2;
    else lines.push(newLine(second, 1));
  }
  if (rand() < 0.04) {
    discount(lines[0], 1000 * randInt(2, 5), pick(DISCOUNT_REASONS));
  }
  return { lines };
}

// Ventas de una sede con promedio exacto TARGET_TICKET: de varios intentos se
// toma el que queda apenas por encima y el excedente se reparte en
// descuentos pequeños.
function ticketsWithAverage(n: number, sample: () => Product) {
  const target = n * TARGET_TICKET;
  let best: Ticket[] | null = null;
  let excess = Infinity;
  for (let attempt = 0; attempt < 5000 && excess > 30_000; attempt++) {
    const tickets = Array.from({ length: n }, () => makeTicket(sample));
    const diff = tickets.reduce((sum, t) => sum + ticketTotal(t), 0) - target;
    if (diff >= 0 && diff < excess) {
      best = tickets;
      excess = diff;
    }
  }
  if (!best) {
    throw new Error('No se logró el ticket promedio con los precios actuales');
  }
  for (const t of shuffle(best.filter((t) => t.lines[0].discount === 0))) {
    if (excess === 0) break;
    excess -= discount(
      t.lines[0],
      Math.min(excess, 1000 * randInt(1, 5)),
      'Cliente frecuente',
    );
  }
  return best;
}

function saleSecond(d: Day) {
  for (;;) {
    const hour = weighted(d.short ? SHORT_DAY_HOURS : HOURS);
    const s = Math.floor((hour + rand()) * 3600);
    if (s >= d.openAt + 600 && s <= d.closeAt - 900) return s;
  }
}

// Reparte `total` según los pesos (método del mayor residuo).
function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const counts = raw.map(Math.floor);
  const order = raw
    .map((r, i) => [r - counts[i], i])
    .sort((a, b) => b[0] - a[0]);
  let rest = total - counts.reduce((a, b) => a + b, 0);
  for (const [, i] of order) {
    if (rest-- <= 0) break;
    counts[i]++;
  }
  return counts;
}

function salePaymentsFor(total: number, credit: boolean) {
  const payments: { method: PaymentMethod; amount: number }[] = [];
  if (credit) {
    // La mitad de los préstamos deja una cuota inicial.
    if (rand() < 0.5) {
      payments.push({
        method: weighted<PaymentMethod>([
          ['CASH', 0.7],
          ['NEQUI', 0.3],
        ]),
        amount: thousands(total * (0.2 + rand() * 0.3)),
      });
    }
  } else if (rand() < 0.06) {
    const cash = thousands(total * (0.3 + rand() * 0.4));
    payments.push({ method: 'CASH', amount: cash });
    payments.push({
      method: pick<PaymentMethod>(['NEQUI', 'BANCOLOMBIA']),
      amount: total - cash,
    });
  } else {
    payments.push({
      method: weighted<PaymentMethod>([
        ['CASH', 0.55],
        ['NEQUI', 0.25],
        ['BANCOLOMBIA', 0.2],
      ]),
      amount: total,
    });
  }
  return payments;
}

export function buildPlan(catalog: CatalogItem[], branches: BranchInput[]) {
  const products: Product[] = catalog
    .filter((p) => p.price > 0)
    .map((p) => ({ ...p, popularity: Math.exp(0.9 * gaussian()) }));
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
    productCosts: [],
  };

  // Unidades vendidas e inventario nuevo por sede y producto.
  const sold = new Map<string, number>();
  const newInventory = new Map<string, string>();
  const inventoryFor = (branch: BranchInput, productId: string) => {
    const existing = branch.inventoryIds.get(productId);
    if (existing) return existing;
    const key = `${branch.id}|${productId}`;
    if (!newInventory.has(key)) newInventory.set(key, randomUUID());
    return newInventory.get(key)!;
  };

  const totalSales = Math.round((MONTHLY_SALES * LAST_DAY) / DAYS_IN_MONTH);
  let assigned = 0;
  branches.forEach((branch, b) => {
    const n =
      b === branches.length - 1
        ? totalSales - assigned
        : Math.round(totalSales * branch.share);
    assigned += n;

    const days: Day[] = Array.from({ length: LAST_DAY }, (_, i) => {
      const day = i + 1;
      const weekday = new Date(Date.UTC(YEAR, MONTH - 1, day)).getUTCDay();
      const holiday = HOLIDAYS.includes(day);
      const short = weekday === 0 || holiday;
      return {
        day,
        short,
        // Caja: abre 7:50–8:05 y cierra 7:00–7:25 p. m.; domingos y
        // festivos abre 8:50–9:05 y cierra 1:30–1:55 p. m.
        openAt:
          (short ? 8 * 3600 + 50 * 60 : 7 * 3600 + 50 * 60) + randInt(0, 900),
        closeAt: (short ? 13 * 3600 + 30 * 60 : 19 * 3600) + randInt(0, 1500),
        weight:
          (holiday ? HOLIDAY_WEIGHT : WEEKDAY_WEIGHT[weekday]) *
          (PAYDAYS.includes(day) ? 1.15 : 1) *
          (0.85 + 0.3 * rand()),
        sessionId: randomUUID(),
        cash: 0,
      };
    });

    // Hora de cada venta, en orden: el número de factura sigue ese orden.
    const counts = allocate(
      n,
      days.map((d) => d.weight),
    );
    const slots = days.flatMap((d, i) =>
      Array.from({ length: counts[i] }, () => saleSecond(d))
        .sort((x, y) => x - y)
        .map((s) => ({ day: d, at: localTime(d.day, s) })),
    );
    const tickets = shuffle(ticketsWithAverage(n, sample));
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
        invoiceNumber: branch.nextInvoice + i,
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
      for (const p of payments) {
        plan.salePayments.push({
          id: randomUUID(),
          saleId,
          amount: p.amount,
          paymentMethod: p.method,
          createdAt: slot.at,
        });
        if (p.method === 'CASH') slot.day.cash += p.amount;
      }
      if (!isCredit) return;

      // Préstamo con abonos cada 2 a 9 días mientras haya saldo (hasta hoy).
      const loanId = randomUUID();
      const amount = total - payments.reduce((sum, p) => sum + p.amount, 0);
      let pending = amount;
      let day = slot.day.day;
      let lastPayment = slot.at;
      for (let k = 0; k < 3 && pending > 0; k++) {
        day += randInt(2, 9);
        if (day > LAST_DAY) break;
        const d = days[day - 1];
        let paid =
          rand() < 0.5 ? pending : thousands(pending * (0.3 + rand() * 0.4));
        if (paid <= 0) paid = pending;
        const method = weighted<PaymentMethod>([
          ['CASH', 0.6],
          ['NEQUI', 0.25],
          ['BANCOLOMBIA', 0.15],
        ]);
        lastPayment = localTime(day, saleSecond(d));
        plan.loanPayments.push({
          id: randomUUID(),
          loanId,
          amount: paid,
          paymentMethod: method,
          cashSessionId: d.sessionId,
          createdAt: lastPayment,
        });
        if (method === 'CASH') d.cash += paid;
        pending -= paid;
      }
      plan.loans.push({
        id: loanId,
        originalAmount: amount,
        pendingAmount: pending,
        saleId,
        customerId: customerId!,
        loanStatus: pending > 0 ? 'ACTIVE' : 'PAID',
        createdAt: slot.at,
        updatedAt: lastPayment,
      });
    });

    // Cada caja cierra con lo esperado: base + efectivo recibido.
    for (const d of days) {
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
  });

  // Entrada de mercancía el 1 de octubre antes de abrir: cubre lo vendido
  // (el stock actual no cambia). En inventario nuevo deja algunas unidades.
  const stockInAt = localTime(1, 7 * 3600 + 30 * 60);
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

  // Costo a los productos sin costear: el mismo porcentaje del precio para
  // todos, el que deja la ganancia total en TARGET_MARGIN.
  const byId = new Map(products.map((p) => [p.id, p]));
  let revenue = 0;
  let fixedCost = 0;
  let freeGross = 0;
  for (const d of plan.saleDetails) {
    const p = byId.get(d.productId)!;
    revenue += Number(d.subtotal);
    if (p.cost > 0) fixedCost += p.cost * d.quantity;
    else freeGross += p.price * d.quantity;
  }
  if (freeGross > 0) {
    const ratio = ((1 - TARGET_MARGIN) * revenue - fixedCost) / freeGross;
    plan.productCosts = products
      .filter((p) => p.cost === 0)
      .map((p) => ({
        id: p.id,
        previous: 0,
        cost: Math.round((ratio * p.price) / 100) * 100,
      }));

    // Redondear a cientos mueve la ganancia unas centésimas: se compensa
    // subiendo o bajando $100 el costo de los más vendidos.
    const units = new Map<string, number>();
    for (const d of plan.saleDetails) {
      units.set(d.productId, (units.get(d.productId) ?? 0) + d.quantity);
    }
    let gap =
      (1 - TARGET_MARGIN) * revenue -
      fixedCost -
      plan.productCosts.reduce(
        (sum, c) => sum + c.cost * (units.get(c.id) ?? 0),
        0,
      );
    const step = Math.sign(gap) * 100;
    const bestSellers = [...plan.productCosts].sort(
      (a, b) => (units.get(b.id) ?? 0) - (units.get(a.id) ?? 0),
    );
    for (const c of bestSellers) {
      const k = units.get(c.id) ?? 0;
      if (k === 0) break;
      if (Math.abs(step * k) <= Math.abs(gap)) {
        c.cost += step;
        gap -= step * k;
      }
    }
  }

  return plan;
}

// --- Resumen ----------------------------------------------------------------

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

export function printSummary(
  plan: Plan,
  catalog: CatalogItem[],
  branches: BranchInput[],
) {
  const cost = new Map(catalog.map((p) => [p.id, p.cost]));
  for (const c of plan.productCosts) cost.set(c.id, c.cost);
  const names = new Map(catalog.map((p) => [p.id, p.name]));

  let revenue = 0;
  let costs = 0;
  for (const b of branches) {
    const sales = plan.sales.filter((s) => s.branchId === b.id);
    const ids = new Set(sales.map((s) => s.id));
    const rev = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const c = plan.saleDetails
      .filter((d) => ids.has(d.saleId))
      .reduce((sum, d) => sum + cost.get(d.productId)! * d.quantity, 0);
    const loans = plan.loans.filter((l) => ids.has(l.saleId));
    const loanIds = new Set(loans.map((l) => l.id));
    const days = new Set(
      sales.map((s) =>
        new Date(new Date(s.createdAt!).getTime() - 5 * 3600 * 1000)
          .toISOString()
          .slice(0, 10),
      ),
    );
    revenue += rev;
    costs += c;
    console.log(
      `${b.name}: ${sales.length} ventas (facturas F${String(b.nextInvoice).padStart(4, '0')}–F${String(b.nextInvoice + sales.length - 1).padStart(4, '0')}) · ${money(rev)} · ticket promedio ${money(rev / sales.length)} · ganancia ${((100 * (rev - c)) / rev).toFixed(2)} %`,
    );
    console.log(
      `  ${loans.length} a crédito (${loans.filter((l) => l.loanStatus === 'PAID').length} ya pagados) · ${plan.loanPayments.filter((p) => loanIds.has(p.loanId)).length} abonos · ${plan.cashSessions.filter((s) => s.branchId === b.id).length} cajas abiertas y cerradas · ${days.size} días con ventas`,
    );
    const perDay = new Map<number, number>();
    for (const s of sales) {
      const day = Number(
        new Date(new Date(s.createdAt!).getTime() - 5 * 3600 * 1000)
          .toISOString()
          .slice(8, 10),
      );
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    console.log(
      `  por día: ${[...perDay].map(([d, n]) => `${d}:${n}`).join(' ')}`,
    );
  }
  console.log(
    `Total: ${plan.sales.length} ventas · ${money(revenue)} · ticket promedio ${money(revenue / plan.sales.length)} · ganancia ${money(revenue - costs)} (${((100 * (revenue - costs)) / revenue).toFixed(2)} %)`,
  );

  const methods = new Map<string, number>();
  for (const p of plan.salePayments) {
    methods.set(
      p.paymentMethod,
      (methods.get(p.paymentMethod) ?? 0) + Number(p.amount),
    );
  }
  const paid = [...methods.values()].reduce((a, b) => a + b, 0);
  console.log(
    `Medios de pago en ventas: ${[...methods].map(([m, v]) => `${m} ${((100 * v) / paid).toFixed(0)} %`).join(' · ')}`,
  );

  const units = new Map<string, number>();
  for (const d of plan.saleDetails) {
    units.set(d.productId, (units.get(d.productId) ?? 0) + d.quantity);
  }
  console.log(
    `Más vendidos: ${[...units]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, n]) => `${names.get(id)} (${n})`)
      .join(' · ')}`,
  );
  console.log(
    `Inventario: ${plan.movements.length} movimientos (${plan.movements.filter((m) => m.type === 'STOCK_IN').length} entradas), ${plan.inventories.length} registros de inventario nuevos`,
  );
  if (plan.productCosts.length > 0) {
    const sample = plan.productCosts[0];
    const product = catalog.find((p) => p.id === sample.id)!;
    console.log(
      `Costos: se pone costo de compra a ${plan.productCosts.length} productos sin costo (p. ej. ${product.name}: precio ${money(product.price)} → costo ${money(sample.cost)})`,
    );
  }
}

// --- Base de datos ----------------------------------------------------------

interface Manifest {
  createdAt: string;
  users: string[];
  customers: string[];
  inventories: string[];
  cashSessions: string[];
  sales: string[];
  saleDetails: string[];
  salePayments: string[];
  loans: string[];
  loanPayments: string[];
  movements: string[];
  productCosts: { id: string; previous: number }[];
}

const TX = { maxWait: 30_000, timeout: 600_000 };

const chunks = <T>(rows: T[], size = 1000) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

const ids = (rows: { id?: string }[]) => rows.map((r) => r.id!);

// Agrupa ids por valor para actualizar con un updateMany por valor.
const groupIds = (rows: { id: string; value: number }[]) => {
  const groups = new Map<number, string[]>();
  for (const r of rows)
    groups.set(r.value, [...(groups.get(r.value) ?? []), r.id]);
  return groups;
};

async function main() {
  if (REMOVE) return remove();
  if (fs.existsSync(MANIFEST)) {
    throw new Error(
      `Ya hay ventas de demostración cargadas (${path.basename(MANIFEST)}). Bórralas con --remove antes de volver a cargarlas.`,
    );
  }

  const allBranches = await prisma.branch.findMany();
  const users: Prisma.UserCreateManyInput[] = [];
  const customers: Prisma.CustomerCreateManyInput[] = [];
  const branches: BranchInput[] = [];
  for (const cfg of BRANCHES) {
    const branch = allBranches.find(
      (b) => nameKey(b.name) === nameKey(cfg.name),
    );
    if (!branch) throw new Error(`No existe la sucursal "${cfg.name}".`);

    // Vendedor: el primer cajero de la sede, o uno nuevo sin contraseña
    // conocida si la sede no tiene.
    const cashier = await prisma.user.findFirst({
      where: { branchId: branch.id, role: 'CASHIER' },
      orderBy: { createdAt: 'asc' },
    });
    let userId = cashier?.id;
    if (!userId) {
      userId = randomUUID();
      users.push({
        id: userId,
        username: `vendedor_${nameKey(cfg.name)}`,
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
        role: 'CASHIER',
        branchId: branch.id,
      });
    }

    const existing = await prisma.customer.findMany({
      where: { branchId: branch.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const customerIds = existing.map((c) => c.id);
    const since = localTime(0, 12 * 3600); // 30 de septiembre
    for (const [firstName, lastName] of CUSTOMERS[nameKey(cfg.name)].slice(
      0,
      Math.max(0, 8 - customerIds.length),
    )) {
      const id = randomUUID();
      customers.push({
        id,
        firstName,
        lastName,
        type: 'SPECIAL',
        branchId: branch.id,
        createdAt: since,
        updatedAt: since,
      });
      customerIds.push(id);
    }

    const inventory = await prisma.inventory.findMany({
      where: { branchId: branch.id },
      select: { id: true, productId: true },
    });
    const last = await prisma.sale.findFirst({
      where: { branchId: branch.id },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    branches.push({
      id: branch.id,
      name: branch.name,
      share: cfg.share,
      openingAmount: cfg.openingAmount,
      userId,
      nextInvoice: (last?.invoiceNumber ?? 0) + 1,
      customerIds,
      inventoryIds: new Map(inventory.map((i) => [i.productId, i.id])),
    });
  }

  const products = await prisma.product.findMany({
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
  const catalog: CatalogItem[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    price:
      Number(p.retailPrice) > 0 ? Number(p.retailPrice) : Number(p.salePrice),
    cost: Number(p.purchasePrice),
  }));

  const october = await prisma.sale.count({
    where: {
      createdAt: { gte: localTime(1, 0), lt: localTime(LAST_DAY + 1, 0) },
    },
  });
  if (october > 0) {
    console.log(
      `Aviso: ya hay ${october} ventas del 1 al ${LAST_DAY} de octubre; las de demostración se suman a esas.\n`,
    );
  }

  const plan = buildPlan(catalog, branches);
  printSummary(plan, catalog, branches);
  if (users.length > 0) {
    console.log(
      `Vendedores nuevos (contraseña aleatoria): ${users.map((u) => u.username).join(', ')}`,
    );
  }
  if (customers.length > 0) {
    console.log(`Clientes nuevos para los préstamos: ${customers.length}`);
  }

  if (!APPLY) {
    console.log(
      '\n-- SIMULACIÓN: no se escribió nada. Añade --apply para cargarlo. --',
    );
    return;
  }

  // El manifiesto se escribe antes para poder borrar siempre lo cargado.
  const manifest: Manifest = {
    createdAt: new Date().toISOString(),
    users: ids(users),
    customers: ids(customers),
    inventories: ids(plan.inventories),
    cashSessions: ids(plan.cashSessions),
    sales: ids(plan.sales),
    saleDetails: ids(plan.saleDetails),
    salePayments: ids(plan.salePayments),
    loans: ids(plan.loans),
    loanPayments: ids(plan.loanPayments),
    movements: ids(plan.movements),
    productCosts: plan.productCosts.map(({ id, previous }) => ({
      id,
      previous,
    })),
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest));

  try {
    await prisma.$transaction(async (tx) => {
      if (users.length > 0) await tx.user.createMany({ data: users });
      if (customers.length > 0)
        await tx.customer.createMany({ data: customers });
      const costs = groupIds(
        plan.productCosts.map((c) => ({ id: c.id, value: c.cost })),
      );
      for (const [cost, productIds] of costs) {
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { purchasePrice: cost },
        });
      }
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
    }, TX);
  } catch (e) {
    fs.unlinkSync(MANIFEST);
    throw e;
  }
  console.log(`\nListo: datos cargados. Para borrarlos: --remove`);
}

async function remove() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(
      `No hay ventas de demostración cargadas (falta ${path.basename(MANIFEST)}).`,
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
    // Lo creado para la demostración, si nadie más lo usa.
    await tx.inventory.deleteMany({
      where: { ...byId(m.inventories), movements: { none: {} } },
    });
    await tx.customer.deleteMany({
      where: { ...byId(m.customers), sales: { none: {} }, loans: { none: {} } },
    });
    await tx.user.deleteMany({
      where: {
        ...byId(m.users),
        sales: { none: {} },
        cashSessions: { none: {} },
      },
    });
    const costs = groupIds(
      m.productCosts.map((c) => ({ id: c.id, value: c.previous })),
    );
    for (const [previous, productIds] of costs) {
      await tx.product.updateMany({
        where: { id: { in: productIds } },
        data: { purchasePrice: previous },
      });
    }
  }, TX);
  fs.unlinkSync(MANIFEST);
  console.log(
    `Borrado: ${m.sales.length} ventas, ${m.loans.length} préstamos, ${m.cashSessions.length} cajas y ${m.movements.length} movimientos; costos de ${m.productCosts.length} productos restaurados.`,
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
