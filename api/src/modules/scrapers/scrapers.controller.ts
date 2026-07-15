import {
  Body,
  Controller,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole } from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { ScrapersService } from './scrapers.service';
import { CreateScraperDto } from './dto/create-scraper.dto';
import { CreateScraperVersionDto } from './dto/create-scraper-version.dto';
import { UpdateScraperDto } from './dto/update-scraper.dto';
import {
  ScraperQuerySchema,
  ScraperQueryType,
} from './dto/scraper-query.schema';
import { Scraper } from './entities/scraper.entity';
import { ScraperVersion } from './entities/scraper-version.entity';

@ApiTags('Scrapers')
@ApiBearerAuth()
@Controller('admin/scrapers')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class ScrapersController {
  constructor(private readonly scrapersService: ScrapersService) {}

  @Get()
  @ApiOperation({
    summary: 'List scrapers (paginated, searchable, filterable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated scraper list' })
  findAll(
    @Query(new ZodValidationPipe(ScraperQuerySchema)) query: ScraperQueryType,
  ) {
    return this.scrapersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one scraper with its active version' })
  @ApiResponse({ status: 200, type: Scraper })
  @ApiResponse({ status: 404, description: 'Scraper not found' })
  findOne(@Param('id') id: string) {
    return this.scrapersService.findOne(id);
  }

  @Post()
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Create a scraper with an initial active version (version 1)',
  })
  @ApiResponse({ status: 201, type: Scraper })
  create(@Body() dto: CreateScraperDto) {
    return this.scrapersService.create(dto);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: "List a scraper's versions (newest first)" })
  @ApiResponse({ status: 200, type: [ScraperVersion] })
  listVersions(@Param('id') id: string) {
    return this.scrapersService.listVersions(id);
  }

  @Post(':id/versions')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Create a new scraper version (does not activate it)',
  })
  @ApiResponse({ status: 201, type: ScraperVersion })
  createVersion(@Param('id') id: string, @Body() dto: CreateScraperVersionDto) {
    return this.scrapersService.createVersion(id, dto);
  }

  @Post(':id/versions/:versionId/activate')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      'Activate a version (rollback or promote); un-breaks a BROKEN scraper',
  })
  @ApiResponse({ status: 200, type: Scraper })
  @ApiResponse({
    status: 404,
    description: 'Version not found for this scraper',
  })
  activateVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.scrapersService.activateVersion(id, versionId);
  }

  @Patch(':id')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      'Toggle self_healing_enabled and/or update validation_rules (creates a new version)',
  })
  @ApiResponse({ status: 200, type: Scraper })
  update(@Param('id') id: string, @Body() dto: UpdateScraperDto) {
    return this.scrapersService.update(id, dto);
  }

  @Post(':id/run-now')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Manually trigger a crawl run' })
  @ApiResponse({ status: 201, description: 'Crawl run enqueued' })
  runNow(@Param('id') id: string) {
    return this.scrapersService.runNow(id);
  }
}
