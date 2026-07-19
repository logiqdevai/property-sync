import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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
  @ApiResponse({ status: 200, type: UserDashboardResponse })
  getDashboard(@CurrentUser('id') userId: string) {
    return this.userDashboardService.getDashboard(userId);
  }
}
