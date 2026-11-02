/**
 * Datos de demostración de los módulos de gestión para la presentación:
 * traslados, garantías, pedidos especiales, lista de compras, solicitudes de
 * precio y avisos de lo hecho sin internet, todos en octubre de 2026 y con
 * registros pendientes, aprobados y rechazados, para que ningún módulo del
 * administrador se vea vacío.
 *
 * Todo queda como lo deja la app: los traslados y garantías aprobados mueven
 * el inventario con sus movimientos, los pagos de los pedidos especiales
 * quedan en la caja del día (y su cierre los incluye) y las solicitudes de
 * precio aprobadas cambian el precio de venta del producto. Usa las cajas de
 * octubre que carga demo-octubre.ts.
 *
 * Uso (desde backend/):
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-modulos.ts           # simulación
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-modulos.ts --apply   # escribe
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' prisma/demo-modulos.ts --remove  # borra lo cargado
 *
 * Lo cargado queda en prisma/demo-modulos.manifest.json; --remove lo borra y
 * deshace los cambios de stock, precios y cierres de caja.
 */
import 'dotenv/config';
import {
  PrismaClient,
  Prisma,
  type OfflineIssueType,
  type PaymentMethod,
  type RequestStatus,
  type SpecialOrderStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const MANIFEST = path.join(__dirname, 'demo-modulos.manifest.json');

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

const YEAR = 2026;
const MONTH = 10;

type BranchKey = 'aguachica' | 'ocana';
type Time = [day: number, hour: number, minute: number];

// Hora de Colombia (UTC-5) de un día de octubre.
const at = ([day, hour, minute]: Time) =>
  new Date(Date.UTC(YEAR, MONTH - 1, day, hour + 5, minute));
const minutesAfter = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);
const bogotaDay = (date: Date) =>
  new Date(date.getTime() - 5 * 3600_000).getUTCDate();

// Mismos formatos que el backend en los avisos.
const money = (n: number) =>
  `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
const bogotaDateTime = (date: Date) =>
  date.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  });

const nameKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() as BranchKey;

// Azar con semilla: la simulación y --apply eligen los mismos productos.
let seed = 20261027;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- Lo que se registra -----------------------------------------------------

const SUPPLIER_CUCUTA = 'Proveedor de pantallas (Cúcuta)';
const SUPPLIER_BGA = 'Proveedor de repuestos (Bucaramanga)';

// El vendedor de la sede de origen pide el traslado; el admin lo resuelve.
const TRANSFERS: {
  from: BranchKey;
  at: Time;
  quantity: number;
  note: string;
  status: RequestStatus;
  resolvedAt?: Time;
  adminNote?: string;
}[] = [
  {
    from: 'aguachica',
    at: [2, 10, 20],
    quantity: 4,
    note: 'Ocaña tiene pocas unidades',
    status: 'APPROVED',
    resolvedAt: [2, 12, 5],
  },
  {
    from: 'aguachica',
    at: [7, 15, 40],
    quantity: 5,
    note: 'Para los técnicos de Ocaña',
    status: 'APPROVED',
    resolvedAt: [7, 17, 10],
  },
  {
    from: 'ocana',
    at: [9, 11, 5],
    quantity: 2,
    note: 'Un cliente en Aguachica la necesita hoy',
    status: 'APPROVED',
    resolvedAt: [9, 11, 50],
  },
  {
    from: 'aguachica',
    at: [14, 9, 50],
    quantity: 6,
    note: 'Reposición de la semana',
    status: 'APPROVED',
    resolvedAt: [14, 12, 40],
  },
  {
    from: 'aguachica',
    at: [16, 10, 30],
    quantity: 8,
    note: 'Reposición de la semana',
    status: 'REJECTED',
    resolvedAt: [16, 12, 15],
    adminNote: 'Esperemos el pedido del proveedor del lunes',
  },
  {
    from: 'aguachica',
    at: [20, 16, 10],
    quantity: 3,
    note: 'Casi agotada en Ocaña',
    status: 'APPROVED',
    resolvedAt: [20, 17, 5],
  },
  {
    from: 'aguachica',
    at: [26, 11, 45],
    quantity: 4,
    note: 'En Ocaña ya casi no hay',
    status: 'PENDING',
  },
  {
    from: 'ocana',
    at: [26, 16, 20],
    quantity: 2,
    note: 'Para el pedido de un técnico en Aguachica',
    status: 'PENDING',
  },
];

const WARRANTIES: {
  branch: BranchKey;
  at: Time;
  quantity: number;
  reason: string;
  supplier: string;
  status: RequestStatus;
  resolvedAt?: Time;
}[] = [
  {
    branch: 'aguachica',
    at: [6, 11, 30],
    quantity: 1,
    reason: 'Líneas verticales en la imagen al encender',
    supplier: SUPPLIER_CUCUTA,
    status: 'APPROVED',
    resolvedAt: [7, 9, 15],
  },
  {
    branch: 'ocana',
    at: [13, 15, 0],
    quantity: 2,
    reason: 'El touch no responde en la parte de abajo',
    supplier: SUPPLIER_BGA,
    status: 'APPROVED',
    resolvedAt: [14, 10, 0],
  },
  {
    branch: 'aguachica',
    at: [15, 16, 20],
    quantity: 1,
    reason: 'Se partió al instalarla',
    supplier: SUPPLIER_CUCUTA,
    status: 'REJECTED',
    resolvedAt: [16, 9, 30],
  },
  {
    branch: 'aguachica',
    at: [19, 10, 40],
    quantity: 1,
    reason: 'Manchas negras en el display',
    supplier: SUPPLIER_CUCUTA,
    status: 'APPROVED',
    resolvedAt: [19, 17, 30],
  },
  {
    branch: 'ocana',
    at: [24, 12, 10],
    quantity: 1,
    reason: 'No da imagen después de instalada',
    supplier: SUPPLIER_BGA,
    status: 'PENDING',
  },
  {
    branch: 'aguachica',
    at: [26, 10, 5],
    quantity: 2,
    reason: 'Flex del touch roto de fábrica',
    supplier: SUPPLIER_CUCUTA,
    status: 'PENDING',
  },
];

// Abono al pedirlo, saldo al recogerlo; el costo lo registra el admin.
const SPECIAL_ORDERS: {
  branch: BranchKey;
  at: Time;
  customer: string;
  part: string;
  description?: string;
  total: number;
  deposit: [number, PaymentMethod];
  arrival: number;
  status: SpecialOrderStatus;
  // Último cambio de estado y, si lo hubo, pago del saldo en ese momento.
  updatedAt?: Time;
  finalPayment?: PaymentMethod;
  cost?: number;
}[] = [
  {
    branch: 'aguachica',
    at: [3, 10, 30],
    customer: 'Andrés Contreras',
    part: 'Pantalla Samsung S23 Ultra original',
    description: 'Con marco, color negro',
    total: 1_450_000,
    deposit: [700_000, 'NEQUI'],
    arrival: 10,
    status: 'PICKED_UP',
    updatedAt: [10, 16, 0],
    finalPayment: 'CASH',
    cost: 1_150_000,
  },
  {
    branch: 'ocana',
    at: [8, 14, 15],
    customer: 'Paola Vergel',
    part: 'Batería iPhone 13 Pro',
    total: 230_000,
    deposit: [100_000, 'CASH'],
    arrival: 15,
    status: 'PICKED_UP',
    updatedAt: [15, 11, 20],
    finalPayment: 'BANCOLOMBIA',
    cost: 150_000,
  },
  {
    branch: 'aguachica',
    at: [13, 9, 40],
    customer: 'Jesús Manosalva',
    part: 'Flex de carga Xiaomi Redmi Note 13',
    total: 60_000,
    deposit: [60_000, 'CASH'],
    arrival: 17,
    status: 'PICKED_UP',
    updatedAt: [17, 15, 30],
    cost: 35_000,
  },
  {
    branch: 'aguachica',
    at: [17, 11, 50],
    customer: 'Diana Coronel',
    part: 'Tapa trasera Samsung A54',
    description: 'Color verde menta',
    total: 85_000,
    deposit: [40_000, 'CASH'],
    arrival: 24,
    status: 'ARRIVED',
    updatedAt: [24, 14, 0],
  },
  {
    branch: 'ocana',
    at: [21, 16, 30],
    customer: 'Ronald Pérez',
    part: 'Cámara trasera Motorola G84',
    total: 180_000,
    deposit: [90_000, 'NEQUI'],
    arrival: 29,
    status: 'ORDERED',
    updatedAt: [22, 9, 30],
    cost: 120_000,
  },
  {
    branch: 'aguachica',
    at: [23, 10, 10],
    customer: 'Natalia Quintana',
    part: 'Pantalla Huawei Y9 Prime 2019 con marco',
    total: 140_000,
    deposit: [70_000, 'CASH'],
    arrival: 30,
    status: 'ORDERED',
    updatedAt: [23, 15, 0],
  },
  {
    branch: 'ocana',
    at: [26, 15, 5],
    customer: 'Hernán Bayona',
    part: 'Pantalla iPhone 12 OLED',
    description: 'Calidad OLED, no incell',
    total: 380_000,
    deposit: [100_000, 'CASH'],
    arrival: 31,
    status: 'DEPOSITED',
  },
];

// product: 'top' (más vendido de la sede), 'low' (poco stock en la sede) o
// 'any'; sin product es un ítem escrito a mano (label).
const PURCHASE_ITEMS: {
  branch: BranchKey;
  at: Time;
  product?: 'top' | 'low' | 'any';
  label?: string;
  quantity: number;
  note?: string;
  auto?: boolean;
  resolvedAt?: Time;
}[] = [
  {
    branch: 'aguachica',
    at: [9, 17, 10],
    label: 'Pegante B-7000 de 110 ml',
    quantity: 12,
    note: 'Se está acabando en el taller',
    resolvedAt: [13, 10, 0],
  },
  {
    branch: 'ocana',
    at: [13, 11, 20],
    product: 'any',
    quantity: 6,
    note: 'Pedido de un técnico',
    resolvedAt: [16, 9, 45],
  },
  {
    branch: 'ocana',
    at: [17, 12, 40],
    label: 'Baterías iPhone 11',
    quantity: 5,
    note: 'Preguntan mucho por ellas',
  },
  {
    branch: 'aguachica',
    at: [20, 18, 5],
    product: 'top',
    quantity: 15,
    note: 'Es la que más se vende',
  },
  {
    branch: 'aguachica',
    at: [22, 9, 30],
    label: 'Vidrio templado 9D Samsung A15',
    quantity: 30,
    note: 'Lo piden con la pantalla',
  },
  {
    branch: 'aguachica',
    at: [24, 17, 45],
    product: 'top',
    quantity: 10,
    auto: true,
  },
  {
    branch: 'ocana',
    at: [25, 10, 30],
    product: 'low',
    quantity: 10,
    auto: true,
  },
  {
    branch: 'ocana',
    at: [25, 10, 32],
    product: 'low',
    quantity: 8,
    auto: true,
  },
];

// change: diferencia con el precio de venta actual. 'unsold' toma un producto
// que no se vendió en octubre.
const PRICE_REQUESTS: {
  branch: BranchKey;
  at: Time;
  change: number;
  reason: string;
  status: RequestStatus;
  resolvedAt?: Time;
  unsold?: boolean;
}[] = [
  {
    branch: 'aguachica',
    at: [5, 10, 0],
    change: 5000,
    reason: 'El proveedor subió el precio',
    status: 'APPROVED',
    resolvedAt: [5, 15, 0],
  },
  {
    branch: 'ocana',
    at: [9, 11, 30],
    change: -5000,
    reason: 'En el centro de Ocaña la venden más barata',
    status: 'APPROVED',
    resolvedAt: [10, 9, 20],
  },
  {
    branch: 'aguachica',
    at: [13, 10, 15],
    change: -10000,
    reason: 'Un técnico pide descuento por llevar varias',
    status: 'REJECTED',
    resolvedAt: [13, 17, 0],
  },
  {
    branch: 'ocana',
    at: [23, 16, 40],
    change: 5000,
    reason: 'El proveedor subió el precio',
    status: 'PENDING',
  },
  {
    branch: 'aguachica',
    at: [24, 12, 20],
    change: -5000,
    reason: 'No se ha vendido en el mes',
    status: 'PENDING',
    unsold: true,
  },
  {
    branch: 'aguachica',
    at: [26, 9, 35],
    change: 10000,
    reason: 'El nuevo lote llegó más caro',
    status: 'PENDING',
  },
];

// Avisos de lo registrado sin internet: dos abiertos y dos ya revisados.
// CASH_ALREADY_OPEN ocurre poco después de que abrió la caja del día.
const ISSUES: {
  type: OfflineIssueType;
  branch: BranchKey;
  at: Time;
  syncedAfter: number; // minutos hasta que volvió la red
  base?: number;
  amount?: number;
  resolvedAt?: Time;
}[] = [
  {
    type: 'CASH_ALREADY_OPEN',
    branch: 'aguachica',
    at: [3, 8, 20],
    syncedAfter: 35,
    base: 200_000,
    resolvedAt: [3, 18, 5],
  },
  {
    type: 'REJECTED',
    branch: 'aguachica',
    at: [11, 10, 25],
    syncedAfter: 50,
    resolvedAt: [13, 9, 40],
  },
  {
    type: 'CASH_ALREADY_OPEN',
    branch: 'ocana',
    at: [24, 8, 18],
    syncedAfter: 40,
    base: 100_000,
  },
  {
    type: 'LOAN_NOT_FOUND',
    branch: 'aguachica',
    at: [25, 11, 10],
    syncedAfter: 95,
    amount: 40_000,
  },
];

// --- Plan ---------------------------------------------------------------------

interface Manifest {
  transfers: string[];
  warranties: string[];
  specialOrders: string[];
  purchaseItems: string[];
  priceRequests: string[];
  syncedOperations: string[];
  issues: string[];
  movements: string[];
  inventory: { id: string; delta: number }[];
  closingAmounts: { id: string; delta: number }[];
  salePrices: { id: string; previous: number; price: number }[];
}

async function main() {
  if (REMOVE) return remove();
  if (fs.existsSync(MANIFEST)) {
    throw new Error(
      `Ya hay datos de demostración de los módulos (${path.basename(MANIFEST)}). Bórralos con --remove antes de volver a cargarlos.`,
    );
  }

  const branches = new Map(
    (await prisma.branch.findMany()).map((b) => [nameKey(b.name), b]),
  );
  const branch = (key: BranchKey) => {
    const b = branches.get(key);
    if (!b) throw new Error(`No existe la sucursal "${key}".`);
    return b;
  };
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('No hay un usuario administrador.');
  const cashiers = new Map<BranchKey, { id: string; username: string }>();
  for (const key of ['aguachica', 'ocana'] as BranchKey[]) {
    const cashier = await prisma.user.findFirst({
      where: { branchId: branch(key).id, role: 'CASHIER' },
      orderBy: { createdAt: 'asc' },
    });
    if (!cashier) throw new Error(`La sede ${key} no tiene vendedor.`);
    cashiers.set(key, cashier);
  }

  // Cajas de octubre: una por sede y día.
  const sessions = await prisma.cashSession.findMany({
    where: {
      openedAt: { gte: at([1, 0, 0]), lt: at([27, 0, 0]) },
      status: 'CLOSED',
    },
    include: { openedBy: { select: { username: true } } },
  });
  const sessionOf = (key: BranchKey, day: number) =>
    sessions.find(
      (s) => s.branchId === branch(key).id && bogotaDay(s.openedAt) === day,
    );

  // Inventario por sede (stock que se va actualizando con lo que se aprueba).
  const inventory = await prisma.inventory.findMany({
    where: { product: { isActive: true } },
    include: { product: true },
    orderBy: { product: { barcode: 'asc' } },
  });
  const stock = new Map(inventory.map((i) => [i.id, i.amount]));
  const rowOf = (key: BranchKey, productId: string) =>
    inventory.find(
      (i) => i.branchId === branch(key).id && i.productId === productId,
    );
  const used = new Set<string>();
  const pickRow = (
    key: BranchKey,
    accept: (amount: number, productId: string) => boolean,
  ) => {
    const rows = inventory.filter(
      (i) =>
        i.branchId === branch(key).id &&
        !used.has(i.productId) &&
        accept(stock.get(i.id)!, i.productId),
    );
    if (rows.length === 0) throw new Error(`Sin productos aptos en ${key}`);
    const row = rows[Math.floor(rand() * rows.length)];
    used.add(row.productId);
    return row;
  };

  // Lo más vendido en octubre por sede (para la lista de compras).
  const topSold = await prisma.$queryRaw<
    { branchId: string; productId: string; units: number }[]
  >`
    SELECT s."branchId", sd."productId", SUM(sd."quantity")::int AS units
    FROM "SaleDetail" sd JOIN "Sale" s ON s."id" = sd."saleId"
    WHERE s."createdAt" >= ${at([1, 0, 0])} AND s."createdAt" < ${at([27, 0, 0])}
    GROUP BY 1, 2 ORDER BY units DESC
  `;
  const soldInOctober = new Set(topSold.map((t) => t.productId));

  const manifest: Manifest = {
    transfers: [],
    warranties: [],
    specialOrders: [],
    purchaseItems: [],
    priceRequests: [],
    syncedOperations: [],
    issues: [],
    movements: [],
    inventory: [],
    closingAmounts: [],
    salePrices: [],
  };
  const inventoryDelta = new Map<string, number>();
  const closingDelta = new Map<string, number>();
  const moveStock = (inventoryId: string, delta: number) => {
    stock.set(inventoryId, stock.get(inventoryId)! + delta);
    inventoryDelta.set(
      inventoryId,
      (inventoryDelta.get(inventoryId) ?? 0) + delta,
    );
  };

  const transfers: Prisma.BranchTransferRequestCreateManyInput[] = [];
  const warranties: Prisma.WarrantyClaimCreateManyInput[] = [];
  const specialOrders: Prisma.SpecialOrderCreateManyInput[] = [];
  const specialPayments: Prisma.SpecialOrderPaymentCreateManyInput[] = [];
  const purchaseItems: Prisma.PurchaseListItemCreateManyInput[] = [];
  const priceRequests: Prisma.PriceChangeRequestCreateManyInput[] = [];
  const syncedOperations: Prisma.SyncedOperationCreateManyInput[] = [];
  const issues: Prisma.OfflineIssueCreateManyInput[] = [];
  const movements: Prisma.InventoryMovementCreateManyInput[] = [];
  const lines: string[] = [];

  // Traslados: a Ocaña lo que allá tiene poco stock; a Aguachica lo que
  // Ocaña tiene de sobra.
  for (const t of TRANSFERS) {
    const to: BranchKey = t.from === 'aguachica' ? 'ocana' : 'aguachica';
    const source =
      t.from === 'aguachica'
        ? pickRow('ocana', (amount, productId) => {
            const origin = rowOf('aguachica', productId);
            return (
              amount >= 1 &&
              amount <= 5 &&
              !!origin &&
              stock.get(origin.id)! >= t.quantity + 5
            );
          })
        : pickRow(
            'ocana',
            (amount, productId) =>
              amount >= t.quantity + 3 && !!rowOf('aguachica', productId),
          );
    const productId = source.productId;
    const fromRow = rowOf(t.from, productId)!;
    const toRow = rowOf(to, productId)!;
    const id = randomUUID();
    const created = at(t.at);
    const resolved = t.resolvedAt ? at(t.resolvedAt) : null;
    let transferGroupId: string | null = null;
    if (t.status === 'APPROVED') {
      transferGroupId = randomUUID();
      for (const [row, quantity] of [
        [fromRow, -t.quantity],
        [toRow, t.quantity],
      ] as const) {
        const movementId = randomUUID();
        movements.push({
          id: movementId,
          inventoryId: row.id,
          productId,
          branchId: row.branchId,
          quantity,
          type: 'BRANCH_TRANSFER',
          transferGroupId,
          note: t.note,
          createdAt: resolved!,
        });
        moveStock(row.id, quantity);
      }
    }
    transfers.push({
      id,
      fromBranchId: branch(t.from).id,
      toBranchId: branch(to).id,
      productId,
      quantity: t.quantity,
      status: t.status,
      note: t.adminNote ?? t.note,
      transferGroupId,
      requestedById: cashiers.get(t.from)!.id,
      resolvedById: resolved ? admin.id : null,
      resolvedAt: resolved,
      createdAt: created,
      updatedAt: resolved ?? created,
    });
    lines.push(
      `Traslado ${t.status.padEnd(8)} ${t.at[0]} oct · ${branch(t.from).name} → ${branch(to).name} · ${t.quantity} × ${source.product.name}`,
    );
  }

  // Garantías: la aprobada saca la mercancía del stock de la sede.
  for (const w of WARRANTIES) {
    const row = pickRow(w.branch, (amount) => amount >= w.quantity + 2);
    const created = at(w.at);
    const resolved = w.resolvedAt ? at(w.resolvedAt) : null;
    if (w.status === 'APPROVED') {
      movements.push({
        id: randomUUID(),
        inventoryId: row.id,
        productId: row.productId,
        branchId: row.branchId,
        quantity: -w.quantity,
        type: 'WARRANTY',
        note: `Garantía a ${w.supplier}: ${w.reason}`,
        createdAt: resolved!,
      });
      moveStock(row.id, -w.quantity);
    }
    warranties.push({
      id: randomUUID(),
      branchId: row.branchId,
      productId: row.productId,
      quantity: w.quantity,
      reason: w.reason,
      supplier: w.supplier,
      status: w.status,
      requestedById: cashiers.get(w.branch)!.id,
      resolvedById: resolved ? admin.id : null,
      resolvedAt: resolved,
      createdAt: created,
      updatedAt: resolved ?? created,
    });
    lines.push(
      `Garantía ${w.status.padEnd(8)} ${w.at[0]} oct · ${branch(w.branch).name} · ${w.quantity} × ${row.product.name}: ${w.reason}`,
    );
  }

  // Pedidos especiales: cada pago entra a la caja del día; el efectivo suma
  // al cierre para que la caja siga cuadrando.
  const payIn = (
    key: BranchKey,
    when: Date,
    specialOrderId: string,
    amount: number,
    method: PaymentMethod,
    kind: 'DEPOSIT' | 'FINAL',
  ) => {
    const session = sessionOf(key, bogotaDay(when));
    if (session && method === 'CASH') {
      closingDelta.set(
        session.id,
        (closingDelta.get(session.id) ?? 0) + amount,
      );
    }
    specialPayments.push({
      id: randomUUID(),
      specialOrderId,
      amount,
      paymentMethod: method,
      kind,
      cashSessionId: session?.id ?? null,
      createdAt: when,
    });
  };
  for (const o of SPECIAL_ORDERS) {
    const id = randomUUID();
    const created = at(o.at);
    const updated = o.updatedAt ? at(o.updatedAt) : created;
    const [deposit, method] = o.deposit;
    payIn(
      o.branch,
      created,
      id,
      deposit,
      method,
      deposit >= o.total ? 'FINAL' : 'DEPOSIT',
    );
    if (o.finalPayment) {
      payIn(
        o.branch,
        minutesAfter(updated, -5),
        id,
        o.total - deposit,
        o.finalPayment,
        'FINAL',
      );
    }
    const paid = deposit + (o.finalPayment ? o.total - deposit : 0);
    specialOrders.push({
      id,
      customerName: o.customer,
      partName: o.part,
      description: o.description ?? null,
      totalAmount: o.total,
      depositedAmount: paid,
      cost: o.cost ?? null,
      status: o.status,
      estimatedArrival: at([o.arrival, 12, 0]),
      branchId: branch(o.branch).id,
      createdById: cashiers.get(o.branch)!.id,
      createdAt: created,
      updatedAt: updated,
    });
    lines.push(
      `Pedido   ${o.status.padEnd(9)} ${o.at[0]} oct · ${branch(o.branch).name} · ${o.part} · ${money(o.total)} (pagado ${money(paid)}${o.cost ? `, costo ${money(o.cost)}` : ''})`,
    );
  }

  // Lista de compras.
  for (const item of PURCHASE_ITEMS) {
    let productId: string | null = null;
    if (item.product === 'top') {
      const top = topSold.find(
        (t) => t.branchId === branch(item.branch).id && !used.has(t.productId),
      );
      if (!top) throw new Error('Sin productos vendidos en octubre');
      productId = top.productId;
      used.add(productId);
    } else if (item.product) {
      productId = pickRow(item.branch, (amount) =>
        item.product === 'low' ? amount >= 1 && amount <= 5 : amount >= 3,
      ).productId;
    }
    const created = at(item.at);
    const resolved = item.resolvedAt ? at(item.resolvedAt) : null;
    purchaseItems.push({
      id: randomUUID(),
      productId,
      label: productId ? null : item.label!,
      note: item.note ?? null,
      quantity: item.quantity,
      source: item.auto ? 'AUTO' : 'MANUAL',
      resolved: !!resolved,
      branchId: branch(item.branch).id,
      createdById: cashiers.get(item.branch)!.id,
      createdAt: created,
      updatedAt: resolved ?? created,
    });
    const name = productId
      ? inventory.find((i) => i.productId === productId)!.product.name
      : item.label;
    lines.push(
      `Compra   ${(item.auto ? 'AUTO' : 'MANUAL').padEnd(9)} ${item.at[0]} oct · ${branch(item.branch).name} · ${item.quantity} × ${name}${resolved ? ' (comprado)' : ''}`,
    );
  }

  // Solicitudes de precio: la aprobada cambia el precio de venta.
  const priceCandidates = inventory.filter(
    (i) =>
      i.branchId === branch('aguachica').id &&
      Number(i.product.salePrice) >= 60_000,
  );
  for (const r of PRICE_REQUESTS) {
    const options = priceCandidates.filter(
      (i) =>
        !used.has(i.productId) &&
        (!r.unsold || !soldInOctober.has(i.productId)),
    );
    const product = options[Math.floor(rand() * options.length)].product;
    used.add(product.id);
    const current = Number(product.salePrice);
    const created = at(r.at);
    const resolved = r.resolvedAt ? at(r.resolvedAt) : null;
    if (r.status === 'APPROVED') {
      manifest.salePrices.push({
        id: product.id,
        previous: current,
        price: current + r.change,
      });
    }
    priceRequests.push({
      id: randomUUID(),
      productId: product.id,
      currentPrice: current,
      suggestedPrice: current + r.change,
      reason: r.reason,
      status: r.status,
      requestedById: cashiers.get(r.branch)!.id,
      resolvedById: resolved ? admin.id : null,
      resolvedAt: resolved,
      createdAt: created,
      updatedAt: resolved ?? created,
    });
    lines.push(
      `Precio   ${r.status.padEnd(9)} ${r.at[0]} oct · ${product.name} · ${money(current)} → ${money(current + r.change)}`,
    );
  }

  // Avisos sin conexión, con la operación sincronizada que los originó.
  for (const issue of ISSUES) {
    const key = issue.branch;
    const occurredAt = at(issue.at);
    const syncedAt = minutesAfter(occurredAt, issue.syncedAfter);
    const resolved = issue.resolvedAt ? at(issue.resolvedAt) : null;
    const user = cashiers.get(key)!;
    const operationId = randomUUID();
    let message: string;
    let loanId: string | null = null;
    let operation: Pick<
      Prisma.SyncedOperationCreateManyInput,
      'type' | 'rejected' | 'error' | 'result'
    >;
    if (issue.type === 'CASH_ALREADY_OPEN') {
      const session = sessionOf(key, issue.at[0]);
      if (!session) throw new Error(`Sin caja el ${issue.at[0]} en ${key}`);
      message = `Se abrió caja sin internet con base ${money(issue.base!)}, pero en ${branch(key).name} ya había una caja abierta desde ${bogotaDateTime(session.openedAt)} por ${session.openedBy.username} con base ${money(Number(session.openingAmount))}. Se siguió usando esa caja; revisa la base.`;
      operation = { type: 'OPEN_CASH', result: { sessionId: session.id } };
    } else if (issue.type === 'LOAN_NOT_FOUND') {
      loanId = randomUUID();
      message = `Abono de ${money(issue.amount!)} cobrado sin internet a un préstamo que ya no existe (se devolvió o se borró). El dinero no quedó registrado en ninguna caja.`;
      operation = { type: 'LOAN_PAYMENT', result: { paymentId: null } };
    } else {
      const error =
        'No repitas el mismo producto en varias filas; ajusta la cantidad';
      message = `No se pudo guardar algo hecho sin internet (Venta): ${error}`;
      operation = { type: 'CREATE_SALE', rejected: true, error };
    }
    syncedOperations.push({
      id: operationId,
      ...operation,
      userId: user.id,
      branchId: branch(key).id,
      occurredAt,
      createdAt: syncedAt,
    });
    issues.push({
      id: randomUUID(),
      type: issue.type,
      message,
      operationId,
      occurredAt,
      loanId,
      branchId: branch(key).id,
      userId: user.id,
      resolvedAt: resolved,
      resolvedById: resolved ? admin.id : null,
      createdAt: syncedAt,
    });
    lines.push(
      `Aviso    ${(resolved ? 'revisado' : 'abierto').padEnd(9)} ${issue.at[0]} oct · ${branch(key).name} · ${message.slice(0, 90)}…`,
    );
  }

  manifest.transfers = transfers.map((t) => t.id!);
  manifest.warranties = warranties.map((w) => w.id!);
  manifest.specialOrders = specialOrders.map((o) => o.id!);
  manifest.purchaseItems = purchaseItems.map((i) => i.id!);
  manifest.priceRequests = priceRequests.map((r) => r.id!);
  manifest.syncedOperations = syncedOperations.map((o) => o.id);
  manifest.issues = issues.map((i) => i.id!);
  manifest.movements = movements.map((m) => m.id!);
  manifest.inventory = [...inventoryDelta].map(([id, delta]) => ({
    id,
    delta,
  }));
  manifest.closingAmounts = [...closingDelta].map(([id, delta]) => ({
    id,
    delta,
  }));

  console.log(lines.join('\n'));
  console.log(
    `\n${movements.length} movimientos de inventario · stock ajustado en ${manifest.inventory.length} registros · ${manifest.closingAmounts.length} cierres de caja suman el efectivo de los pedidos · ${manifest.salePrices.length} precios de venta cambian`,
  );

  if (!APPLY) {
    console.log(
      '\n-- SIMULACIÓN: no se escribió nada. Añade --apply para cargarlo. --',
    );
    return;
  }

  // El manifiesto se escribe antes para poder borrar siempre lo cargado.
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest));
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.branchTransferRequest.createMany({ data: transfers });
        await tx.warrantyClaim.createMany({ data: warranties });
        await tx.specialOrder.createMany({ data: specialOrders });
        await tx.specialOrderPayment.createMany({ data: specialPayments });
        await tx.purchaseListItem.createMany({ data: purchaseItems });
        await tx.priceChangeRequest.createMany({ data: priceRequests });
        await tx.syncedOperation.createMany({ data: syncedOperations });
        await tx.offlineIssue.createMany({ data: issues });
        await tx.inventoryMovement.createMany({ data: movements });
        for (const { id, delta } of manifest.inventory) {
          await tx.inventory.update({
            where: { id },
            data: { amount: { increment: delta } },
          });
        }
        for (const { id, delta } of manifest.closingAmounts) {
          await tx.cashSession.update({
            where: { id },
            data: { closingAmount: { increment: delta } },
          });
        }
        for (const { id, price } of manifest.salePrices) {
          await tx.product.update({
            where: { id },
            data: { salePrice: price },
          });
        }
      },
      { maxWait: 30_000, timeout: 120_000 },
    );
  } catch (e) {
    fs.unlinkSync(MANIFEST);
    throw e;
  }
  console.log('\nListo: datos cargados. Para borrarlos: --remove');
}

async function remove() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(
      `No hay datos de demostración de los módulos (falta ${path.basename(MANIFEST)}).`,
    );
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Manifest;
  const byId = (ids: string[]) => ({ id: { in: ids } });
  await prisma.$transaction(
    async (tx) => {
      await tx.offlineIssue.deleteMany({ where: byId(m.issues) });
      await tx.syncedOperation.deleteMany({ where: byId(m.syncedOperations) });
      await tx.priceChangeRequest.deleteMany({ where: byId(m.priceRequests) });
      await tx.purchaseListItem.deleteMany({ where: byId(m.purchaseItems) });
      // Los pagos se borran en cascada con el pedido.
      await tx.specialOrder.deleteMany({ where: byId(m.specialOrders) });
      await tx.warrantyClaim.deleteMany({ where: byId(m.warranties) });
      await tx.branchTransferRequest.deleteMany({ where: byId(m.transfers) });
      await tx.inventoryMovement.deleteMany({ where: byId(m.movements) });
      for (const { id, delta } of m.inventory) {
        await tx.inventory.update({
          where: { id },
          data: { amount: { decrement: delta } },
        });
      }
      for (const { id, delta } of m.closingAmounts) {
        await tx.cashSession.update({
          where: { id },
          data: { closingAmount: { decrement: delta } },
        });
      }
      for (const { id, previous } of m.salePrices) {
        await tx.product.update({
          where: { id },
          data: { salePrice: previous },
        });
      }
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
  fs.unlinkSync(MANIFEST);
  console.log('Borrados los datos de demostración de los módulos.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
