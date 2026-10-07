import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { AuthRole, CmsSyncStatus } from 'generated/prisma';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { CmsSyncRunsService } from './cms-sync-runs.service';
import {
  UserCmsSyncRunQuerySchema,
  UserCmsSyncRunQueryType,
} from './dto/cms-sync-run-query.schema';
import { DeleteCmsSyncRunsDto } from './dto/delete-cms-sync-runs.dto';
import { CancelPendingCmsSyncRunsDto } from './dto/cancel-pending-cms-sync-runs.dto';
import { Audited } from '@/modules/activity-logs/decorators/audited.decorator';

@ApiTags('CMS Sync Runs')
@ApiBearerAuth()
@Controller('cms-sync-runs')
@UseGuards(JwtGuard)
export class CmsSyncRunsController {
  constructor(private readonly cmsSyncRunsService: CmsSyncRunsService) {}

  @Get()
  @ApiOperation({
    summary:
      "List the current user's CMS sync runs (paginated, filterable by integration, status, date range)",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated CMS sync run list scoped to the current user',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: CmsSyncStatus })
  @ApiQuery({ name: 'user_integration_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(UserCmsSyncRunQuerySchema))
    query: UserCmsSyncRunQueryType,
    @CurrentUser('id') userId: string,
  ) {
    return this.cmsSyncRunsService.findAllForUser(userId, query);
  }

  @Audited({ action: 'cms_sync_run.bulk_cancel', entity: 'CmsSyncRun', ids: { body: 'cms_sync_run_ids' } })
  @Post('bulk-cancel')
  @ApiOperation({
    summary:
      'Cancel multiple pending/retrying CMS sync runs for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Cancelled ids and any that could not be cancelled',
  })
  bulkCancel(
    @Body() dto: DeleteCmsSyncRunsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cmsSyncRunsService.cancelMany(userId, dto.cms_sync_run_ids);
  }

  @Audited({ action: 'cms_sync_run.cancel_pending_for_agency', entity: 'CmsSyncRun' })
  @Post('cancel-pending')
  @UseGuards(RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      "Admin only: cancel all of the current user's pending/retrying CMS sync runs for one agency",
  })
  @ApiResponse({ status: 200, description: 'Number of runs cancelled' })
  @ApiResponse({ status: 404, description: 'Tracked agency not found' })
  cancelPending(
    @Body() dto: CancelPendingCmsSyncRunsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cmsSyncRunsService.cancelPendingForAgency(
      userId,
      dto.source_agency_id,
    );
  }

  @Audited({ action: 'cms_sync_run.bulk_resume', entity: 'CmsSyncRun', ids: { body: 'cms_sync_run_ids' } })
  @Post('bulk-resume')
  @ApiOperation({
    summary:
      'Resume (retry) multiple failed/retrying/cancelled CMS sync runs for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumed ids and any that could not be resumed',
  })
  bulkResume(
    @Body() dto: DeleteCmsSyncRunsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cmsSyncRunsService.resumeMany(userId, dto.cms_sync_run_ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single CMS sync run for the current user' })
  @ApiResponse({ status: 200, description: 'CMS sync run detail' })
  @ApiResponse({ status: 404, description: 'CMS sync run not found' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.cmsSyncRunsService.findOneForUser(userId, id);
  }
}
