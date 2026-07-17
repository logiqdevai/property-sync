import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
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
  findAll(
    @Query(new ZodValidationPipe(UserCmsSyncRunQuerySchema))
    query: UserCmsSyncRunQueryType,
    @CurrentUser('id') userId: string,
  ) {
    return this.cmsSyncRunsService.findAllForUser(userId, query);
  }
}
