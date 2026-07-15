import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { AuthRole } from 'generated/prisma';
import { CrawlRunsService } from './crawl-runs.service';
import { UsageQuerySchema, UsageQueryType } from './dto/crawl-run-query.schema';

@ApiTags('Usage')
@ApiBearerAuth()
@Controller('usage')
@UseGuards(JwtGuard)
export class UsageController {
  constructor(private readonly crawlRunsService: CrawlRunsService) {}

  @Get('crawl-runs')
  @ApiOperation({
    summary:
      'List crawl run token/cost usage. Admins see all runs and may filter by agency or user; regular users only see their own runs.',
  })
  @ApiResponse({ status: 200, description: 'Paginated crawl run usage with total cost' })
  findAll(
    @Query(new ZodValidationPipe(UsageQuerySchema)) query: UsageQueryType,
    @CurrentUser() user: { id: string; role: AuthRole },
  ) {
    return this.crawlRunsService.getUsage(query, user);
  }
}
