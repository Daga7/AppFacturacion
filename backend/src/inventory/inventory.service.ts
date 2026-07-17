import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';

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

    if (type !== 'STOCK_IN' && type !== 'STOCK_OUT') {
      throw new BadRequestException(
        'Este endpoint solo acepta movimientos STOCK_IN o STOCK_OUT',
      );
    }

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

  async transferStock(dto: TransferStockDto) {
    const { fromBranchId, toBranchId, items, note } = dto;

    if (fromBranchId === toBranchId) {
      throw new BadRequestException(
        'La sucursal de origen y destino deben ser distintas',
      );
    }

    const [from, to] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: fromBranchId } }),
      this.prisma.branch.findUnique({ where: { id: toBranchId } }),
    ]);
    if (!from) throw new NotFoundException('Sucursal de origen no encontrada');
    if (!to) throw new NotFoundException('Sucursal de destino no encontrada');

    const movements = await this.prisma.$transaction(async (tx) => {
      const created: { id: string }[] = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new NotFoundException(
            `Producto ${item.productId} no encontrado`,
          );
        }

        const source = await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId: fromBranchId,
              productId: item.productId,
            },
          },
        });
        if (!source || source.amount < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente de "${product.name}" en ${from.name} (disponible: ${source?.amount ?? 0})`,
          );
        }

        await tx.inventory.update({
          where: { id: source.id },
          data: { amount: { decrement: item.quantity } },
        });

        const dest = await tx.inventory.upsert({
          where: {
            branchId_productId: {
              branchId: toBranchId,
              productId: item.productId,
            },
          },
          create: {
            branchId: toBranchId,
            productId: item.productId,
            amount: item.quantity,
          },
          update: { amount: { increment: item.quantity } },
        });

        const movementOut = await tx.inventoryMovement.create({
          data: {
            inventoryId: source.id,
            productId: item.productId,
            branchId: fromBranchId,
            quantity: item.quantity,
            type: 'BRANCH_TRANSFER',
            note: note ? `Hacia ${to.name} — ${note}` : `Hacia ${to.name}`,
          },
        });
        const movementIn = await tx.inventoryMovement.create({
          data: {
            inventoryId: dest.id,
            productId: item.productId,
            branchId: toBranchId,
            quantity: item.quantity,
            type: 'BRANCH_TRANSFER',
            note: note ? `Desde ${from.name} — ${note}` : `Desde ${from.name}`,
          },
        });
        created.push(movementOut, movementIn);
      }

      return created;
    });

    return JSON.parse(JSON.stringify({ movements })) as {
      movements: typeof movements;
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
