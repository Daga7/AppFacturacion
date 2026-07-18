import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

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
      include: { branch: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    const byDay: Record<string, { count: number; total: number }> = {};
    for (const s of sales) {
      const day = s.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { count: 0, total: 0 };
      byDay[day].count++;
      byDay[day].total += Number(s.total);
    }

    return {
      period: { since: since.toISOString(), days },
      summary: {
        totalSales,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        avgTicket: Math.round(avgTicket * 100) / 100,
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
      include: { product: true },
    });

    const productSales: Record<
      string,
      { name: string; quantity: number; total: number }
    > = {};
    for (const d of details) {
      const key = d.productId;
      if (!productSales[key]) {
        productSales[key] = { name: d.product.name, quantity: 0, total: 0 };
      }
      productSales[key].quantity += d.quantity;
      productSales[key].total += Number(d.subtotal);
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
        details: { include: { product: true } },
        payments: true,
        branch: true,
      },
    });

    const totalTickets = sales.length;
    let totalRevenue = 0;
    let totalProfit = 0;
    const byMethod: Record<string, { count: number; total: number }> = {};
    const byBranch: Record<string, { tickets: number; revenue: number }> = {};

    for (const s of sales) {
      totalRevenue += Number(s.total);

      for (const d of s.details) {
        totalProfit +=
          Number(d.subtotal) - Number(d.product.purchasePrice) * d.quantity;
      }

      for (const p of s.payments) {
        if (!byMethod[p.paymentMethod]) {
          byMethod[p.paymentMethod] = { count: 0, total: 0 };
        }
        byMethod[p.paymentMethod].count++;
        byMethod[p.paymentMethod].total += Number(p.amount);
      }

      const branchName = s.branch.name;
      if (!byBranch[branchName])
        byBranch[branchName] = { tickets: 0, revenue: 0 };
      byBranch[branchName].tickets++;
      byBranch[branchName].revenue += Number(s.total);
    }

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
  // tarjeta responde rápido aunque haya miles de registros.
  async profitTotal(branchId?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [row] = await this.prisma.$queryRaw<
      { revenue: number; cost: number }[]
    >`
      SELECT COALESCE(SUM(sd."subtotal"), 0)::float AS revenue,
             COALESCE(SUM(p."purchasePrice" * sd."quantity"), 0)::float AS cost
      FROM "SaleDetail" sd
      JOIN "Product" p ON p."id" = sd."productId"
      JOIN "Sale" s ON s."id" = sd."saleId"
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

  // Ganancia por venta: al total cobrado se le resta el costo de compra de
  // cada producto vendido; la suma de todas da la ganancia general.
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
        details: { include: { product: true } },
        branch: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const round = (n: number) => Math.round(n * 100) / 100;

    const rows = sales.map((s) => {
      const cost = s.details.reduce(
        (sum, d) => sum + Number(d.product.purchasePrice) * d.quantity,
        0,
      );
      const total = Number(s.total);
      return {
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        branch: s.branch.name,
        createdAt: s.createdAt.toISOString(),
        total: round(total),
        cost: round(cost),
        profit: round(total - cost),
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

  async paymentSummary(branchId?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const saleWhere: Prisma.SaleWhereInput = {
      status: 'COMPLETED',
      createdAt: { gte: since },
    };
    if (branchId) saleWhere.branchId = branchId;
    const where: Prisma.SalePaymentWhereInput = { sale: saleWhere };

    const payments = await this.prisma.salePayment.findMany({
      where,
    });

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const p of payments) {
      const method = p.paymentMethod;
      if (!byMethod[method]) byMethod[method] = { count: 0, total: 0 };
      byMethod[method].count++;
      byMethod[method].total += Number(p.amount);
    }

    const grandTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
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
