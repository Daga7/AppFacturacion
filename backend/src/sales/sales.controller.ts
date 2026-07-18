import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

interface RequestWithUser extends ExpressRequest {
  user: { id: string; username: string; role: string; branchId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body() dto: CreateSaleDto, @Request() req: RequestWithUser) {
    // Un cajero solo puede vender en su propia sede, sin importar lo que
    // envíe el cliente.
    if (req.user.role === 'CASHIER') {
      dto.branchId = req.user.branchId;
    }
    return this.salesService.create(dto, req.user.id, req.user.role);
  }

  @Get()
  findAll(
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.salesService.findAll(branchId, limit ? +limit : 50, from, to);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.salesService.update(id, dto);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.salesService.cancel(id);
  }

  @Get(':id/payments')
  getPayments(@Param('id') id: string) {
    return this.salesService.getPayments(id);
  }
}
