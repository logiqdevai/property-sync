import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { AuthRole, CrawlRunStatus } from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { CrawlRunsService } from './crawl-runs.service';
import {
  CrawlRunQuerySchema,
  CrawlRunQueryType,
} from './dto/crawl-run-query.schema';
import { DeleteCrawlRunsDto } from './dto/delete-crawl-runs.dto';
import { CrawlRun } from './entities/crawl-run.entity';

@ApiTags('Crawl Runs')
@ApiBearerAuth()
@Controller('admin/crawl-runs')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class CrawlRunsController {
  constructor(private readonly crawlRunsService: CrawlRunsService) {}

  @Get()
  @ApiOperation({ summary: 'List crawl runs (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated crawl run list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: CrawlRunStatus })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'scraper_id', required: false, type: String })
  @ApiQuery({ name: 'user_tracked_agency_id', required: false, type: String })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(CrawlRunQuerySchema)) query: CrawlRunQueryType,
  ) {
    return this.crawlRunsService.findAll(query);
  }

  @Post('bulk-delete')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete multiple crawl runs' })
  @ApiResponse({ status: 200, description: 'Crawl runs deleted' })
  @ApiResponse({ status: 400, description: 'One or more runs are active' })
  @ApiResponse({ status: 404, description: 'One or more crawl runs not found' })
  removeMany(@Body() dto: DeleteCrawlRunsDto) {
    return this.crawlRunsService.removeMany(dto.crawl_run_ids);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one crawl run with execution traces and job logs',
  })
  @ApiResponse({ status: 200, type: CrawlRun })
  @ApiResponse({ status: 404, description: 'Crawl run not found' })
  findOne(@Param('id') id: string) {
    return this.crawlRunsService.findOne(id);
  }

  @Post(':id/rerun')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Re-enqueue a crawl run with the same attribution' })
  @ApiResponse({ status: 201, type: CrawlRun })
  @ApiResponse({ status: 404, description: 'Crawl run not found' })
  rerun(@Param('id') id: string) {
    return this.crawlRunsService.rerun(id);
  }

  @Post(':id/cancel')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Stop a queued or running crawl run' })
  @ApiResponse({ status: 200, type: CrawlRun })
  @ApiResponse({ status: 400, description: 'Crawl run is not stoppable' })
  @ApiResponse({ status: 404, description: 'Crawl run not found' })
  cancel(@Param('id') id: string) {
    return this.crawlRunsService.cancel(id);
  }

  @Delete(':id')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete a crawl run' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 400, description: 'Crawl run is still active' })
  @ApiResponse({ status: 404, description: 'Crawl run not found' })
  remove(@Param('id') id: string) {
    return this.crawlRunsService.remove(id);
  }
}
