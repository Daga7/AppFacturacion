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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends ExpressRequest {
  user: { id: string; username: string; role: string };
}

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @Request() req: RequestWithUser) {
    return this.salesService.create(dto, req.user.id);
  }

  @Get()
  findAll(
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.findAll(branchId, limit ? +limit : 50);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.salesService.cancel(id);
  }

  @Get(':id/payments')
  getPayments(@Param('id') id: string) {
    return this.salesService.getPayments(id);
  }
}
