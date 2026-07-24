import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseItemDto } from './dto/create-purchase-item.dto';

// Parámetros del motor de recomendaciones.
const LOW_STOCK_THRESHOLD = 5; // unidades o menos = stock bajo
const VELOCITY_WINDOW_DAYS = 30; // ventana para medir rotación
const DAYS_OF_COVER = 7; // se agotará dentro de estos días = urgente
const FREQUENT_UNITS = 10; // vendidas en la ventana = alta rotación

const ITEM_INCLUDE = {
  product: { include: { category: true } },
  branch: true,
  createdBy: { select: { id: true, username: true } },
} as const;

export interface PurchaseRecommendation {
  productId: string;
  productName: string;
  categoryName: string;
  branchId: string;
  branchName: string;
  currentStock: number;
  soldLastPeriod: number;
  dailyVelocity: number;
  daysUntilEmpty: number | null;
  reasons: string[];
}

@Injectable()
export class PurchaseListService {
  constructor(private prisma: PrismaService) {}

  // Ítems guardados de la lista (manuales y confirmados). Por defecto solo los
  // pendientes; con includeResolved se traen también los ya comprados.
  async findAll(branchId?: string, includeResolved = false) {
    const items = await this.prisma.purchaseListItem.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(includeResolved ? {} : { resolved: false }),
      },
      include: ITEM_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return JSON.parse(JSON.stringify(items)) as typeof items;
  }

  async create(dto: CreatePurchaseItemDto, userId: string, branchId?: string) {
    if (!dto.productId && !dto.label?.trim()) {
      throw new BadRequestException(
        'Indica un producto o escribe el nombre de lo que hace falta',
      );
    }

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');
    }

    const item = await this.prisma.purchaseListItem.create({
      data: {
        productId: dto.productId || null,
        label: dto.label?.trim() || null,
        note: dto.note?.trim() || null,
        source: 'MANUAL',
        branchId: dto.branchId || branchId || null,
        createdById: userId,
      },
      include: ITEM_INCLUDE,
    });
    return JSON.parse(JSON.stringify(item)) as typeof item;
  }

  // Materializa una recomendación automática como ítem guardado (source AUTO),
  // para que quede en la lista junto a los manuales. Evita duplicar un producto
  // que ya esté pendiente en la lista de esa sede.
  async addFromRecommendation(
    productId: string,
    branchId: string,
    userId: string,
    note?: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const existing = await this.prisma.purchaseListItem.findFirst({
      where: { productId, branchId, resolved: false },
    });
    if (existing) {
      throw new BadRequestException(
        'Ese producto ya está en la lista de compras pendiente',
      );
    }

    const item = await this.prisma.purchaseListItem.create({
      data: {
        productId,
        note: note?.trim() || null,
        source: 'AUTO',
        branchId,
        createdById: userId,
      },
      include: ITEM_INCLUDE,
    });
    return JSON.parse(JSON.stringify(item)) as typeof item;
  }

  // Marca un ítem como comprado/resuelto (o lo reactiva).
  async setResolved(id: string, resolved: boolean) {
    const item = await this.prisma.purchaseListItem.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    const updated = await this.prisma.purchaseListItem.update({
      where: { id },
      data: { resolved },
      include: ITEM_INCLUDE,
    });
    return JSON.parse(JSON.stringify(updated)) as typeof updated;
  }

  async remove(id: string) {
    const item = await this.prisma.purchaseListItem.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    await this.prisma.purchaseListItem.delete({ where: { id } });
    return { message: 'Ítem eliminado' };
  }

  // Motor de recomendaciones: combina stock bajo, rotación alta y proyección
  // de agotamiento. Se calcula en vivo a partir de inventario + ventas de la
  // ventana. No persiste nada hasta que alguien lo agrega a la lista.
  async recommendations(branchId?: string): Promise<PurchaseRecommendation[]> {
    const inventoryWhere: Prisma.InventoryWhereInput = branchId
      ? { branchId }
      : {};
    const inventory = await this.prisma.inventory.findMany({
      where: inventoryWhere,
      include: {
        product: { include: { category: true } },
        branch: true,
      },
    });

    const since = new Date();
    since.setDate(since.getDate() - VELOCITY_WINDOW_DAYS);

    // Unidades vendidas por (sede, producto) en la ventana.
    const saleWhere: Prisma.SaleWhereInput = {
      status: 'COMPLETED',
      createdAt: { gte: since },
    };
    if (branchId) saleWhere.branchId = branchId;

    const details = await this.prisma.saleDetail.findMany({
      where: { sale: saleWhere },
      include: { sale: { select: { branchId: true } } },
    });

    const soldMap = new Map<string, number>(); // `${branchId}:${productId}` -> unidades
    for (const d of details) {
      const key = `${d.sale.branchId}:${d.productId}`;
      soldMap.set(key, (soldMap.get(key) ?? 0) + d.quantity);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const recs: PurchaseRecommendation[] = [];

    for (const inv of inventory) {
      const sold = soldMap.get(`${inv.branchId}:${inv.productId}`) ?? 0;
      const dailyVelocity = sold / VELOCITY_WINDOW_DAYS;
      const daysUntilEmpty =
        dailyVelocity > 0 ? inv.amount / dailyVelocity : null;

      const reasons: string[] = [];
      if (inv.amount <= LOW_STOCK_THRESHOLD) {
        reasons.push(
          inv.amount === 0 ? 'Agotado' : `Stock bajo (${inv.amount} u.)`,
        );
      }
      if (daysUntilEmpty !== null && daysUntilEmpty <= DAYS_OF_COVER) {
        reasons.push(
          `Se agota en ~${Math.max(1, Math.round(daysUntilEmpty))} día(s) al ritmo actual`,
        );
      }
      if (sold >= FREQUENT_UNITS) {
        reasons.push(
          `Alta rotación (${sold} vendidas en ${VELOCITY_WINDOW_DAYS} días)`,
        );
      }

      if (reasons.length === 0) continue;

      recs.push({
        productId: inv.productId,
        productName: inv.product.name,
        categoryName: inv.product.category.name,
        branchId: inv.branchId,
        branchName: inv.branch.name,
        currentStock: inv.amount,
        soldLastPeriod: sold,
        dailyVelocity: round(dailyVelocity),
        daysUntilEmpty: daysUntilEmpty !== null ? round(daysUntilEmpty) : null,
        reasons,
      });
    }

    // Excluir productos que ya están en la lista pendiente (para no repetir).
    const pending = await this.prisma.purchaseListItem.findMany({
      where: {
        resolved: false,
        productId: { not: null },
        ...(branchId ? { branchId } : {}),
      },
      select: { productId: true, branchId: true },
    });
    const pendingSet = new Set(
      pending.map((p) => `${p.branchId}:${p.productId}`),
    );

    const filtered = recs.filter(
      (r) => !pendingSet.has(`${r.branchId}:${r.productId}`),
    );

    // Ordenar por urgencia: primero lo que se agota antes, luego menor stock.
    filtered.sort((a, b) => {
      const da = a.daysUntilEmpty ?? Number.POSITIVE_INFINITY;
      const db = b.daysUntilEmpty ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.currentStock - b.currentStock;
    });

    return filtered;
  }
}
