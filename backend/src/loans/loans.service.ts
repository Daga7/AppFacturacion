import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LoanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanPaymentDto } from './dto/create-loan-payment.dto';
import { ExchangeLoanDto } from './dto/exchange-loan.dto';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  async findAll(branchId?: string, status?: LoanStatus) {
    const loans = await this.prisma.loan.findMany({
      where: {
        ...(status ? { loanStatus: status } : {}),
        ...(branchId ? { sale: { branchId } } : {}),
      },
      include: {
        customer: true,
        payments: { orderBy: { createdAt: 'desc' } },
        sale: {
          include: {
            branch: true,
            details: { include: { product: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return JSON.parse(JSON.stringify(loans)) as typeof loans;
  }

  // Devolución: el cliente regresa la mercancía. Se devuelve el stock, se
  // elimina el préstamo (incluidos sus abonos) y la venta queda cancelada.
  async returnLoan(loanId: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        payments: true,
        sale: { include: { details: true } },
      },
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (loan.loanStatus === 'PAID') {
      throw new BadRequestException(
        'El préstamo ya está pagado; no aplica devolución desde aquí',
      );
    }
    if (loan.sale.status === 'CANCELLED') {
      throw new BadRequestException('La venta del préstamo ya está cancelada');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const d of loan.sale.details) {
        const inventory = await tx.inventory.upsert({
          where: {
            branchId_productId: {
              branchId: loan.sale.branchId,
              productId: d.productId,
            },
          },
          create: {
            branchId: loan.sale.branchId,
            productId: d.productId,
            amount: d.quantity,
          },
          update: { amount: { increment: d.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            productId: d.productId,
            branchId: loan.sale.branchId,
            quantity: d.quantity,
            type: 'RETURN',
            saleDetailId: d.id,
            note: 'Devolución de préstamo',
          },
        });
      }

      await tx.loanPayment.deleteMany({ where: { loanId } });
      await tx.loan.delete({ where: { id: loanId } });
      await tx.sale.update({
        where: { id: loan.saleId },
        data: { status: 'CANCELLED' },
      });
    });

    return { message: 'Préstamo eliminado y mercancía devuelta al inventario' };
  }

  // Cambio de mercancía: los productos nuevos reemplazan a los del préstamo.
  // Se devuelve el stock anterior, se descuenta el nuevo y el saldo se
  // recalcula respetando los pagos y abonos ya hechos.
  async exchange(loanId: string, dto: ExchangeLoanDto) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        payments: true,
        sale: { include: { details: true, payments: true, branch: true } },
      },
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (loan.loanStatus === 'PAID') {
      throw new BadRequestException('El préstamo ya está pagado');
    }
    if (loan.sale.status === 'CANCELLED') {
      throw new BadRequestException('La venta del préstamo está cancelada');
    }

    const productIds = dto.details.map((d) => d.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'No repitas el mismo producto en varias filas',
      );
    }

    const productNames = new Map<string, string>();
    let newTotal = 0;
    for (const item of dto.details) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });
      if (!product)
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);
      productNames.set(product.id, product.name);
      newTotal += item.unitPrice * item.quantity;
    }

    const paymentsAtSale = loan.sale.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const abonos = loan.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const newOriginal = newTotal - paymentsAtSale;
    const newPending = newOriginal - abonos;
    if (newPending < -0.01) {
      throw new BadRequestException(
        `El nuevo valor (${newTotal}) es menor que lo ya pagado y abonado (${paymentsAtSale + abonos})`,
      );
    }

    const branchId = loan.sale.branchId;

    await this.prisma.$transaction(async (tx) => {
      // 1. Devolver el stock de los productos actuales
      for (const d of loan.sale.details) {
        await tx.inventoryMovement.deleteMany({
          where: { saleDetailId: d.id },
        });
        await tx.inventory.upsert({
          where: { branchId_productId: { branchId, productId: d.productId } },
          create: { branchId, productId: d.productId, amount: d.quantity },
          update: { amount: { increment: d.quantity } },
        });
      }
      await tx.saleDetail.deleteMany({ where: { saleId: loan.saleId } });

      // 2. Registrar los productos nuevos validando stock
      for (const item of dto.details) {
        const inventory = await tx.inventory.findUnique({
          where: {
            branchId_productId: { branchId, productId: item.productId },
          },
        });
        if (!inventory || inventory.amount < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para "${productNames.get(item.productId)}". Disponible: ${inventory?.amount ?? 0}`,
          );
        }
        const detail = await tx.saleDetail.create({
          data: {
            saleId: loan.saleId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: 0,
            subtotal: item.unitPrice * item.quantity,
          },
        });
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { amount: { decrement: item.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            productId: item.productId,
            branchId,
            quantity: -item.quantity,
            type: 'EXCHANGE',
            saleDetailId: detail.id,
            note: 'Cambio de mercancía en préstamo',
          },
        });
      }

      await tx.sale.update({
        where: { id: loan.saleId },
        data: { total: newTotal },
      });
      await tx.loan.update({
        where: { id: loanId },
        data: {
          originalAmount: Math.max(0, newOriginal),
          pendingAmount: Math.max(0, newPending),
          loanStatus: newPending <= 0.01 ? 'PAID' : 'ACTIVE',
        },
      });
    });

    const updated = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: true,
        payments: true,
        sale: {
          include: { branch: true, details: { include: { product: true } } },
        },
      },
    });
    return JSON.parse(JSON.stringify(updated)) as typeof updated;
  }

  async addPayment(loanId: string, dto: CreateLoanPaymentDto) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { sale: { select: { branchId: true } } },
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (loan.loanStatus === 'PAID') {
      throw new BadRequestException('El préstamo ya está pagado');
    }

    // El abono entra a la caja abierta de la sede donde se hizo el préstamo,
    // para que aparezca en el cierre y en el informe de Telegram.
    const openSession = await this.prisma.cashSession.findFirst({
      where: { branchId: loan.sale.branchId, status: 'OPEN' },
      select: { id: true },
    });

    const pending = Number(loan.pendingAmount);
    if (dto.amount > pending + 0.01) {
      throw new BadRequestException(
        `El abono (${dto.amount}) supera el saldo pendiente (${pending})`,
      );
    }

    const newPending = Math.max(0, pending - dto.amount);

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.loanPayment.create({
        data: {
          loanId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          cashSessionId: openSession?.id ?? null,
        },
      });

      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          pendingAmount: newPending,
          loanStatus: newPending <= 0 ? 'PAID' : 'ACTIVE',
        },
        include: { customer: true, payments: true },
      });

      return { payment, loan: updated };
    });

    return JSON.parse(JSON.stringify(result)) as typeof result;
  }
}
