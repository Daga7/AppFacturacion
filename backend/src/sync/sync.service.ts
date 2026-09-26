import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SyncOperationType } from '@prisma/client';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { LoansService } from '../loans/loans.service';
import { CashService } from '../cash/cash.service';
import { OpenCashDto } from '../cash/dto/open-cash.dto';
import { scopedBranchId, type AuthUser } from '../auth/request-user';
import {
  SyncLoanPaymentDto,
  SyncOperationDto,
  SyncReturnLoanDto,
  SyncSaleDto,
} from './dto/sync.dto';
import { TX_OPTIONS, type OfflineContext, type Tx } from './offline';

export interface SyncResult {
  id: string;
  // applied: se registró ahora. duplicate: ya se había recibido antes.
  // rejected: datos inválidos; no se registró (ver error).
  status: 'applied' | 'duplicate' | 'rejected';
  error?: string;
  result?: unknown;
  // Novedades anotadas para el administrador.
  issues?: string[];
}

interface Applied {
  branchId: string;
  result: Prisma.InputJsonObject;
  afterCommit?: () => void;
}

const OPERATION_LABELS: Record<SyncOperationType, string> = {
  OPEN_CASH: 'Apertura de caja',
  CREATE_SALE: 'Venta',
  LOAN_PAYMENT: 'Abono',
  RETURN_LOAN: 'Devolución',
};

// Recibe las operaciones que un dispositivo hizo (o intentó hacer) y las
// aplica en orden, una transacción por operación, con los mismos servicios
// que usan los endpoints normales.
@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesService,
    private loans: LoansService,
    private cash: CashService,
  ) {}

  async process(user: AuthUser, operations: SyncOperationDto[]) {
    const results: SyncResult[] = [];
    // En orden: un abono puede apuntar al préstamo creado por una venta
    // anterior del mismo lote.
    for (const op of operations) {
      results.push(await this.processOne(user, op));
    }
    return { results };
  }

  private async processOne(
    user: AuthUser,
    op: SyncOperationDto,
  ): Promise<SyncResult> {
    for (let attempt = 1; ; attempt++) {
      const previous = await this.prisma.syncedOperation.findUnique({
        where: { id: op.id },
      });
      if (previous) {
        return {
          id: op.id,
          status: previous.rejected ? 'rejected' : 'duplicate',
          error: previous.error ?? undefined,
          result: previous.result,
        };
      }

      try {
        return await this.apply(user, op);
      } catch (err) {
        if (err instanceof HttpException && err.getStatus() < 500) {
          return this.reject(user, op, err);
        }
        // Llave única repetida: el mismo envío llegó dos veces a la vez, u
        // otra venta tomó el mismo número de factura. Se vuelve a intentar.
        if (isUniqueViolation(err) && attempt < 3) continue;
        throw err;
      }
    }
  }

  private async apply(
    user: AuthUser,
    op: SyncOperationDto,
  ): Promise<SyncResult> {
    // Solo el cajero trabaja sin internet; para los demás todo es en línea.
    const offline: OfflineContext | undefined =
      op.mode === 'offline' && user.role === 'CASHIER'
        ? { occurredAt: this.occurredAt(op.occurredAt), issues: [] }
        : undefined;
    const occurredAt = offline?.occurredAt ?? new Date();

    const applied = await this.prisma.$transaction(async (tx) => {
      const applied = await this.run(tx, user, op, offline);
      await tx.syncedOperation.create({
        data: {
          id: op.id,
          type: op.type,
          userId: user.id,
          branchId: applied.branchId,
          occurredAt,
          result: applied.result,
        },
      });
      if (offline && offline.issues.length > 0) {
        await tx.offlineIssue.createMany({
          data: offline.issues.map((issue) => ({
            ...issue,
            operationId: op.id,
            occurredAt,
            branchId: applied.branchId,
            userId: user.id,
          })),
        });
      }
      return applied;
    }, TX_OPTIONS);

    applied.afterCommit?.();
    return {
      id: op.id,
      status: 'applied',
      result: applied.result,
      issues: offline?.issues.map((i) => i.message) ?? [],
    };
  }

  private async run(
    tx: Tx,
    user: AuthUser,
    op: SyncOperationDto,
    offline?: OfflineContext,
  ): Promise<Applied> {
    switch (op.type) {
      case 'OPEN_CASH': {
        const dto = await parse(OpenCashDto, op.payload);
        const branchId = scopedBranchId(user, dto.branchId, user.branchId)!;
        const { session, created } = await this.cash.openInTx(
          tx,
          branchId,
          dto.openingAmount,
          user.id,
          offline,
        );
        return {
          branchId,
          result: { sessionId: session.id },
          afterCommit: created
            ? () => this.cash.notifyOpened(session, !!offline)
            : undefined,
        };
      }

      case 'CREATE_SALE': {
        const dto = await parse(SyncSaleDto, op.payload);
        // Un cajero solo vende en su propia sede.
        dto.branchId = scopedBranchId(user, dto.branchId)!;
        const sale = await this.sales.createInTx(tx, dto, user.id, user.role, {
          saleId: dto.saleId,
          loanId: dto.isCredit ? dto.loanId : undefined,
          offline,
        });
        return {
          branchId: dto.branchId,
          result: {
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            loanId: sale.loan?.id ?? null,
          },
        };
      }

      case 'LOAN_PAYMENT': {
        const dto = await parse(SyncLoanPaymentDto, op.payload);
        const paid = await this.loans.addPaymentInTx(
          tx,
          dto.loanId,
          { amount: dto.amount, paymentMethod: dto.paymentMethod },
          offline,
        );
        return {
          branchId: paid?.branchId ?? user.branchId,
          result: { paymentId: paid?.payment.id ?? null },
        };
      }

      case 'RETURN_LOAN': {
        const dto = await parse(SyncReturnLoanDto, op.payload);
        const branchId = await this.loans.returnLoanInTx(
          tx,
          dto.loanId,
          offline,
        );
        return { branchId: branchId ?? user.branchId, result: {} };
      }
    }
  }

  // Datos inválidos: en línea solo se informa (la persona corrige y vuelve a
  // intentar). Sin internet la operación ya ocurrió, así que queda registrada
  // como rechazada y con un aviso para el administrador.
  private async reject(
    user: AuthUser,
    op: SyncOperationDto,
    err: HttpException,
  ): Promise<SyncResult> {
    const error = errorMessage(err);
    if (op.mode === 'offline' && user.role === 'CASHIER') {
      const occurredAt = this.occurredAt(op.occurredAt);
      const what = op.summary ?? OPERATION_LABELS[op.type];
      try {
        await this.prisma.$transaction([
          this.prisma.syncedOperation.create({
            data: {
              id: op.id,
              type: op.type,
              userId: user.id,
              branchId: user.branchId,
              occurredAt,
              rejected: true,
              error,
            },
          }),
          this.prisma.offlineIssue.create({
            data: {
              type: 'REJECTED',
              message: `No se pudo guardar algo hecho sin internet (${what}): ${error}`,
              operationId: op.id,
              occurredAt,
              branchId: user.branchId,
              userId: user.id,
            },
          }),
        ]);
      } catch (e) {
        // Otro envío simultáneo ya lo registró.
        if (!isUniqueViolation(e)) throw e;
      }
    }
    return { id: op.id, status: 'rejected', error };
  }

  // Hora del dispositivo; si su reloj está adelantado se usa la actual.
  private occurredAt(iso: string) {
    const at = new Date(iso);
    const now = new Date();
    return Number.isNaN(at.getTime()) || at > now ? now : at;
  }

  // --- Avisos para el administrador ---------------------------------------

  async listIssues(status: 'open' | 'resolved', branchId?: string) {
    const issues = await this.prisma.offlineIssue.findMany({
      where: {
        resolvedAt: status === 'open' ? null : { not: null },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, username: true } },
        resolvedBy: { select: { id: true, username: true } },
      },
      orderBy:
        status === 'open' ? { occurredAt: 'desc' } : { resolvedAt: 'desc' },
      take: 200,
    });
    return JSON.parse(JSON.stringify(issues)) as typeof issues;
  }

  async countOpenIssues() {
    const open = await this.prisma.offlineIssue.count({
      where: { resolvedAt: null },
    });
    return { open };
  }

  async resolveIssue(id: string, userId: string) {
    const issue = await this.prisma.offlineIssue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('Aviso no encontrado');
    if (issue.resolvedAt) return issue;
    return this.prisma.offlineIssue.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: userId },
    });
  }
}

async function parse<T extends object>(
  cls: ClassConstructor<T>,
  payload: unknown,
): Promise<T> {
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto, { whitelist: true });
  if (errors.length > 0) {
    throw new BadRequestException(
      `Datos inválidos: ${flattenErrors(errors).join(', ')}`,
    );
  }
  return dto;
}

function flattenErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...flattenErrors(e.children ?? []),
  ]);
}

function errorMessage(err: HttpException): string {
  const res = err.getResponse();
  if (typeof res === 'object' && res !== null && 'message' in res) {
    if (Array.isArray(res.message)) return res.message.join(', ');
  }
  return err.message;
}

function isUniqueViolation(err: unknown) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
