import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

const SESSION_INCLUDE = {
  branch: true,
  openedBy: { select: { id: true, username: true } },
} as const;

// Forma del resumen de cierre (los Decimal llegan como string tras serializar).
export interface CashSummaryData {
  session: {
    id: string;
    openingAmount: number | string;
    closingAmount: number | string | null;
    status: string;
    branch: { id: string; name: string };
    openedBy: { id: string; username: string } | null;
    openedAt: string;
    closedAt: string | null;
  };
  salesCount: number;
  totalSales: number;
  cashReceived: number;
  nequiReceived: number;
  bancolombiaReceived: number;
  transferReceived: number;
  loans: { count: number; total: number };
  discounts: { count: number; total: number };
  // Abonos y pagos de pedidos especiales cobrados durante el turno.
  specialOrders: {
    count: number;
    total: number;
    cash: number;
    nequi: number;
    bancolombia: number;
  };
  // Abonos a préstamos recibidos durante el turno, con el detalle por cliente
  // para el informe de Telegram.
  loanPayments: {
    count: number;
    total: number;
    cash: number;
    nequi: number;
    bancolombia: number;
    rows: LoanPaymentRow[];
  };
  expectedCash: number;
  difference: number | null;
}

// Una línea del listado "clientes que pagaron mercancía pendiente".
export interface LoanPaymentRow {
  customerName: string;
  amount: number;
  paymentMethod: string;
  // Saldo que le queda al préstamo después del abono.
  pendingAfter: number;
  settled: boolean;
  products: string;
  createdAt: string;
}

const money = (n: number | string) =>
  `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

const nowBogota = () =>
  new Date().toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  });

@Injectable()
export class CashService {
  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  // Caja abierta actual de la sucursal (o null si no hay).
  async current(branchId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { branchId, status: 'OPEN' },
      include: SESSION_INCLUDE,
    });
    return JSON.parse(JSON.stringify(session)) as typeof session;
  }

  async open(branchId: string, openingAmount: number, userId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const existing = await this.prisma.cashSession.findFirst({
      where: { branchId, status: 'OPEN' },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya hay una caja abierta en ${branch.name}; ciérrala antes de abrir otra`,
      );
    }

    const session = await this.prisma.cashSession.create({
      data: { branchId, openingAmount, openedById: userId },
      include: SESSION_INCLUDE,
    });

    // Aviso por Telegram a los chats autorizados (best-effort, no bloquea).
    void this.telegram.notifyStaff(
      branch.name,
      [
        '🔓 APERTURA DE CAJA',
        `Sede: ${branch.name}`,
        `Abierta por: ${session.openedBy.username}`,
        `Base inicial: ${money(openingAmount)}`,
        `Fecha y hora: ${nowBogota()}`,
      ].join('\n'),
    );

    return JSON.parse(JSON.stringify(session)) as typeof session;
  }

  async close(branchId: string, closingAmount: number) {
    const session = await this.prisma.cashSession.findFirst({
      where: { branchId, status: 'OPEN' },
    });
    if (!session) {
      throw new BadRequestException(
        'No hay una caja abierta en esta sucursal; primero debes abrirla',
      );
    }

    await this.prisma.cashSession.update({
      where: { id: session.id },
      data: { closingAmount, status: 'CLOSED', closedAt: new Date() },
    });

    const summary = await this.summary(session.id);

    // Informe de cierre por Telegram: el mismo resumen que genera el programa.
    const diff = summary.difference ?? 0;
    const diffLine =
      diff === 0
        ? 'Cuadra exacto ✓'
        : diff > 0
          ? `Sobran ${money(diff)}`
          : `Faltan ${money(-diff)}`;
    void this.telegram.notifyStaff(
      summary.session.branch.name,
      [
        '🔒 CIERRE DE CAJA',
        `Sede: ${summary.session.branch.name}`,
        `Fecha y hora: ${nowBogota()}`,
        `Turno abierto por: ${summary.session.openedBy?.username ?? '—'}`,
        '—————————————',
        `Base inicial: ${money(summary.session.openingAmount)}`,
        `Ventas del día: ${summary.salesCount} por ${money(summary.totalSales)}`,
        `Efectivo recibido: ${money(summary.cashReceived)}`,
        `Transferencias: ${money(summary.transferReceived)} (Nequi ${money(summary.nequiReceived)} · Bancolombia ${money(summary.bancolombiaReceived)})`,
        `Préstamos: ${summary.loans.count} por ${money(summary.loans.total)}`,
        `Descuentos: ${summary.discounts.count} por ${money(summary.discounts.total)}`,
        ...(summary.specialOrders.count > 0
          ? [
              `Pedidos especiales: ${summary.specialOrders.count} pago(s) por ${money(summary.specialOrders.total)} (efectivo ${money(summary.specialOrders.cash)})`,
            ]
          : []),
        ...this.loanPaymentsLines(summary),
        '—————————————',
        `Efectivo esperado: ${money(summary.expectedCash)}`,
        `Efectivo contado: ${money(summary.session.closingAmount ?? 0)}`,
        `Diferencia: ${diffLine}`,
      ].join('\n'),
    );

    return summary;
  }

  // Bloque del informe de Telegram con los clientes que pagaron o abonaron
  // mercancía pendiente durante el turno. Se listan uno por uno con lo que
  // pagaron y el saldo que les queda; si no hubo abonos, no se agrega nada.
  private loanPaymentsLines(summary: CashSummaryData): string[] {
    const lp = summary.loanPayments;
    if (lp.count === 0) return [];

    const methodLabels: Record<string, string> = {
      CASH: 'efectivo',
      NEQUI: 'Nequi',
      BANCOLOMBIA: 'Bancolombia',
    };

    return [
      '—————————————',
      `💰 ABONOS DE CLIENTES: ${lp.count} por ${money(lp.total)}`,
      `(efectivo ${money(lp.cash)} · Nequi ${money(lp.nequi)} · Bancolombia ${money(lp.bancolombia)})`,
      ...lp.rows.map((r) => {
        const method = methodLabels[r.paymentMethod] ?? r.paymentMethod;
        const estado = r.settled
          ? '✅ quedó al día'
          : `queda debiendo ${money(r.pendingAfter)}`;
        const productos = r.products ? ` — ${r.products}` : '';
        return `• ${r.customerName}: ${money(r.amount)} en ${method}, ${estado}${productos}`;
      }),
    ];
  }

  // Resumen del turno: base, efectivo contado, ventas, medios de pago,
  // préstamos, descuentos y efectivo esperado vs recibido.
  async summary(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        ...SESSION_INCLUDE,
        sales: {
          where: { status: 'COMPLETED' },
          include: {
            details: true,
            payments: true,
            loan: true,
          },
        },
        specialOrderPayments: true,
        loanPayments: {
          include: {
            loan: {
              include: {
                customer: true,
                sale: { include: { details: { include: { product: true } } } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!session) throw new NotFoundException('Sesión de caja no encontrada');

    const round = (n: number) => Math.round(n * 100) / 100;

    let totalSales = 0;
    let cashReceived = 0;
    let nequiReceived = 0;
    let bancolombiaReceived = 0;
    let loansCount = 0;
    let loansTotal = 0;
    let discountsCount = 0;
    let discountsTotal = 0;

    for (const sale of session.sales) {
      totalSales += Number(sale.total);

      for (const p of sale.payments) {
        const amount = Number(p.amount);
        if (p.paymentMethod === 'CASH') cashReceived += amount;
        else if (p.paymentMethod === 'NEQUI') nequiReceived += amount;
        else bancolombiaReceived += amount;
      }

      if (sale.isCredit && sale.loan) {
        loansCount++;
        loansTotal += Number(sale.loan.originalAmount);
      }

      for (const d of sale.details) {
        const discount = Number(d.discount);
        if (discount > 0) {
          discountsCount++;
          discountsTotal += discount;
        }
      }
    }

    // Pagos de pedidos especiales cobrados en este turno. El efectivo suma al
    // esperado; Nequi/Bancolombia se reportan aparte (no afectan el conteo).
    let soCash = 0;
    let soNequi = 0;
    let soBancolombia = 0;
    for (const p of session.specialOrderPayments) {
      const amount = Number(p.amount);
      if (p.paymentMethod === 'CASH') soCash += amount;
      else if (p.paymentMethod === 'NEQUI') soNequi += amount;
      else soBancolombia += amount;
    }
    const soTotal = soCash + soNequi + soBancolombia;

    // Abonos a préstamos cobrados en este turno: los clientes que pagaron
    // mercancía pendiente. El efectivo suma al esperado en caja.
    let lpCash = 0;
    let lpNequi = 0;
    let lpBancolombia = 0;
    const loanPaymentRows: LoanPaymentRow[] = [];
    for (const p of session.loanPayments) {
      const amount = Number(p.amount);
      if (p.paymentMethod === 'CASH') lpCash += amount;
      else if (p.paymentMethod === 'NEQUI') lpNequi += amount;
      else lpBancolombia += amount;

      const customer = p.loan.customer;
      const pendingAfter = Number(p.loan.pendingAmount);
      loanPaymentRows.push({
        customerName:
          `${customer.firstName} ${customer.lastName ?? ''}`.trim() || '—',
        amount: round(amount),
        paymentMethod: p.paymentMethod,
        pendingAfter: round(pendingAfter),
        settled: p.loan.loanStatus === 'PAID',
        products: p.loan.sale.details
          .map((d) => `${d.quantity} × ${d.product.name}`)
          .join(', '),
        createdAt: p.createdAt.toISOString(),
      });
    }
    const lpTotal = lpCash + lpNequi + lpBancolombia;

    const openingAmount = Number(session.openingAmount);
    const closingAmount =
      session.closingAmount !== null ? Number(session.closingAmount) : null;
    const expectedCash = openingAmount + cashReceived + soCash + lpCash;

    const sessionData = {
      id: session.id,
      openingAmount: session.openingAmount,
      closingAmount: session.closingAmount,
      status: session.status,
      branch: session.branch,
      openedBy: session.openedBy,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
    };

    return JSON.parse(
      JSON.stringify({
        session: sessionData,
        salesCount: session.sales.length,
        totalSales: round(totalSales),
        cashReceived: round(cashReceived),
        nequiReceived: round(nequiReceived),
        bancolombiaReceived: round(bancolombiaReceived),
        transferReceived: round(nequiReceived + bancolombiaReceived),
        loans: { count: loansCount, total: round(loansTotal) },
        discounts: { count: discountsCount, total: round(discountsTotal) },
        specialOrders: {
          count: session.specialOrderPayments.length,
          total: round(soTotal),
          cash: round(soCash),
          nequi: round(soNequi),
          bancolombia: round(soBancolombia),
        },
        loanPayments: {
          count: session.loanPayments.length,
          total: round(lpTotal),
          cash: round(lpCash),
          nequi: round(lpNequi),
          bancolombia: round(lpBancolombia),
          rows: loanPaymentRows,
        },
        expectedCash: round(expectedCash),
        difference:
          closingAmount !== null ? round(closingAmount - expectedCash) : null,
      }),
    ) as CashSummaryData;
  }

  // Detalle de los descuentos aplicados durante el turno.
  async discounts(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Sesión de caja no encontrada');

    const details = await this.prisma.saleDetail.findMany({
      where: {
        discount: { gt: 0 },
        sale: { cashSessionId: sessionId, status: 'COMPLETED' },
      },
      include: {
        product: true,
        sale: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = details.map((d) => {
      const original = Number(d.unitPrice) * d.quantity;
      return {
        saleId: d.saleId,
        invoiceNumber: d.sale.invoiceNumber,
        productName: d.product.name,
        quantity: d.quantity,
        unitPrice: round(Number(d.unitPrice)),
        originalPrice: round(original),
        discountedPrice: round(Number(d.subtotal)),
        discount: round(Number(d.discount)),
        reason: d.discountReason,
        user: d.sale.user.username,
        createdAt: d.sale.createdAt.toISOString(),
      };
    });

    return JSON.parse(JSON.stringify(rows)) as typeof rows;
  }
}
