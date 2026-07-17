import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InventoryMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { BulkAdjustStockDto } from './dto/bulk-adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';

// Convención de cantidades en InventoryMovement (igual que SALE en sales.service):
// positiva = entra stock a la sucursal, negativa = sale stock de la sucursal.
// En una transferencia el lado negativo es el origen y el positivo el destino.

const EDITABLE_TYPES: InventoryMovementType[] = [
  'STOCK_IN',
  'STOCK_OUT',
  'BRANCH_TRANSFER',
];

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

  async getMovements(
    branchId?: string,
    limit = 50,
    type?: InventoryMovementType,
  ) {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(type ? { type } : {}),
      },
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
    const result = await this.adjustStockBulk({
      branchId: dto.branchId,
      type: dto.type,
      note: dto.note,
      items: [{ productId: dto.productId, quantity: dto.quantity }],
    });
    return { inventory: result.inventories[0], movement: result.movements[0] };
  }

  async adjustStockBulk(dto: BulkAdjustStockDto) {
    const { branchId, type, items, note } = dto;

    if (type !== 'STOCK_IN' && type !== 'STOCK_OUT') {
      throw new BadRequestException(
        'Este endpoint solo acepta movimientos STOCK_IN o STOCK_OUT',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const result = await this.prisma.$transaction(async (tx) => {
      const inventories: { id: string; amount: number }[] = [];
      const movements: { id: string }[] = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new NotFoundException(
            `Producto ${item.productId} no encontrado`,
          );
        }

        let inventory = await tx.inventory.findUnique({
          where: {
            branchId_productId: { branchId, productId: item.productId },
          },
        });
        if (!inventory) {
          inventory = await tx.inventory.create({
            data: { branchId, productId: item.productId, amount: 0 },
          });
        }

        const delta = type === 'STOCK_IN' ? item.quantity : -item.quantity;
        if (inventory.amount + delta < 0) {
          throw new BadRequestException(
            `Stock insuficiente de "${product.name}" en ${branch.name} (disponible: ${inventory.amount})`,
          );
        }

        const updated = await tx.inventory.update({
          where: { id: inventory.id },
          data: { amount: inventory.amount + delta },
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            productId: item.productId,
            branchId,
            quantity: delta,
            type,
            note,
          },
        });

        inventories.push(updated);
        movements.push(movement);
      }

      return { inventories, movements };
    });

    return JSON.parse(JSON.stringify(result)) as typeof result;
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

        const transferGroupId = crypto.randomUUID();

        const movementOut = await tx.inventoryMovement.create({
          data: {
            inventoryId: source.id,
            productId: item.productId,
            branchId: fromBranchId,
            quantity: -item.quantity,
            type: 'BRANCH_TRANSFER',
            transferGroupId,
            note,
          },
        });
        const movementIn = await tx.inventoryMovement.create({
          data: {
            inventoryId: dest.id,
            productId: item.productId,
            branchId: toBranchId,
            quantity: item.quantity,
            type: 'BRANCH_TRANSFER',
            transferGroupId,
            note,
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

  async updateMovement(id: string, dto: UpdateMovementDto) {
    const movement = await this.prisma.inventoryMovement.findUnique({
      where: { id },
      include: { product: true, branch: true },
    });
    if (!movement) throw new NotFoundException('Movimiento no encontrado');

    if (!EDITABLE_TYPES.includes(movement.type)) {
      throw new BadRequestException(
        'Solo se pueden editar movimientos de ingreso, salida o transferencia; los de ventas se gestionan desde facturación',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (movement.type === 'BRANCH_TRANSFER') {
        if (!movement.transferGroupId) {
          throw new BadRequestException(
            'Esta transferencia no tiene vínculo entre sus dos lados y no se puede editar',
          );
        }

        const pair = await tx.inventoryMovement.findMany({
          where: { transferGroupId: movement.transferGroupId },
          include: { branch: true, product: true },
        });
        const out = pair.find((m) => m.quantity < 0);
        const into = pair.find((m) => m.quantity > 0);
        if (!out || !into) {
          throw new BadRequestException(
            'La transferencia está incompleta y no se puede editar',
          );
        }

        if (dto.quantity !== undefined && dto.quantity !== into.quantity) {
          const oldQ = into.quantity;
          const newQ = dto.quantity;

          const source = await tx.inventory.findUnique({
            where: { id: out.inventoryId },
          });
          const dest = await tx.inventory.findUnique({
            where: { id: into.inventoryId },
          });
          if (!source || !dest) {
            throw new NotFoundException(
              'Inventario de la transferencia no encontrado',
            );
          }

          const sourceNew = source.amount + (oldQ - newQ);
          const destNew = dest.amount + (newQ - oldQ);
          if (sourceNew < 0) {
            throw new BadRequestException(
              `Stock insuficiente en ${out.branch.name}: el cambio dejaría su stock en ${sourceNew}`,
            );
          }
          if (destNew < 0) {
            throw new BadRequestException(
              `El cambio dejaría el stock de ${into.branch.name} en ${destNew} (ya se consumieron unidades transferidas)`,
            );
          }

          await tx.inventory.update({
            where: { id: source.id },
            data: { amount: sourceNew },
          });
          await tx.inventory.update({
            where: { id: dest.id },
            data: { amount: destNew },
          });
          await tx.inventoryMovement.update({
            where: { id: out.id },
            data: { quantity: -newQ },
          });
          await tx.inventoryMovement.update({
            where: { id: into.id },
            data: { quantity: newQ },
          });
        }

        if (dto.note !== undefined) {
          await tx.inventoryMovement.updateMany({
            where: { transferGroupId: movement.transferGroupId },
            data: { note: dto.note || null },
          });
        }

        return tx.inventoryMovement.findMany({
          where: { transferGroupId: movement.transferGroupId },
          include: { product: true, branch: true },
        });
      }

      // STOCK_IN / STOCK_OUT: la cantidad guardada ya tiene signo; el DTO
      // recibe siempre una cantidad positiva y aquí se le aplica el signo.
      if (dto.quantity !== undefined) {
        const newSigned =
          movement.type === 'STOCK_IN' ? dto.quantity : -dto.quantity;

        if (newSigned !== movement.quantity) {
          const inventory = await tx.inventory.findUnique({
            where: { id: movement.inventoryId },
          });
          if (!inventory) {
            throw new NotFoundException(
              'Inventario del movimiento no encontrado',
            );
          }

          const newAmount = inventory.amount - movement.quantity + newSigned;
          if (newAmount < 0) {
            throw new BadRequestException(
              `El cambio dejaría el stock de ${movement.branch.name} en ${newAmount}`,
            );
          }

          await tx.inventory.update({
            where: { id: inventory.id },
            data: { amount: newAmount },
          });
          await tx.inventoryMovement.update({
            where: { id },
            data: { quantity: newSigned },
          });
        }
      }

      if (dto.note !== undefined) {
        await tx.inventoryMovement.update({
          where: { id },
          data: { note: dto.note || null },
        });
      }

      return tx.inventoryMovement.findMany({
        where: { id },
        include: { product: true, branch: true },
      });
    });

    return JSON.parse(JSON.stringify({ movements: result })) as {
      movements: typeof result;
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
