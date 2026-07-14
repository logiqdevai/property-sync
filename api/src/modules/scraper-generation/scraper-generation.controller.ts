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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { ScraperGenerationService } from './scraper-generation.service';
import { CreateGenerationRunDto } from './dto/create-generation-run.dto';
import { RejectGenerationRunDto } from './dto/reject-generation-run.dto';
import {
  GenerationRunQuerySchema,
  GenerationRunQueryType,
} from './dto/generation-run-query.schema';
import { ScraperGenerationRun } from './entities/generation-run.entity';

@ApiTags('Scraper Generation')
@ApiBearerAuth()
@Controller('admin/generation-runs')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class ScraperGenerationController {
  constructor(
    private readonly scraperGenerationService: ScraperGenerationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List generation runs (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated generation run list' })
  findAll(
    @Query(new ZodValidationPipe(GenerationRunQuerySchema))
    query: GenerationRunQueryType,
  ) {
    return this.scraperGenerationService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one generation run with its steps' })
  @ApiResponse({ status: 200, type: ScraperGenerationRun })
  @ApiResponse({ status: 404, description: 'Generation run not found' })
  findOne(@Param('id') id: string) {
    return this.scraperGenerationService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Trigger a manual AI computer-use generation run',
  })
  @ApiResponse({ status: 201, type: ScraperGenerationRun })
  @ApiResponse({
    status: 400,
    description: 'No active Anthropic UserIntegration for this admin',
  })
  create(
    @Body() dto: CreateGenerationRunDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.scraperGenerationService.create(dto, userId);
  }

  @Post(':id/approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Approve a staged config, promoting it into a new ScraperVersion',
  })
  @ApiResponse({ status: 200, type: ScraperGenerationRun })
  @ApiResponse({
    status: 400,
    description: 'Run is not AWAITING_REVIEW with a staged config',
  })
  approve(@Param('id') id: string) {
    return this.scraperGenerationService.approve(id);
  }

  @Post(':id/reject')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Reject a generation run' })
  @ApiResponse({ status: 200, type: ScraperGenerationRun })
  @ApiResponse({ status: 400, description: 'Run has already finished' })
  reject(@Param('id') id: string, @Body() dto: RejectGenerationRunDto) {
    return this.scraperGenerationService.reject(id, dto);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Cancel a QUEUED or RUNNING generation run' })
  @ApiResponse({ status: 200, type: ScraperGenerationRun })
  @ApiResponse({
    status: 400,
    description: 'Only QUEUED or RUNNING runs can be cancelled',
  })
  cancel(@Param('id') id: string) {
    return this.scraperGenerationService.cancel(id);
  }
}
