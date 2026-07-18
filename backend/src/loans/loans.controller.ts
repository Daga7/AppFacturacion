import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LoanStatus } from '@prisma/client';
import { LoansService } from './loans.service';
import { CreateLoanPaymentDto } from './dto/create-loan-payment.dto';
import { ExchangeLoanDto } from './dto/exchange-loan.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: LoanStatus,
  ) {
    return this.loansService.findAll(branchId, status);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: CreateLoanPaymentDto) {
    return this.loansService.addPayment(id, dto);
  }

  @Roles('ADMIN', 'CASHIER')
  @Delete(':id')
  returnLoan(@Param('id') id: string) {
    return this.loansService.returnLoan(id);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/exchange')
  exchange(@Param('id') id: string, @Body() dto: ExchangeLoanDto) {
    return this.loansService.exchange(id, dto);
  }
}
