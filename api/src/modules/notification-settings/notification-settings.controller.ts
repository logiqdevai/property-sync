import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole, NotificationType } from 'generated/prisma';
import { NotificationSettingsService } from './notification-settings.service';
import { UpdateNotificationSettingDto } from './dto/update-notification-setting.dto';
import { NotificationSetting } from './entities/notification-setting.entity';

@ApiTags('Notification Settings')
@ApiBearerAuth()
@Controller('admin/notification-settings')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class NotificationSettingsController {
  constructor(
    private readonly notificationSettingsService: NotificationSettingsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List outbound alerting preferences for every notification type',
  })
  @ApiResponse({ status: 200, type: [NotificationSetting] })
  findAll() {
    return this.notificationSettingsService.findAll();
  }

  @Patch(':type')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Update the alerting preference for a notification type' })
  @ApiResponse({ status: 200, type: NotificationSetting })
  update(
    @Param('type') type: NotificationType,
    @Body() dto: UpdateNotificationSettingDto,
  ) {
    return this.notificationSettingsService.update(type, dto);
  }
}
