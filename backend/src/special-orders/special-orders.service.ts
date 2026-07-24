import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SpecialOrderStatus, SpecialOrderPaymentKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialOrderDto } from './dto/create-special-order.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

const ORDER_INCLUDE = {
  branch: true,
  createdBy: { select: { id: true, username: true } },
  payments: { orderBy: { createdAt: 'asc' } },
} as const;

// Orden en que puede avanzar el estado (no se permite retroceder).
const STATUS_FLOW: SpecialOrderStatus[] = [
  'DEPOSITED',
  'ORDERED',
  'ARRIVED',
  'PICKED_UP',
];

@Injectable()
export class SpecialOrdersService {
  constructor(private prisma: PrismaService) {}

  private round(n: number) {
    return Math.round(n * 100) / 100;
  }

  // Caja abierta de la sede (o null). Los pagos se vinculan a ella para el
  // cuadre; si no hay caja abierta, el pago queda sin sesión (cashSessionId
  // null) y no afecta ningún cierre.
  private async openSessionId(branchId: string): Promise<string | null> {
    const session = await this.prisma.cashSession.findFirst({
      where: { branchId, status: 'OPEN' },
      select: { id: true },
    });
    return session?.id ?? null;
  }

  async create(dto: CreateSpecialOrderDto, userId: string, branchId: string) {
    const deposit = dto.depositAmount ?? 0;
    if (deposit > dto.totalAmount + 0.01) {
      throw new BadRequestException(
        'El abono no puede ser mayor que el valor total del pedido',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const cashSessionId =
      deposit > 0 ? await this.openSessionId(branchId) : null;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.specialOrder.create({
        data: {
          customerName: dto.customerName.trim(),
          partName: dto.partName.trim(),
          description: dto.description?.trim() || null,
          totalAmount: dto.totalAmount,
          depositedAmount: deposit,
          estimatedArrival: dto.estimatedArrival
            ? new Date(dto.estimatedArrival)
            : null,
          branchId,
          createdById: userId,
        },
      });

      if (deposit > 0) {
        // Si el abono cubre el total desde el inicio, se marca como FINAL.
        const kind: SpecialOrderPaymentKind =
          deposit >= dto.totalAmount - 0.01 ? 'FINAL' : 'DEPOSIT';
        await tx.specialOrderPayment.create({
          data: {
            specialOrderId: created.id,
            amount: deposit,
            paymentMethod: dto.depositMethod!,
            kind,
            cashSessionId,
          },
        });
      }

      return created;
    });

    return this.findOne(order.id);
  }

  async findAll(branchId?: string, status?: SpecialOrderStatus) {
    const orders = await this.prisma.specialOrder.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(status ? { status } : {}),
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return JSON.parse(JSON.stringify(orders)) as typeof orders;
  }

  async findOne(id: string) {
    const order = await this.prisma.specialOrder.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Pedido especial no encontrado');
    return JSON.parse(JSON.stringify(order)) as NonNullable<typeof order>;
  }

  // Registra un abono/pago. El monto no puede superar el saldo pendiente. Si
  // con este pago se completa el total, el pago se marca como FINAL.
  async addPayment(id: string, dto: AddPaymentDto) {
    const order = await this.prisma.specialOrder.findUnique({
      where: { id },
    });
    if (!order) throw new NotFoundException('Pedido especial no encontrado');

    const total = Number(order.totalAmount);
    const deposited = Number(order.depositedAmount);
    const pending = this.round(total - deposited);
    if (pending <= 0) {
      throw new BadRequestException('Este pedido ya está pagado por completo');
    }
    if (dto.amount > pending + 0.01) {
      throw new BadRequestException(
        `El pago (${dto.amount}) supera el saldo pendiente (${pending})`,
      );
    }

    const cashSessionId = await this.openSessionId(order.branchId);
    const newDeposited = this.round(deposited + dto.amount);
    const kind: SpecialOrderPaymentKind =
      newDeposited >= total - 0.01 ? 'FINAL' : 'DEPOSIT';

    await this.prisma.$transaction(async (tx) => {
      await tx.specialOrderPayment.create({
        data: {
          specialOrderId: id,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          kind,
          cashSessionId,
        },
      });
      await tx.specialOrder.update({
        where: { id },
        data: { depositedAmount: newDeposited },
      });
    });

    return this.findOne(id);
  }

  // Avanza el estado. Solo permite ir hacia adelante en el flujo.
  async updateStatus(id: string, dto: UpdateStatusDto) {
    const order = await this.prisma.specialOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido especial no encontrado');

    const currentIdx = STATUS_FLOW.indexOf(order.status);
    const nextIdx = STATUS_FLOW.indexOf(dto.status);
    if (nextIdx < currentIdx) {
      throw new BadRequestException(
        'El estado de un pedido no puede retroceder',
      );
    }

    // Para marcar como recogido, el pedido debe estar totalmente pagado.
    if (dto.status === 'PICKED_UP') {
      const pending = this.round(
        Number(order.totalAmount) - Number(order.depositedAmount),
      );
      if (pending > 0.01) {
        throw new BadRequestException(
          `No se puede entregar: el cliente aún debe ${pending}. Registra el pago del saldo primero`,
        );
      }
    }

    await this.prisma.specialOrder.update({
      where: { id },
      data: { status: dto.status },
    });

    return this.findOne(id);
  }
}
