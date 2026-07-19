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
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { CmsSyncStatus } from 'generated/prisma';
import { CmsSyncRunsService } from './cms-sync-runs.service';
import {
  UserCmsSyncRunQuerySchema,
  UserCmsSyncRunQueryType,
} from './dto/cms-sync-run-query.schema';

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
}
