import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
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
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { ActivityOutcome, AuthRole } from 'generated/prisma';
import { ActivityLogsService } from './activity-logs.service';
import {
  ActivityLogQuerySchema,
  ActivityLogQueryType,
} from './dto/activity-log-query.schema';

// Deliberately ADMIN-only (SUPER_ADMIN bypasses RolesGuard): logs contain request payloads and
// entity snapshots, so SUPPORT -- which most other admin pages allow -- is excluded.
@ApiTags('Activity Logs')
@ApiBearerAuth()
@Controller('admin/activity-logs')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List activity logs (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated activity log list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'user_id', required: false, type: String, description: 'Actor or account acted upon' })
  @ApiQuery({ name: 'actor_id', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'entity_type', required: false, type: String })
  @ApiQuery({ name: 'entity_id', required: false, type: String })
  @ApiQuery({ name: 'outcome', required: false, enum: ActivityOutcome })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(ActivityLogQuerySchema))
    query: ActivityLogQueryType,
  ) {
    return this.activityLogsService.findAll(query);
  }

  @Get('facets')
  @ApiOperation({ summary: 'Distinct categories, actions and entity types (filter options)' })
  getFacets() {
    return this.activityLogsService.getFacets();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Activity log detail incl. request data and before/after changes' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const log = await this.activityLogsService.findOne(id);
    if (!log) throw new NotFoundException('Activity log not found');
    return log;
  }
}
