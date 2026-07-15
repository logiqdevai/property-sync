import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole } from 'generated/prisma';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './entities/dashboard.entity';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Admin dashboard KPIs and activity feed' })
  @ApiResponse({ status: 200, type: DashboardResponse })
  getDashboard() {
    return this.dashboardService.getDashboard();
  }
}
