import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TX_OPTIONS } from '../sync/offline';
import { CreateWarrantyDto } from './dto/create-warranty.dto';

// Detalle que se devuelve al frontend en cada garantía.
const CLAIM_INCLUDE = {
  product: { include: { category: true } },
  branch: true,
  requestedBy: { select: { id: true, username: true } },
  resolvedBy: { select: { id: true, username: true } },
} as const;

@Injectable()
export class WarrantiesService {
  constructor(private prisma: PrismaService) {}

  // El vendedor registra la mercancía defectuosa en PENDING. No se toca el
  // inventario todavía; solo se valida que la sede tenga esas unidades (sin
  // contar las que ya están en otras garantías pendientes). El descuento
  // real ocurre cuando el administrador aprueba.
  async create(dto: CreateWarrantyDto, branchId: string, userId: string) {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Describe la falla de la mercancía');
    }

    const [branch, product] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: branchId } }),
      this.prisma.product.findUnique({ where: { id: dto.productId } }),
    ]);
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    if (!product) throw new NotFoundException('Producto no encontrado');

    const [inventory, pending] = await Promise.all([
      this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId, productId: product.id } },
      }),
      this.prisma.warrantyClaim.aggregate({
        where: { branchId, productId: product.id, status: 'PENDING' },
        _sum: { quantity: true },
      }),
    ]);
    const inStock = inventory?.amount ?? 0;
    const alreadyClaimed = pending._sum.quantity ?? 0;
    if (dto.quantity > inStock - alreadyClaimed) {
      throw new BadRequestException(
        alreadyClaimed > 0
          ? `Stock insuficiente de "${product.name}" en ${branch.name}: hay ${inStock} y ${alreadyClaimed} ya están en garantías pendientes`
          : `Stock insuficiente de "${product.name}" en ${branch.name} (disponible: ${inStock})`,
      );
    }

    const claim = await this.prisma.warrantyClaim.create({
      data: {
        branchId,
        productId: product.id,
        quantity: dto.quantity,
        reason,
        supplier: dto.supplier?.trim() || null,
        requestedById: userId,
      },
      include: CLAIM_INCLUDE,
    });
    return JSON.parse(JSON.stringify(claim)) as typeof claim;
  }

  // Listado con filtros opcionales por estado y sede. El vendedor pasa su
  // sede para ver solo las suyas; el admin y el supervisor ven todas.
  async findAll(status?: RequestStatus, branchId?: string) {
    if (status && !Object.values(RequestStatus).includes(status)) {
      throw new BadRequestException('Estado no válido');
    }
    const claims = await this.prisma.warrantyClaim.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(branchId ? { branchId } : {}),
      },
      include: CLAIM_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return JSON.parse(JSON.stringify(claims)) as typeof claims;
  }

  private async findOne(id: string) {
    const claim = await this.prisma.warrantyClaim.findUnique({
      where: { id },
      include: CLAIM_INCLUDE,
    });
    if (!claim) throw new NotFoundException('Garantía no encontrada');
    return JSON.parse(JSON.stringify(claim)) as NonNullable<typeof claim>;
  }

  // Aprobación (solo ADMIN): la mercancía sale del stock de la sede con un
  // movimiento WARRANTY. Se vuelve a validar el stock porque pudo venderse
  // desde que se registró la garantía.
  async approve(id: string, adminId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Marcar primero: si dos administradores aprueban a la vez, solo uno
      // encuentra la garantía todavía pendiente.
      const { count } = await tx.warrantyClaim.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          resolvedById: adminId,
          resolvedAt: new Date(),
        },
      });
      const claim = await tx.warrantyClaim.findUnique({
        where: { id },
        include: { product: true, branch: true },
      });
      if (!claim) throw new NotFoundException('Garantía no encontrada');
      if (count === 0) {
        throw new BadRequestException('Esta garantía ya fue resuelta');
      }

      const inventory = await tx.inventory.findUnique({
        where: {
          branchId_productId: {
            branchId: claim.branchId,
            productId: claim.productId,
          },
        },
      });
      const taken = inventory
        ? await tx.inventory.updateMany({
            where: { id: inventory.id, amount: { gte: claim.quantity } },
            data: { amount: { decrement: claim.quantity } },
          })
        : { count: 0 };
      if (!inventory || taken.count === 0) {
        throw new BadRequestException(
          `Stock insuficiente de "${claim.product.name}" en ${claim.branch.name} (disponible: ${inventory?.amount ?? 0}); puede que ya se haya vendido`,
        );
      }

      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          productId: claim.productId,
          branchId: claim.branchId,
          quantity: -claim.quantity,
          type: 'WARRANTY',
          note: `Garantía${claim.supplier ? ` a ${claim.supplier}` : ' al proveedor'}: ${claim.reason}`,
        },
      });
    }, TX_OPTIONS);

    return this.findOne(id);
  }

  // Rechazo (solo ADMIN): no toca el inventario, solo marca la garantía.
  async reject(id: string, adminId: string) {
    const { count } = await this.prisma.warrantyClaim.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });
    if (count === 0) {
      await this.findOne(id); // 404 si no existe
      throw new BadRequestException('Esta garantía ya fue resuelta');
    }
    return this.findOne(id);
  }
}
