import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { CrawlRunsService } from './crawl-runs.service';
import {
  UserCrawlRunQuerySchema,
  UserCrawlRunQueryType,
} from './dto/crawl-run-query.schema';

@ApiTags('Crawl Runs')
@ApiBearerAuth()
@Controller('crawl-runs')
@UseGuards(JwtGuard)
export class UserCrawlRunsController {
  constructor(private readonly crawlRunsService: CrawlRunsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List the current user\'s crawl runs (paginated, filterable by tracked agency, status, date range)',
  })
  @ApiResponse({ status: 200, description: 'Paginated crawl run list scoped to the current user' })
  findAll(
    @Query(new ZodValidationPipe(UserCrawlRunQuerySchema)) query: UserCrawlRunQueryType,
    @CurrentUser('id') userId: string,
  ) {
    return this.crawlRunsService.findAllForUser(userId, query);
  }
}
