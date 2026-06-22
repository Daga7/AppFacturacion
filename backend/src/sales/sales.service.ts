import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSaleDto, userId: string) {
    const { branchId, customerId, isCredit, details, payments } = dto;

    if (details.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un producto');
    }

    let total = 0;
    const saleDetails: {
      productId: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      subtotal: number;
    }[] = [];

    for (const item of details) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });
      if (!product)
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);

      const inventory = await this.prisma.inventory.findUnique({
        where: {
          branchId_productId: { branchId, productId: item.productId },
        },
      });

      if (!inventory || inventory.amount < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para "${product.name}". Disponible: ${inventory?.amount ?? 0}`,
        );
      }

      const subtotal = item.unitPrice * item.quantity - (item.discount ?? 0);
      total += subtotal;

      saleDetails.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount ?? 0,
        subtotal,
      });
    }

    const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    const diff = Math.abs(total - paymentsTotal);
    if (diff > 0.01 && !isCredit) {
      throw new BadRequestException(
        `El total de pagos (${paymentsTotal}) no coincide con el total (${total})`,
      );
    }

    const lastInvoice = await this.prisma.sale.findFirst({
      where: { branchId },
      orderBy: { invoiceNumber: 'desc' },
    });
    const invoiceNumber = (lastInvoice?.invoiceNumber ?? 0) + 1;

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          total,
          isCredit: isCredit ?? false,
          status: 'COMPLETED',
          branchId,
          userId,
          customerId,
          details: {
            create: saleDetails,
          },
        },
        include: { details: true },
      });

      for (const payment of payments) {
        await tx.salePayment.create({
          data: {
            saleId: created.id,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
          },
        });
      }

      for (const item of saleDetails) {
        const inv = await tx.inventory.findUnique({
          where: {
            branchId_productId: { branchId, productId: item.productId },
          },
        });

        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: { amount: inv.amount - item.quantity },
          });

          const saleDetail = created.details.find(
            (d) => d.productId === item.productId,
          );

          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              productId: item.productId,
              branchId,
              quantity: -item.quantity,
              type: 'SALE',
              saleDetailId: saleDetail?.id,
            },
          });
        }
      }

      return tx.sale.findUnique({
        where: { id: created.id },
        include: {
          details: { include: { product: { include: { category: true } } } },
          payments: true,
          customer: true,
          user: { select: { id: true, username: true } },
          branch: true,
        },
      });
    });

    return JSON.parse(JSON.stringify(sale)) as NonNullable<typeof sale>;
  }

  async findAll(branchId?: string, limit = 50) {
    const where = branchId ? { branchId } : {};
    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        details: { include: { product: { include: { category: true } } } },
        payments: true,
        customer: true,
        user: { select: { id: true, username: true } },
        branch: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return JSON.parse(JSON.stringify(sales)) as typeof sales;
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        details: { include: { product: { include: { category: true } } } },
        payments: true,
        customer: true,
        user: { select: { id: true, username: true } },
        branch: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return JSON.parse(JSON.stringify(sale)) as NonNullable<typeof sale>;
  }

  async cancel(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('La venta ya está cancelada');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of sale.details) {
        const inv = await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId: sale.branchId,
              productId: item.productId,
            },
          },
        });
        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: { amount: inv.amount + item.quantity },
          });

          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              productId: item.productId,
              branchId: sale.branchId,
              quantity: item.quantity,
              type: 'RETURN',
              saleDetailId: item.id,
            },
          });
        }
      }

      await tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });

    return { message: 'Venta cancelada' };
  }

  async getPayments(saleId: string) {
    return this.prisma.salePayment.findMany({
      where: { saleId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
