import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { RequestStatus } from '@prisma/client';
import { TransfersService } from './transfers.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { ResolveTransferRequestDto } from './dto/resolve-transfer-request.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

interface RequestWithUser extends ExpressRequest {
  user: { id: string; username: string; role: string; branchId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  // El vendedor (o admin) crea una solicitud de traslado. El vendedor solo
  // puede originar traslados desde su propia sede.
  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(
    @Body() dto: CreateTransferRequestDto,
    @Request() req: RequestWithUser,
  ) {
    if (req.user.role === 'CASHIER') {
      dto.fromBranchId = req.user.branchId;
    }
    return this.transfersService.create(dto, req.user.id);
  }

  // Listado. El vendedor solo ve las solicitudes que originó su sede; el admin
  // y el supervisor ven todas. Filtro opcional por estado.
  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get()
  findAll(
    @Request() req: RequestWithUser,
    @Query('status') status?: RequestStatus,
    @Query('fromBranchId') fromBranchId?: string,
  ) {
    const scopedBranch =
      req.user.role === 'CASHIER' ? req.user.branchId : fromBranchId;
    return this.transfersService.findAll(status, scopedBranch);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Roles('ADMIN')
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ResolveTransferRequestDto,
    @Request() req: RequestWithUser,
  ) {
    return this.transfersService.approve(id, dto, req.user.id);
  }

  @Roles('ADMIN')
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: ResolveTransferRequestDto,
    @Request() req: RequestWithUser,
  ) {
    return this.transfersService.reject(id, dto, req.user.id);
  }
}
