import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getStock(branchId?: string) {
    const where = branchId ? { branchId } : {};
    const inventory = await this.prisma.inventory.findMany({
      where,
      include: {
        product: { include: { category: true } },
        branch: true,
      },
      orderBy: { product: { name: 'asc' } },
    });
    return JSON.parse(JSON.stringify(inventory)) as typeof inventory;
  }

  async getMovements(branchId?: string, limit = 50) {
    const where = branchId ? { branchId } : {};
    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        product: true,
        branch: true,
        inventory: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return JSON.parse(JSON.stringify(movements)) as typeof movements;
  }

  async adjustStock(dto: AdjustStockDto) {
    const { productId, branchId, quantity, type, note } = dto;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    let inventory = await this.prisma.inventory.findUnique({
      where: { branchId_productId: { branchId, productId } },
    });

    if (!inventory) {
      inventory = await this.prisma.inventory.create({
        data: { branchId, productId, amount: 0 },
      });
    }

    const delta =
      type === 'STOCK_IN' ? quantity : type === 'STOCK_OUT' ? -quantity : 0;

    if (delta < 0 && inventory.amount + delta < 0) {
      throw new BadRequestException('Stock insuficiente');
    }

    const updated = await this.prisma.inventory.update({
      where: { id: inventory.id },
      data: { amount: inventory.amount + delta },
    });

    const movement = await this.prisma.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        productId,
        branchId,
        quantity,
        type,
        note,
      },
    });

    return JSON.parse(JSON.stringify({ inventory: updated, movement })) as {
      inventory: typeof updated;
      movement: typeof movement;
    };
  }

  async getLowStock(threshold = 5) {
    const low = await this.prisma.inventory.findMany({
      where: { amount: { lte: threshold } },
      include: {
        product: { include: { category: true } },
        branch: true,
      },
      orderBy: { amount: 'asc' },
    });
    return JSON.parse(JSON.stringify(low)) as typeof low;
  }
}
