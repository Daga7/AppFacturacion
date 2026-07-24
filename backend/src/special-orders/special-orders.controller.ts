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
import { SpecialOrderStatus } from '@prisma/client';
import { SpecialOrdersService } from './special-orders.service';
import { CreateSpecialOrderDto } from './dto/create-special-order.dto';
import { UpdateSpecialOrderDto } from './dto/update-special-order.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { scopedBranchId } from '../auth/request-user';
import type { RequestWithUser } from '../auth/request-user';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('special-orders')
export class SpecialOrdersController {
  constructor(private readonly service: SpecialOrdersService) {}

  // El vendedor crea el pedido en su propia sede; el admin puede indicar sede.
  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body() dto: CreateSpecialOrderDto, @Request() req: RequestWithUser) {
    const branchId = scopedBranchId(req.user, dto.branchId, req.user.branchId)!;
    return this.service.create(dto, req.user.id, branchId);
  }

  // El vendedor ve los pedidos de su sede; admin y supervisor ven todo (o
  // filtran por sede/estado).
  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get()
  findAll(
    @Request() req: RequestWithUser,
    @Query('branchId') branchId?: string,
    @Query('status') status?: SpecialOrderStatus,
  ) {
    return this.service.findAll(scopedBranchId(req.user, branchId), status);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: AddPaymentDto) {
    return this.service.addPayment(id, dto);
  }

  // Editar datos del pedido: solo ADMIN.
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSpecialOrderDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatus(id, dto);
  }
}
