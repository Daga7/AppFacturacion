import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { CashService } from './cash.service';
import { OpenCashDto } from './dto/open-cash.dto';
import { CloseCashDto } from './dto/close-cash.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

interface RequestWithUser extends ExpressRequest {
  user: { id: string; username: string; role: string; branchId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cash')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  // El cajero siempre opera la caja de su propia sede; el admin puede indicar otra.
  private resolveBranch(req: RequestWithUser, branchId?: string): string {
    if (req.user.role === 'CASHIER') return req.user.branchId;
    const resolved = branchId ?? req.user.branchId;
    if (!resolved) throw new BadRequestException('Indica la sucursal');
    return resolved;
  }

  @Get('current')
  current(
    @Request() req: RequestWithUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.cashService.current(this.resolveBranch(req, branchId));
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('open')
  open(@Body() dto: OpenCashDto, @Request() req: RequestWithUser) {
    return this.cashService.open(
      this.resolveBranch(req, dto.branchId),
      dto.openingAmount,
      req.user.id,
    );
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('close')
  close(@Body() dto: CloseCashDto, @Request() req: RequestWithUser) {
    return this.cashService.close(
      this.resolveBranch(req, dto.branchId),
      dto.closingAmount,
    );
  }

  @Get(':id/summary')
  summary(@Param('id') id: string) {
    return this.cashService.summary(id);
  }

  @Get(':id/discounts')
  discounts(@Param('id') id: string) {
    return this.cashService.discounts(id);
  }
}
