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
