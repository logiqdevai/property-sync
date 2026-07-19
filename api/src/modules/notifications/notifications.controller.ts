import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import {
  AuthRole,
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { NotificationsService } from './notifications.service';
import {
  NotificationQuerySchema,
  NotificationQueryType,
} from './dto/notification-query.schema';
import { DeleteNotificationsDto } from './dto/delete-notifications.dto';
import { SendTelegramTestDto } from './dto/send-telegram-test.dto';
import { Notification } from './entities/notification.entity';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated notification list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: NotificationType })
  @ApiQuery({ name: 'severity', required: false, enum: NotificationSeverity })
  @ApiQuery({ name: 'is_read', required: false, enum: ['true', 'false'] })
  findAll(
    @Query(new ZodValidationPipe(NotificationQuerySchema))
    query: NotificationQueryType,
  ) {
    return this.notificationsService.findAll(query);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'Count of updated notifications' })
  markAllRead() {
    return this.notificationsService.markAllRead();
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple notifications' })
  @ApiResponse({ status: 200, description: 'Count of deleted notifications' })
  removeMany(@Body() dto: DeleteNotificationsDto) {
    return this.notificationsService.removeMany(dto.ids);
  }

  @Post('telegram/test')
  @ApiOperation({
    summary: 'Send a test message to the configured Telegram chat',
  })
  @ApiResponse({ status: 200, description: 'Message sent' })
  @ApiResponse({ status: 503, description: 'Telegram is not configured' })
  sendTelegramTest(@Body() dto: SendTelegramTestDto) {
    return this.notificationsService.sendTelegramTest(dto.message);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 200, type: Notification })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }
}
