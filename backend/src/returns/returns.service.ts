import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TX_OPTIONS, invoiceCode } from '../sync/offline';
import { CreateReturnDto } from './dto/create-return.dto';

// Días hacia atrás en los que una venta de contado todavía se puede devolver.
export const RETURN_WINDOW_DAYS = 7;

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

// Inicio de la ventana de devoluciones: la medianoche en Colombia de hace
// RETURN_WINDOW_DAYS días. Se cuenta por días calendario, no por horas: lo
// vendido el viernes pasado a cualquier hora se puede devolver hasta este
// viernes.
export function returnWindowStart(now = new Date()): Date {
  const bogota = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  return new Date(
    Date.UTC(
      bogota.getUTCFullYear(),
      bogota.getUTCMonth(),
      bogota.getUTCDate() - RETURN_WINDOW_DAYS,
    ) + BOGOTA_OFFSET_MS,
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ReturnsService {
  constructor(private prisma: PrismaService) {}

  // Busca por código de barras las ventas de contado de la sede de los
  // últimos 7 días que incluyen ese producto. Los préstamos (ventas a
  // crédito) no cuentan: esa mercancía se devuelve desde el préstamo; solo se
  // informa cuántos hubo para orientar al cajero.
  async lookup(branchId: string, barcode: string) {
    const code = barcode.trim();
    if (!code) {
      throw new BadRequestException('Escanea o escribe el código de barras');
    }
    const product = await this.prisma.product.findUnique({
      where: { barcode: code },
      include: { category: true },
    });
    if (!product) {
      throw new NotFoundException(
        `No existe un producto con el código ${code}`,
      );
    }

    const since = returnWindowStart();
    const details = await this.prisma.saleDetail.findMany({
      where: {
        productId: product.id,
        sale: { branchId, status: 'COMPLETED', createdAt: { gte: since } },
      },
      include: {
        sale: {
          include: {
            customer: true,
            user: { select: { id: true, username: true } },
            payments: true,
          },
        },
        returns: { select: { quantity: true } },
      },
      orderBy: { sale: { createdAt: 'desc' } },
    });

    const loans = details.filter((d) => d.sale.isCredit).length;
    const sales = details
      .filter((d) => !d.sale.isCredit)
      .map((d) => {
        const returned = d.returns.reduce((sum, r) => sum + r.quantity, 0);
        const { sale } = d;
        return {
          saleId: sale.id,
          saleDetailId: d.id,
          invoiceNumber: sale.invoiceNumber,
          createdAt: sale.createdAt,
          customerName: sale.customer
            ? `${sale.customer.firstName} ${sale.customer.lastName ?? ''}`.trim()
            : null,
          seller: sale.user.username,
          quantity: d.quantity,
          returnedQuantity: returned,
          returnableQuantity: Math.max(0, d.quantity - returned),
          // Lo que pagó el cliente por unidad, con el descuento incluido.
          unitPaid: round(Number(d.subtotal) / d.quantity),
          paymentMethods: [
            ...new Set(sale.payments.map((p) => p.paymentMethod)),
          ],
        };
      });

    return JSON.parse(
      JSON.stringify({
        product,
        since,
        windowDays: RETURN_WINDOW_DAYS,
        loans,
        sales,
      }),
    ) as {
      product: typeof product;
      since: string;
      windowDays: number;
      loans: number;
      sales: typeof sales;
    };
  }

  // Registra la devolución de unidades de una línea de venta: el producto
  // vuelve al inventario de la sede y el dinero sale de la caja abierta (la
  // devolución queda en ese turno y se descuenta en el cierre).
  async create(dto: CreateReturnDto, branchId: string, userId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      // Bloquea la línea: dos devoluciones al mismo tiempo sobre la misma
      // venta no pueden sumar más unidades de las vendidas.
      await tx.$queryRaw`SELECT id FROM "SaleDetail" WHERE id = ${dto.saleDetailId} FOR UPDATE`;

      const detail = await tx.saleDetail.findUnique({
        where: { id: dto.saleDetailId },
        include: { sale: true, returns: true },
      });
      if (!detail || detail.sale.branchId !== branchId) {
        throw new NotFoundException('No se encontró esa venta en esta sede');
      }
      const { sale } = detail;
      const code = invoiceCode(sale.invoiceNumber);
      if (sale.status !== 'COMPLETED') {
        throw new BadRequestException(`La venta ${code} está cancelada`);
      }
      if (sale.isCredit) {
        throw new BadRequestException(
          `La venta ${code} es un préstamo: la devolución se hace desde el préstamo del cliente`,
        );
      }
      if (sale.createdAt < returnWindowStart()) {
        throw new BadRequestException(
          `La venta ${code} tiene más de ${RETURN_WINDOW_DAYS} días; ya no se puede devolver`,
        );
      }

      const returnedQty = detail.returns.reduce((s, r) => s + r.quantity, 0);
      const remaining = detail.quantity - returnedQty;
      if (dto.quantity > remaining) {
        throw new BadRequestException(
          remaining === 0
            ? `La venta ${code} ya se devolvió completa`
            : `De la venta ${code} solo quedan ${remaining} unidad(es) por devolver`,
        );
      }

      const session = await tx.cashSession.findFirst({
        where: { branchId, status: 'OPEN' },
      });
      if (!session) {
        throw new BadRequestException(
          'Debes abrir la caja antes de registrar devoluciones',
        );
      }

      // Se devuelve lo que el cliente pagó por esas unidades. Si con esta se
      // completa la línea, se devuelve el saldo exacto para que la suma de
      // las devoluciones cuadre con el subtotal pese a los redondeos.
      const subtotal = Number(detail.subtotal);
      const alreadyRefunded = detail.returns.reduce(
        (s, r) => s + Number(r.refundAmount),
        0,
      );
      const refundAmount =
        dto.quantity === remaining
          ? round(subtotal - alreadyRefunded)
          : round((subtotal * dto.quantity) / detail.quantity);

      const reason = dto.reason?.trim() || null;
      const saleReturn = await tx.saleReturn.create({
        data: {
          saleId: sale.id,
          saleDetailId: detail.id,
          productId: detail.productId,
          quantity: dto.quantity,
          refundAmount,
          paymentMethod: dto.paymentMethod,
          reason,
          branchId,
          userId,
          cashSessionId: session.id,
        },
        include: {
          product: true,
          sale: { select: { id: true, invoiceNumber: true } },
        },
      });

      const inventory = await tx.inventory.upsert({
        where: {
          branchId_productId: { branchId, productId: detail.productId },
        },
        create: { branchId, productId: detail.productId, amount: dto.quantity },
        update: { amount: { increment: dto.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          productId: detail.productId,
          branchId,
          quantity: dto.quantity,
          type: 'RETURN',
          saleDetailId: detail.id,
          note: `Devolución de la venta ${code}${reason ? `: ${reason}` : ''}`,
        },
      });

      return saleReturn;
    }, TX_OPTIONS);

    return JSON.parse(JSON.stringify(created)) as typeof created;
  }
}
