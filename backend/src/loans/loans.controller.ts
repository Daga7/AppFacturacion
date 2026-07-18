import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LoanStatus } from '@prisma/client';
import { LoansService } from './loans.service';
import { CreateLoanPaymentDto } from './dto/create-loan-payment.dto';
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
}
