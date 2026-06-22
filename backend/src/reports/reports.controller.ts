import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales-summary')
  salesSummary(
    @Query('branchId') branchId?: string,
    @Query('days') days?: string,
  ) {
    return this.reportsService.salesSummary(branchId, days ? +days : 30);
  }

  @Get('top-products')
  topProducts(
    @Query('branchId') branchId?: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.topProducts(
      branchId,
      days ? +days : 30,
      limit ? +limit : 10,
    );
  }

  @Get('inventory-status')
  inventoryStatus(@Query('branchId') branchId?: string) {
    return this.reportsService.inventoryStatus(branchId);
  }

  @Get('payment-summary')
  paymentSummary(
    @Query('branchId') branchId?: string,
    @Query('days') days?: string,
  ) {
    return this.reportsService.paymentSummary(branchId, days ? +days : 30);
  }
}
