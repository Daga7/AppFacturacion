import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// Los informes muestran lo vendido neto de devoluciones (módulo de
// devoluciones del cajero): a cada venta se le resta lo devuelto, sin
// importar el día en que se hizo la devolución. Una venta devuelta por
// completo deja de contar como venta.
const RETURNS_SELECT = {
  select: { quantity: true, refundAmount: true },
} as const;

type ReturnLike = { quantity: number; refundAmount: Prisma.Decimal };

const refunded = (returns: ReturnLike[]) =>
  returns.reduce((sum, r) => sum + Number(r.refundAmount), 0);

const returnedUnits = (returns: ReturnLike[]) =>
  returns.reduce((sum, r) => sum + r.quantity, 0);

// Pagos de una venta netos de lo devuelto: la devolución se descuenta de los
// medios con que se pagó la venta, en proporción a lo pagado con cada uno
// (así el panel de métodos de pago nunca queda en negativo).
const netPayments = (sale: {
  payments: { paymentMethod: string; amount: Prisma.Decimal }[];
  returns: ReturnLike[];
}) => {
  const paid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const refund = refunded(sale.returns);
  return sale.payments.map((p) => ({
    method: p.paymentMethod,
    amount:
      Number(p.amount) - (paid > 0 ? (refund * Number(p.amount)) / paid : 0),
  }));
};

const fullyReturned = (sale: {
  details: { quantity: number }[];
  returns: ReturnLike[];
}) =>
  sale.returns.length > 0 &&
  returnedUnits(sale.returns) >=
    sale.details.reduce((sum, d) => sum + d.quantity, 0);

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async salesSummary(branchId?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Prisma.SaleWhereInput = {
      status: 'COMPLETED',
      createdAt: { gte: since },
    };
    if (branchId) where.branchId = branchId;

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        details: { select: { quantity: true } },
        returns: RETURNS_SELECT,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalSales = 0;
    let totalRevenue = 0;
    let totalRefunded = 0;
    const byDay: Record<string, { count: number; total: number }> = {};
    for (const s of sales) {
      const refund = refunded(s.returns);
      const counts = !fullyReturned(s);
      totalRefunded += refund;
      totalRevenue += Number(s.total) - refund;
      if (counts) totalSales++;

      const day = s.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { count: 0, total: 0 };
      if (counts) byDay[day].count++;
      byDay[day].total += Number(s.total) - refund;
    }
    const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    return {
      period: { since: since.toISOString(), days },
      summary: {
        totalSales,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        avgTicket: Math.round(avgTicket * 100) / 100,
        // Lo devuelto a los clientes de estas ventas (ya descontado arriba).
        refunded: Math.round(totalRefunded * 100) / 100,
      },
      byDay,
    };
  }

  async topProducts(branchId?: string, days = 30, limit = 10) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const saleWhere: Prisma.SaleWhereInput = {
      status: 'COMPLETED',
      createdAt: { gte: since },
    };
    if (branchId) saleWhere.branchId = branchId;
    const where: Prisma.SaleDetailWhereInput = { sale: saleWhere };

    const details = await this.prisma.saleDetail.findMany({
      where,
      include: { product: true, returns: RETURNS_SELECT },
    });

    const productSales: Record<
      string,
      { name: string; quantity: number; total: number }
    > = {};
    for (const d of details) {
      const quantity = d.quantity - returnedUnits(d.returns);
      if (quantity <= 0) continue;
      const key = d.productId;
      if (!productSales[key]) {
        productSales[key] = { name: d.product.name, quantity: 0, total: 0 };
      }
      productSales[key].quantity += quantity;
      productSales[key].total += Number(d.subtotal) - refunded(d.returns);
    }

    const top = Object.entries(productSales)
      .map(([id, data]) => ({
        productId: id,
        ...data,
        total: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    return { period: { since: since.toISOString(), days }, top };
  }

  async inventoryStatus(branchId?: string) {
    const where = branchId ? { branchId } : {};
    const inventory = await this.prisma.inventory.findMany({
      where,
      include: { product: { include: { category: true } }, branch: true },
    });

    const totalProducts = inventory.length;
    const totalUnits = inventory.reduce((sum, i) => sum + i.amount, 0);
    const lowStock = inventory.filter((i) => i.amount <= 5).length;
    const outOfStock = inventory.filter((i) => i.amount === 0).length;

    const byCategory: Record<string, { count: number; units: number }> = {};
    for (const i of inventory) {
      const cat = i.product.category.name;
      if (!byCategory[cat]) byCategory[cat] = { count: 0, units: 0 };
      byCategory[cat].count++;
      byCategory[cat].units += i.amount;
    }

    return {
      summary: { totalProducts, totalUnits, lowStock, outOfStock },
      byCategory,
    };
  }

  // Informe general (todas las sedes unidas): ventas, tickets, ganancias y
  // métodos de pago del período. La ganancia se calcula por línea vendida:
  // subtotal cobrado menos el costo de compra del producto.
  async generalSummary(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sales = await this.prisma.sale.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: since } },
      include: {
        details: { include: { product: true, returns: RETURNS_SELECT } },
        payments: true,
        branch: true,
        returns: RETURNS_SELECT,
      },
    });

    let totalTickets = 0;
    let totalRevenue = 0;
    let totalRefunded = 0;
    let totalProfit = 0;
    const byMethod: Record<string, { count: number; total: number }> = {};
    const byBranch: Record<string, { tickets: number; revenue: number }> = {};

    for (const s of sales) {
      const refund = refunded(s.returns);
      const counts = !fullyReturned(s);
      const revenue = Number(s.total) - refund;
      totalRefunded += refund;
      totalRevenue += revenue;
      if (counts) totalTickets++;

      // Ganancia neta por línea: lo cobrado menos lo devuelto, contra el
      // costo solo de las unidades que se quedó el cliente.
      for (const d of s.details) {
        totalProfit +=
          Number(d.subtotal) -
          refunded(d.returns) -
          Number(d.product.purchasePrice) *
            (d.quantity - returnedUnits(d.returns));
      }

      for (const p of netPayments(s)) {
        if (!byMethod[p.method]) byMethod[p.method] = { count: 0, total: 0 };
        byMethod[p.method].count++;
        byMethod[p.method].total += p.amount;
      }

      const branchName = s.branch.name;
      if (!byBranch[branchName])
        byBranch[branchName] = { tickets: 0, revenue: 0 };
      if (counts) byBranch[branchName].tickets++;
      byBranch[branchName].revenue += revenue;
    }

    // Ganancia de pedidos especiales: solo los ya entregados (PICKED_UP) y con
    // costo registrado por el admin. Ganancia = cobrado - costo. Los pedidos
    // sin costo no cuentan (para no inflar con costo 0).
    const specialOrders = await this.prisma.specialOrder.findMany({
      where: {
        status: 'PICKED_UP',
        cost: { not: null },
        updatedAt: { gte: since },
      },
      select: { totalAmount: true, cost: true },
    });
    let specialOrdersProfit = 0;
    let specialOrdersCount = 0;
    for (const so of specialOrders) {
      specialOrdersProfit += Number(so.totalAmount) - Number(so.cost);
      specialOrdersCount++;
    }
    totalProfit += specialOrdersProfit;

    const grandTotalPayments = Object.values(byMethod).reduce(
      (sum, m) => sum + m.total,
      0,
    );
    const round = (n: number) => Math.round(n * 100) / 100;

    return {
      period: { since: since.toISOString(), days },
      summary: {
        totalRevenue: round(totalRevenue),
        totalTickets,
        totalProfit: round(totalProfit),
        refunded: round(totalRefunded),
      },
      specialOrders: {
        count: specialOrdersCount,
        profit: round(specialOrdersProfit),
      },
      byMethod: Object.fromEntries(
        Object.entries(byMethod).map(([k, v]) => [
          k,
          {
            count: v.count,
            total: round(v.total),
            share:
              grandTotalPayments > 0
                ? Math.round((v.total / grandTotalPayments) * 100)
                : 0,
          },
        ]),
      ),
      grandTotalPayments: round(grandTotalPayments),
      byBranch: Object.fromEntries(
        Object.entries(byBranch).map(([k, v]) => [
          k,
          { tickets: v.tickets, revenue: round(v.revenue) },
        ]),
      ),
    };
  }

  // Solo el total de ganancias, agregado en SQL: no carga las ventas, así la
  // tarjeta responde rápido aunque haya miles de registros. A cada línea se
  // le resta lo devuelto (dinero y unidades).
  async profitTotal(branchId?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [row] = await this.prisma.$queryRaw<
      { revenue: number; cost: number }[]
    >`
      SELECT COALESCE(SUM(sd."subtotal" - COALESCE(r."refunded", 0)), 0)::float AS revenue,
             COALESCE(SUM(p."purchasePrice" * (sd."quantity" - COALESCE(r."units", 0))), 0)::float AS cost
      FROM "SaleDetail" sd
      JOIN "Product" p ON p."id" = sd."productId"
      JOIN "Sale" s ON s."id" = sd."saleId"
      LEFT JOIN (
        SELECT "saleDetailId",
               SUM("quantity") AS "units",
               SUM("refundAmount") AS "refunded"
        FROM "SaleReturn"
        GROUP BY "saleDetailId"
      ) r ON r."saleDetailId" = sd."id"
      WHERE s."status" = 'COMPLETED'
        AND s."createdAt" >= ${since}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
    `;

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      period: { since: since.toISOString(), days },
      revenue: round(row.revenue),
      cost: round(row.cost),
      profit: round(row.revenue - row.cost),
    };
  }

  // Ganancia por venta: al total cobrado (menos lo devuelto) se le resta el
  // costo de compra de lo que se quedó el cliente; la suma de todas da la
  // ganancia general. Las ventas devueltas por completo no aparecen.
  async profitSummary(branchId?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: since },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        details: { include: { product: true, returns: RETURNS_SELECT } },
        branch: true,
        returns: RETURNS_SELECT,
      },
      orderBy: { createdAt: 'desc' },
    });

    const round = (n: number) => Math.round(n * 100) / 100;

    const rows = sales
      .filter((s) => !fullyReturned(s))
      .map((s) => {
        const cost = s.details.reduce(
          (sum, d) =>
            sum +
            Number(d.product.purchasePrice) *
              (d.quantity - returnedUnits(d.returns)),
          0,
        );
        const returned = refunded(s.returns);
        const total = Number(s.total) - returned;
        return {
          saleId: s.id,
          invoiceNumber: s.invoiceNumber,
          branch: s.branch.name,
          createdAt: s.createdAt.toISOString(),
          total: round(total),
          cost: round(cost),
          profit: round(total - cost),
          // Devuelto al cliente (ya descontado de total).
          returned: round(returned),
        };
      });

    const totals = rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.total,
        cost: acc.cost + r.cost,
        profit: acc.profit + r.profit,
      }),
      { revenue: 0, cost: 0, profit: 0 },
    );

    return {
      period: { since: since.toISOString(), days },
      rows,
      totals: {
        revenue: round(totals.revenue),
        cost: round(totals.cost),
        profit: round(totals.profit),
      },
    };
  }

  // Ganancia entre dos instantes desglosada por sede, categoría y producto
  // (informe del bot de Telegram). Misma regla que profitTotal: a cada línea
  // se le resta lo devuelto, y las ventas devueltas por completo no cuentan.
  async profitBreakdown(from: Date, to: Date, branchIds?: string[]) {
    const branchFilter = branchIds?.length
      ? Prisma.sql`AND s."branchId" IN (${Prisma.join(branchIds)})`
      : Prisma.empty;
    const returns = Prisma.sql`
      LEFT JOIN (
        SELECT "saleDetailId",
               SUM("quantity") AS "units",
               SUM("refundAmount") AS "refunded"
        FROM "SaleReturn"
        GROUP BY "saleDetailId"
      ) r ON r."saleDetailId" = sd."id"`;

    const [lines, sales, categories] = await Promise.all([
      this.prisma.$queryRaw<
        {
          branchId: string;
          category: string;
          productId: string;
          product: string;
          units: number;
          revenue: number;
          cost: number;
        }[]
      >`
        SELECT s."branchId", c."name" AS category, p."id" AS "productId",
               p."name" AS product,
               SUM(sd."quantity" - COALESCE(r."units", 0))::int AS units,
               SUM(sd."subtotal" - COALESCE(r."refunded", 0))::float AS revenue,
               SUM(p."purchasePrice" * (sd."quantity" - COALESCE(r."units", 0)))::float AS cost
        FROM "SaleDetail" sd
        JOIN "Sale" s ON s."id" = sd."saleId"
        JOIN "Product" p ON p."id" = sd."productId"
        JOIN "Category" c ON c."id" = p."categoryId"
        ${returns}
        WHERE s."status" = 'COMPLETED'
          AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
          ${branchFilter}
        GROUP BY s."branchId", c."name", p."id", p."name"
      `,
      this.prisma.$queryRaw<{ branchId: string; sales: number }[]>`
        SELECT x."branchId", COUNT(*)::int AS sales
        FROM (
          SELECT s."id", s."branchId"
          FROM "Sale" s
          JOIN "SaleDetail" sd ON sd."saleId" = s."id"
          ${returns}
          WHERE s."status" = 'COMPLETED'
            AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
            ${branchFilter}
          GROUP BY s."id", s."branchId"
          HAVING SUM(sd."quantity" - COALESCE(r."units", 0)) > 0
        ) x
        GROUP BY x."branchId"
      `,
      this.prisma.category.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const round = (n: number) => Math.round(n * 100) / 100;
    const empty = () => ({ units: 0, revenue: 0, cost: 0 });
    const add = (
      acc: { units: number; revenue: number; cost: number },
      l: { units: number; revenue: number; cost: number },
    ) => {
      acc.units += l.units;
      acc.revenue += l.revenue;
      acc.cost += l.cost;
    };
    const finish = <T extends { units: number; revenue: number; cost: number }>(
      x: T,
    ) => ({
      ...x,
      revenue: round(x.revenue),
      cost: round(x.cost),
      profit: round(x.revenue - x.cost),
    });

    const salesBy = new Map(sales.map((s) => [s.branchId, s.sales]));
    const totals = empty();
    const byBranch = new Map<string, ReturnType<typeof empty>>();
    const byCategory = new Map<
      string,
      {
        totals: ReturnType<typeof empty>;
        products: Map<string, { name: string } & ReturnType<typeof empty>>;
      }
    >();
    for (const l of lines.filter((l) => l.units > 0)) {
      add(totals, l);
      if (!byBranch.has(l.branchId)) byBranch.set(l.branchId, empty());
      add(byBranch.get(l.branchId)!, l);
      if (!byCategory.has(l.category)) {
        byCategory.set(l.category, { totals: empty(), products: new Map() });
      }
      const cat = byCategory.get(l.category)!;
      add(cat.totals, l);
      if (!cat.products.has(l.productId)) {
        cat.products.set(l.productId, { name: l.product, ...empty() });
      }
      add(cat.products.get(l.productId)!, l);
    }

    const byProfit = (a: { profit: number }, b: { profit: number }) =>
      b.profit - a.profit;
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        sales: sales.reduce((sum, s) => sum + s.sales, 0),
        ...finish(totals),
      },
      branches: [...byBranch].map(([branchId, t]) => ({
        branchId,
        sales: salesBy.get(branchId) ?? 0,
        ...finish(t),
      })),
      categories: [...byCategory]
        .map(([name, c]) => ({
          name,
          ...finish(c.totals),
          products: [...c.products.values()].map(finish).sort(byProfit),
        }))
        .sort(byProfit),
      // Categorías sin ventas en el periodo, para decirlo en el informe.
      emptyCategories: categories
        .map((c) => c.name)
        .filter((name) => !byCategory.has(name)),
    };
  }

  async paymentSummary(branchId?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const saleWhere: Prisma.SaleWhereInput = {
      status: 'COMPLETED',
      createdAt: { gte: since },
    };
    if (branchId) saleWhere.branchId = branchId;
    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      select: { payments: true, returns: RETURNS_SELECT },
    });

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const s of sales) {
      for (const p of netPayments(s)) {
        if (!byMethod[p.method]) byMethod[p.method] = { count: 0, total: 0 };
        byMethod[p.method].count++;
        byMethod[p.method].total += p.amount;
      }
    }

    const grandTotal = Object.values(byMethod).reduce(
      (sum, m) => sum + m.total,
      0,
    );
    const share = Object.fromEntries(
      Object.entries(byMethod).map(([k, v]) => [
        k,
        {
          ...v,
          total: Math.round(v.total * 100) / 100,
          share: grandTotal > 0 ? Math.round((v.total / grandTotal) * 100) : 0,
        },
      ]),
    );

    return {
      period: { since: since.toISOString(), days },
      byMethod: share,
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  }
}
