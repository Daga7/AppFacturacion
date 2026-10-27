import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EnvironmentService } from './environment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

// Impacto ambiental: papel que las sedes dejan de usar al registrar sus
// operaciones en la app. Es un informe de consulta (admin y supervisor).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
@Controller('environment')
export class EnvironmentController {
  constructor(private readonly environmentService: EnvironmentService) {}

  @Get('summary')
  summary(@Query('period') period?: string) {
    return this.environmentService.summary(
      period === 'total' ? 'total' : 'month',
    );
  }
}
