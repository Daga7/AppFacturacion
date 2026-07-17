import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { BulkAdjustStockDto } from './dto/bulk-adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
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
    @Query('type') type?: InventoryMovementType,
  ) {
    return this.inventoryService.getMovements(
      branchId,
      limit ? +limit : 50,
      type,
    );
  }

  @Patch('movements/:id')
  updateMovement(@Param('id') id: string, @Body() dto: UpdateMovementDto) {
    return this.inventoryService.updateMovement(id, dto);
  }

  @Get('low-stock')
  getLowStock(@Query('threshold') threshold?: string) {
    return this.inventoryService.getLowStock(threshold ? +threshold : 5);
  }

  @Post('adjust')
  adjustStock(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto);
  }

  @Post('adjust-bulk')
  adjustStockBulk(@Body() dto: BulkAdjustStockDto) {
    return this.inventoryService.adjustStockBulk(dto);
  }

  @Post('transfer')
  transferStock(@Body() dto: TransferStockDto) {
    return this.inventoryService.transferStock(dto);
  }
}
