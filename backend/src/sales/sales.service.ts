import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import {
  TX_OPTIONS,
  invoiceCode,
  money,
  type OfflineContext,
  type Tx,
} from '../sync/offline';

export interface CreateSaleOptions {
  // Ids generados por el dispositivo: una venta hecha sin internet puede
  // tener abonos o una devolución en cola que ya apuntan a su préstamo.
  saleId?: string;
  loanId?: string;
  offline?: OfflineContext;
}

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSaleDto, userId: string, role?: string) {
    return this.prisma.$transaction(
      (tx) => this.createInTx(tx, dto, userId, role),
      TX_OPTIONS,
    );
  }

  // Registra la venta dentro de una transacción ajena (la usa también la
  // sincronización de operaciones hechas sin internet). Con `offline` la
  // venta ya ocurrió: la falta de stock o de caja abierta no la rechaza, se
  // registra y queda anotada como novedad para el administrador.
  async createInTx(
    tx: Tx,
    dto: CreateSaleDto,
    userId: string,
    role?: string,
    opts: CreateSaleOptions = {},
  ) {
    const { branchId, customerId, isCredit, details, payments } = dto;
    const { offline } = opts;

    if (details.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un producto');
    }
    const productIds = details.map((d) => d.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'No repitas el mismo producto en varias filas; ajusta la cantidad',
      );
    }

    // Toda venta queda vinculada a la caja abierta de la sucursal. El cajero
    // no puede vender sin caja abierta; al admin se le permite sin sesión.
    const openSession = await tx.cashSession.findFirst({
      where: { branchId, status: 'OPEN' },
    });
    if (role === 'CASHIER' && !openSession && !offline) {
      throw new BadRequestException(
        'Debes abrir la caja antes de registrar ventas',
      );
    }

    if (customerId) {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
    }

    let total = 0;
    const saleDetails: {
      productId: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      discountReason: string | null;
      subtotal: number;
    }[] = [];
    const shortages: string[] = [];

    for (const item of details) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product)
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);

      const inventory = await tx.inventory.findUnique({
        where: {
          branchId_productId: { branchId, productId: item.productId },
        },
      });

      const available = inventory?.amount ?? 0;
      if (available < item.quantity) {
        if (!offline) {
          throw new BadRequestException(
            `Stock insuficiente para "${product.name}". Disponible: ${available}`,
          );
        }
        shortages.push(
          `"${product.name}" (se vendieron ${item.quantity}, había ${available})`,
        );
      }

      const subtotal = item.unitPrice * item.quantity - (item.discount ?? 0);
      total += subtotal;

      saleDetails.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount ?? 0,
        discountReason: item.discountReason?.trim() || null,
        subtotal,
      });
    }

    const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    if (!isCredit) {
      const diff = Math.abs(total - paymentsTotal);
      if (diff > 0.01) {
        throw new BadRequestException(
          `El total de pagos (${paymentsTotal}) no coincide con el total (${total})`,
        );
      }
    } else {
      if (!customerId) {
        throw new BadRequestException(
          'Una venta a crédito requiere un cliente',
        );
      }
      if (paymentsTotal > total - 0.01) {
        throw new BadRequestException(
          'Una venta a crédito debe dejar saldo pendiente; si se paga completa, regístrala de contado',
        );
      }
    }

    const lastInvoice = await tx.sale.findFirst({
      where: { branchId },
      orderBy: { invoiceNumber: 'desc' },
    });
    const invoiceNumber = (lastInvoice?.invoiceNumber ?? 0) + 1;

    // Sin internet se conserva la hora real de la venta (undefined = ahora).
    const createdAt = offline?.occurredAt;

    const created = await tx.sale.create({
      data: {
        id: opts.saleId,
        invoiceNumber,
        total,
        isCredit: isCredit ?? false,
        status: 'COMPLETED',
        branchId,
        userId,
        customerId,
        cashSessionId: openSession?.id ?? null,
        createdAt,
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
          createdAt,
        },
      });
    }

    if (isCredit) {
      const pending = total - paymentsTotal;
      await tx.loan.create({
        data: {
          id: opts.loanId,
          saleId: created.id,
          customerId: customerId!,
          originalAmount: pending,
          pendingAmount: pending,
          createdAt,
        },
      });
    }

    // Sin internet el inventario puede quedar en negativo (o no existir aún
    // en la sede); en línea el stock ya se validó arriba.
    for (const item of saleDetails) {
      const inv = await tx.inventory.upsert({
        where: {
          branchId_productId: { branchId, productId: item.productId },
        },
        create: { branchId, productId: item.productId, amount: -item.quantity },
        update: { amount: { decrement: item.quantity } },
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
          createdAt,
        },
      });
    }

    if (offline) {
      const code = invoiceCode(invoiceNumber);
      if (shortages.length > 0) {
        offline.issues.push({
          type: 'NEGATIVE_STOCK',
          saleId: created.id,
          message: `Venta ${code} hecha sin internet con stock insuficiente: ${shortages.join('; ')}. El inventario quedó en negativo.`,
        });
      }
      if (!openSession) {
        offline.issues.push({
          type: 'NO_CASH_SESSION',
          saleId: created.id,
          message: `Venta ${code} por ${money(total)} hecha sin internet cuando no había caja abierta; no aparece en ningún cierre de caja.`,
        });
      }
    }

    const sale = await tx.sale.findUnique({
      where: { id: created.id },
      include: {
        details: { include: { product: { include: { category: true } } } },
        payments: true,
        customer: true,
        user: { select: { id: true, username: true } },
        branch: true,
        loan: { include: { payments: true } },
      },
    });

    return JSON.parse(JSON.stringify(sale)) as NonNullable<typeof sale>;
  }

  async findAll(branchId?: string, limit = 50, from?: string, to?: string) {
    const sales = await this.prisma.sale.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        details: { include: { product: { include: { category: true } } } },
        payments: true,
        customer: true,
        user: { select: { id: true, username: true } },
        branch: true,
        loan: { include: { payments: true } },
        returns: { orderBy: { createdAt: 'asc' } },
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
        loan: { include: { payments: true } },
        returns: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return JSON.parse(JSON.stringify(sale)) as NonNullable<typeof sale>;
  }

  async cancel(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        details: true,
        loan: { include: { payments: true } },
        _count: { select: { returns: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('La venta ya está cancelada');
    }
    // Esas unidades ya volvieron al inventario y su dinero ya salió de caja.
    if (sale._count.returns > 0) {
      throw new BadRequestException(
        'No se puede cancelar: la venta tiene devoluciones registradas',
      );
    }
    if (sale.loan && sale.loan.payments.length > 0) {
      throw new BadRequestException(
        'No se puede cancelar: el préstamo de esta venta ya tiene abonos registrados',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (sale.loan) {
        await tx.loan.delete({ where: { id: sale.loan.id } });
      }
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

  // Edición de una venta (solo ADMIN): reemplaza productos y pagos por el
  // nuevo estado. Para garantizar consistencia con inventario, dentro de una
  // transacción se revierte todo el efecto de la venta original (devuelve
  // stock y borra sus movimientos SALE) y se aplica como si fuera nueva,
  // conservando número de factura, fecha, sucursal y vendedor.
  async update(id: string, dto: UpdateSaleDto) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        details: true,
        payments: true,
        loan: { include: { payments: true } },
        _count: { select: { returns: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('No se puede editar una venta cancelada');
    }
    // Rehacer las líneas borraría las devoluciones y descuadraría el stock.
    if (sale._count.returns > 0) {
      throw new BadRequestException(
        'No se puede editar: la venta tiene devoluciones registradas',
      );
    }

    const productIds = dto.details.map((d) => d.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'No repitas el mismo producto en varias filas; ajusta la cantidad',
      );
    }

    let total = 0;
    const productNames = new Map<string, string>();
    const newDetails: {
      productId: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      discountReason: string | null;
      subtotal: number;
    }[] = [];

    for (const item of dto.details) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });
      if (!product)
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);
      productNames.set(product.id, product.name);

      const subtotal = item.unitPrice * item.quantity - (item.discount ?? 0);
      total += subtotal;
      newDetails.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount ?? 0,
        discountReason: item.discountReason?.trim() || null,
        subtotal,
      });
    }

    const paymentsTotal = dto.payments.reduce((sum, p) => sum + p.amount, 0);
    let newPending = 0;
    if (!sale.isCredit) {
      if (Math.abs(total - paymentsTotal) > 0.01) {
        throw new BadRequestException(
          `El total de pagos (${paymentsTotal}) no coincide con el total (${total})`,
        );
      }
    } else if (sale.loan) {
      const abonos = sale.loan.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      newPending = total - paymentsTotal - abonos;
      if (newPending < -0.01) {
        throw new BadRequestException(
          `El nuevo total (${total}) es menor que lo ya pagado y abonado (${paymentsTotal + abonos})`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Revertir la venta original: devolver stock y borrar movimientos
      for (const d of sale.details) {
        await tx.inventoryMovement.deleteMany({
          where: { saleDetailId: d.id },
        });
        await tx.inventory.upsert({
          where: {
            branchId_productId: {
              branchId: sale.branchId,
              productId: d.productId,
            },
          },
          create: {
            branchId: sale.branchId,
            productId: d.productId,
            amount: d.quantity,
          },
          update: { amount: { increment: d.quantity } },
        });
      }
      await tx.salePayment.deleteMany({ where: { saleId: id } });
      await tx.saleDetail.deleteMany({ where: { saleId: id } });

      // 2. Aplicar el nuevo estado validando stock ya revertido
      for (const nd of newDetails) {
        const inventory = await tx.inventory.findUnique({
          where: {
            branchId_productId: {
              branchId: sale.branchId,
              productId: nd.productId,
            },
          },
        });
        if (!inventory || inventory.amount < nd.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para "${productNames.get(nd.productId)}". Disponible: ${inventory?.amount ?? 0}`,
          );
        }

        const detail = await tx.saleDetail.create({
          data: { saleId: id, ...nd },
        });
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { amount: { decrement: nd.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            productId: nd.productId,
            branchId: sale.branchId,
            quantity: -nd.quantity,
            type: 'SALE',
            saleDetailId: detail.id,
          },
        });
      }

      for (const payment of dto.payments) {
        await tx.salePayment.create({
          data: {
            saleId: id,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
          },
        });
      }

      await tx.sale.update({ where: { id }, data: { total } });

      // 3. Sincronizar el préstamo si es venta a crédito
      if (sale.loan) {
        await tx.loan.update({
          where: { id: sale.loan.id },
          data: {
            originalAmount: total - paymentsTotal,
            pendingAmount: Math.max(0, newPending),
            loanStatus: newPending <= 0.01 ? 'PAID' : 'ACTIVE',
          },
        });
      }
    });

    return this.findOne(id);
  }

  async getPayments(saleId: string) {
    return this.prisma.salePayment.findMany({
      where: { saleId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
