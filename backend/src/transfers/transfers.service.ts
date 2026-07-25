import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { ResolveTransferRequestDto } from './dto/resolve-transfer-request.dto';

// Detalle que se devuelve al frontend en cada solicitud.
const REQUEST_INCLUDE = {
  product: { include: { category: true } },
  fromBranch: true,
  toBranch: true,
  requestedBy: { select: { id: true, username: true } },
  resolvedBy: { select: { id: true, username: true } },
} as const;

@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService) {}

  // El vendedor crea una solicitud PENDING. No se toca el inventario todavía;
  // solo se valida que las sedes y el producto existan y que haya stock actual
  // en el origen (validación informativa; el descuento real ocurre al aprobar).
  async create(dto: CreateTransferRequestDto, userId: string) {
    const { fromBranchId, toBranchId, productId, quantity, note } = dto;

    // El controlador rellena fromBranchId con la sede del usuario (siempre para
    // el vendedor). Si llegara vacío (p. ej. un admin que no la indica), no hay
    // origen válido para el traslado.
    if (!fromBranchId) {
      throw new BadRequestException('Falta la sucursal de origen');
    }

    if (fromBranchId === toBranchId) {
      throw new BadRequestException(
        'La sucursal de origen y destino deben ser distintas',
      );
    }

    const [from, to, product] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: fromBranchId } }),
      this.prisma.branch.findUnique({ where: { id: toBranchId } }),
      this.prisma.product.findUnique({ where: { id: productId } }),
    ]);
    if (!from) throw new NotFoundException('Sucursal de origen no encontrada');
    if (!to) throw new NotFoundException('Sucursal de destino no encontrada');
    if (!product) throw new NotFoundException('Producto no encontrado');

    const source = await this.prisma.inventory.findUnique({
      where: { branchId_productId: { branchId: fromBranchId, productId } },
    });
    if (!source || source.amount < quantity) {
      throw new BadRequestException(
        `Stock insuficiente de "${product.name}" en ${from.name} (disponible: ${source?.amount ?? 0})`,
      );
    }

    const request = await this.prisma.branchTransferRequest.create({
      data: {
        fromBranchId,
        toBranchId,
        productId,
        quantity,
        note: note?.trim() || null,
        requestedById: userId,
      },
      include: REQUEST_INCLUDE,
    });

    return JSON.parse(JSON.stringify(request)) as typeof request;
  }

  // Listado con filtros opcionales por estado y sede de origen. El vendedor
  // pasa su sede para ver solo lo que él originó; el admin ve todo.
  async findAll(status?: RequestStatus, fromBranchId?: string) {
    const requests = await this.prisma.branchTransferRequest.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(fromBranchId ? { fromBranchId } : {}),
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return JSON.parse(JSON.stringify(requests)) as typeof requests;
  }

  async findOne(id: string) {
    const request = await this.prisma.branchTransferRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    return JSON.parse(JSON.stringify(request)) as NonNullable<typeof request>;
  }

  // Aprobación (solo ADMIN): dentro de una transacción descuenta el origen,
  // aumenta el destino y registra los dos movimientos BRANCH_TRANSFER (misma
  // convención de signo que inventory.transferStock). Vuelve a validar el
  // stock porque pudo cambiar desde que se creó la solicitud.
  async approve(id: string, dto: ResolveTransferRequestDto, adminId: string) {
    const request = await this.prisma.branchTransferRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        'Esta solicitud ya fue resuelta; no se puede aprobar de nuevo',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const [product, from, to] = await Promise.all([
        tx.product.findUnique({ where: { id: request.productId } }),
        tx.branch.findUnique({ where: { id: request.fromBranchId } }),
        tx.branch.findUnique({ where: { id: request.toBranchId } }),
      ]);
      if (!product) throw new NotFoundException('Producto no encontrado');
      if (!from || !to) throw new NotFoundException('Sucursal no encontrada');

      const source = await tx.inventory.findUnique({
        where: {
          branchId_productId: {
            branchId: request.fromBranchId,
            productId: request.productId,
          },
        },
      });
      if (!source || source.amount < request.quantity) {
        throw new BadRequestException(
          `Stock insuficiente de "${product.name}" en ${from.name} (disponible: ${source?.amount ?? 0})`,
        );
      }

      await tx.inventory.update({
        where: { id: source.id },
        data: { amount: { decrement: request.quantity } },
      });

      const dest = await tx.inventory.upsert({
        where: {
          branchId_productId: {
            branchId: request.toBranchId,
            productId: request.productId,
          },
        },
        create: {
          branchId: request.toBranchId,
          productId: request.productId,
          amount: request.quantity,
        },
        update: { amount: { increment: request.quantity } },
      });

      const transferGroupId = crypto.randomUUID();

      await tx.inventoryMovement.create({
        data: {
          inventoryId: source.id,
          productId: request.productId,
          branchId: request.fromBranchId,
          quantity: -request.quantity,
          type: 'BRANCH_TRANSFER',
          transferGroupId,
          note: request.note,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryId: dest.id,
          productId: request.productId,
          branchId: request.toBranchId,
          quantity: request.quantity,
          type: 'BRANCH_TRANSFER',
          transferGroupId,
          note: request.note,
        },
      });

      await tx.branchTransferRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          resolvedById: adminId,
          resolvedAt: new Date(),
          transferGroupId,
          ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        },
      });
    });

    return this.findOne(id);
  }

  // Rechazo (solo ADMIN): no toca inventario, solo marca la solicitud.
  async reject(id: string, dto: ResolveTransferRequestDto, adminId: string) {
    const request = await this.prisma.branchTransferRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        'Esta solicitud ya fue resuelta; no se puede rechazar de nuevo',
      );
    }

    await this.prisma.branchTransferRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        resolvedById: adminId,
        resolvedAt: new Date(),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
    });

    return this.findOne(id);
  }
}
