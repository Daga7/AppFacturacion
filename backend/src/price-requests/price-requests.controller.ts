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
import { PriceRequestsService } from './price-requests.service';
import { CreatePriceRequestDto } from './dto/create-price-request.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

interface RequestWithUser extends ExpressRequest {
  user: { id: string; username: string; role: string; branchId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('price-requests')
export class PriceRequestsController {
  constructor(private readonly service: PriceRequestsService) {}

  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body() dto: CreatePriceRequestDto, @Request() req: RequestWithUser) {
    return this.service.create(dto, req.user.id);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get()
  findAll(@Query('status') status?: RequestStatus) {
    return this.service.findAll(status);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'CASHIER')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post(':id/approve')
  approve(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.service.approve(id, req.user.id);
  }

  @Roles('ADMIN')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.service.reject(id, req.user.id);
  }
}
