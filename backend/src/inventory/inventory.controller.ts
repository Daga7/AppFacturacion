import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  getStock(@Query('branchId') branchId?: string) {
    return this.inventoryService.getStock(branchId);
  }

  @Get('movements')
  getMovements(
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getMovements(branchId, limit ? +limit : 50);
  }

  @Get('low-stock')
  getLowStock(@Query('threshold') threshold?: string) {
    return this.inventoryService.getLowStock(threshold ? +threshold : 5);
  }

  @Post('adjust')
  adjustStock(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto);
  }

  @Post('transfer')
  transferStock(@Body() dto: TransferStockDto) {
    return this.inventoryService.transferStock(dto);
  }
}
