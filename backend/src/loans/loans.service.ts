import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LoanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanPaymentDto } from './dto/create-loan-payment.dto';

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

  async addPayment(loanId: string, dto: CreateLoanPaymentDto) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (loan.loanStatus === 'PAID') {
      throw new BadRequestException('El préstamo ya está pagado');
    }

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
