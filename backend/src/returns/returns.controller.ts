import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { scopedBranchId, type RequestWithUser } from '../auth/request-user';

// Módulo de devoluciones del cajero. Solo funciona con internet: no pasa por
// la cola de operaciones sin conexión (/sync).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Roles('ADMIN', 'CASHIER')
  @Get('lookup')
  lookup(
    @Request() req: RequestWithUser,
    @Query('barcode') barcode = '',
    @Query('branchId') branchId?: string,
  ) {
    return this.returnsService.lookup(
      scopedBranchId(req.user, branchId) ?? req.user.branchId,
      barcode,
    );
  }

  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body() dto: CreateReturnDto, @Request() req: RequestWithUser) {
    return this.returnsService.create(
      dto,
      scopedBranchId(req.user, dto.branchId) ?? req.user.branchId,
      req.user.id,
    );
  }
}
