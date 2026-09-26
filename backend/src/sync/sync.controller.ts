import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import type { RequestWithUser } from '../auth/request-user';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  // Operaciones de caja, ventas y préstamos enviadas por el dispositivo, en
  // línea o acumuladas mientras no hubo internet.
  @Roles('ADMIN', 'CASHIER')
  @Post()
  sync(@Body() dto: SyncRequestDto, @Request() req: RequestWithUser) {
    return this.syncService.process(req.user, dto.operations);
  }

  @Roles('ADMIN')
  @Get('issues')
  issues(
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.syncService.listIssues(
      status === 'resolved' ? 'resolved' : 'open',
      branchId,
    );
  }

  @Roles('ADMIN')
  @Get('issues/count')
  count() {
    return this.syncService.countOpenIssues();
  }

  @Roles('ADMIN')
  @Post('issues/:id/resolve')
  resolve(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.syncService.resolveIssue(id, req.user.id);
  }
}
