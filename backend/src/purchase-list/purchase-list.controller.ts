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
import { PurchaseListService } from './purchase-list.service';
import { CreatePurchaseItemDto } from './dto/create-purchase-item.dto';
import { AddRecommendationDto } from './dto/add-recommendation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { scopedBranchId } from '../auth/request-user';
import type { RequestWithUser } from '../auth/request-user';

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
    return this.service.recommendations(scopedBranchId(req.user, branchId));
  }

  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get()
  findAll(
    @Request() req: RequestWithUser,
    @Query('branchId') branchId?: string,
    @Query('includeResolved') includeResolved?: string,
  ) {
    return this.service.findAll(
      scopedBranchId(req.user, branchId),
      includeResolved === 'true',
    );
  }

  // El vendedor agrega un ítem manual (queda en su sede).
  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body() dto: CreatePurchaseItemDto, @Request() req: RequestWithUser) {
    return this.service.create(
      dto,
      req.user.id,
      scopedBranchId(req.user, dto.branchId),
    );
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('from-recommendation')
  addFromRecommendation(
    @Body() dto: AddRecommendationDto,
    @Request() req: RequestWithUser,
  ) {
    // dto.branchId es obligatorio en el DTO, así que el scope siempre resuelve.
    const branchId = scopedBranchId(req.user, dto.branchId)!;
    return this.service.addFromRecommendation(
      dto.productId,
      branchId,
      dto.quantity,
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
