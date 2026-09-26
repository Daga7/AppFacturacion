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
import { RequestStatus } from '@prisma/client';
import { WarrantiesService } from './warranties.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { scopedBranchId, type RequestWithUser } from '../auth/request-user';

// Garantías con el proveedor: el vendedor registra la mercancía defectuosa
// de su sede y el administrador aprueba (sale del inventario) o rechaza.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body() dto: CreateWarrantyDto, @Request() req: RequestWithUser) {
    return this.warrantiesService.create(
      dto,
      scopedBranchId(req.user, dto.branchId) ?? req.user.branchId,
      req.user.id,
    );
  }

  // El vendedor solo ve las de su sede; el admin y el supervisor, todas.
  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get()
  findAll(
    @Request() req: RequestWithUser,
    @Query('status') status?: RequestStatus,
    @Query('branchId') branchId?: string,
  ) {
    return this.warrantiesService.findAll(
      status,
      scopedBranchId(req.user, branchId),
    );
  }

  @Roles('ADMIN')
  @Post(':id/approve')
  approve(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.warrantiesService.approve(id, req.user.id);
  }

  @Roles('ADMIN')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.warrantiesService.reject(id, req.user.id);
  }
}
