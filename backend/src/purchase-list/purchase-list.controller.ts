import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PurchaseListService } from './purchase-list.service';
import { CreatePurchaseItemDto } from './dto/create-purchase-item.dto';
import { AddRecommendationDto } from './dto/add-recommendation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

interface RequestWithUser extends ExpressRequest {
  user: { id: string; username: string; role: string; branchId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-list')
export class PurchaseListController {
  constructor(private readonly service: PurchaseListService) {}

  // Recomendaciones automáticas calculadas en vivo. El vendedor las ve para su
  // sede; admin/supervisor para la sede filtrada (o todas).
  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get('recommendations')
  recommendations(
    @Request() req: RequestWithUser,
    @Query('branchId') branchId?: string,
  ) {
    const scoped = req.user.role === 'CASHIER' ? req.user.branchId : branchId;
    return this.service.recommendations(scoped);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get()
  findAll(
    @Request() req: RequestWithUser,
    @Query('branchId') branchId?: string,
    @Query('includeResolved') includeResolved?: string,
  ) {
    const scoped = req.user.role === 'CASHIER' ? req.user.branchId : branchId;
    return this.service.findAll(scoped, includeResolved === 'true');
  }

  // El vendedor agrega un ítem manual (queda en su sede).
  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body() dto: CreatePurchaseItemDto, @Request() req: RequestWithUser) {
    const branchId =
      req.user.role === 'CASHIER' ? req.user.branchId : dto.branchId;
    return this.service.create(dto, req.user.id, branchId);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('from-recommendation')
  addFromRecommendation(
    @Body() dto: AddRecommendationDto,
    @Request() req: RequestWithUser,
  ) {
    const branchId =
      req.user.role === 'CASHIER' ? req.user.branchId : dto.branchId;
    return this.service.addFromRecommendation(
      dto.productId,
      branchId,
      req.user.id,
      dto.note,
    );
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @Body('resolved') resolved?: boolean) {
    return this.service.setResolved(id, resolved !== false);
  }

  @Roles('ADMIN', 'CASHIER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
