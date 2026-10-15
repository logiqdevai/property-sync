import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { UserDashboardService } from './user-dashboard.service';
import { UserDashboardResponse } from './entities/user-dashboard.entity';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtGuard)
export class UserDashboardController {
  constructor(private readonly userDashboardService: UserDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Current user dashboard stats and recent activity' })
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month'] })
  @ApiResponse({ status: 200, type: UserDashboardResponse })
  getDashboard(
    @CurrentUser('id') userId: string,
    @Query('period') period?: string,
  ) {
    return this.userDashboardService.getDashboard(userId, period);
  }
}
