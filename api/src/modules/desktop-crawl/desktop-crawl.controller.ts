import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { gunzipSync } from 'zlib';
import { ZodError } from 'zod';
import { AuthRole } from 'generated/prisma';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { Audited } from '@/modules/activity-logs/decorators/audited.decorator';
import {
  DESKTOP_CRAWL_UPLOAD_MAX_JSON_BYTES,
  PHOTO_UPLOAD_MAX_FILES,
  PHOTO_UPLOAD_MAX_FILE_BYTES,
} from './constants/desktop-crawl.constants';
import {
  CheckPhotosSchema,
  DesktopCrawlScrapersQuerySchema,
  DesktopCrawlUploadSchema,
  ReportCaptchaSchema,
  SolveCaptchaSchema,
  UploadPhotosFieldsSchema,
  type CheckPhotosDto,
  type DesktopCrawlScrapersQueryType,
  type DesktopCrawlUploadDto,
  type ReportCaptchaDto,
  type SolveCaptchaDto,
  type UploadPhotosFieldsDto,
} from './dto/desktop-crawl.schemas';
import { DesktopCrawlService } from './services/desktop-crawl.service';
import { DesktopCrawlIngestService } from './services/desktop-crawl-ingest.service';
import { DesktopCrawlCaptchaService } from './services/desktop-crawl-captcha.service';
import { DesktopCrawlPhotosService } from './services/desktop-crawl-photos.service';
import { DesktopAppReleaseService } from './services/desktop-app-release.service';

interface UploadedPhotoFile {
  buffer: Buffer;
}

/**
 * Backend of the desktop crawler app (`desktop/`): crawls an agency whose site blocks the server
 * through a real Chrome on the operator's own computer. The app holds no secrets; everything that
 * needs the database, 2captcha or the CRM happens here.
 */
@ApiTags('Desktop Crawl')
@ApiBearerAuth()
@Controller('desktop-crawl')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class DesktopCrawlController {
  constructor(
    private readonly desktopCrawlService: DesktopCrawlService,
    private readonly ingestService: DesktopCrawlIngestService,
    private readonly captchaService: DesktopCrawlCaptchaService,
    private readonly photosService: DesktopCrawlPhotosService,
    private readonly appReleaseService: DesktopAppReleaseService,
  ) {}

  @Get('app/latest')
  @ApiOperation({
    summary:
      'Latest published installer of the desktop crawler app, with a short-lived download link',
  })
  getLatestApp() {
    return this.appReleaseService.getLatest();
  }

  @Get('app/update/:fileName')
  @ApiOperation({
    summary:
      'Auto-update feed of the desktop app: latest.yml and the installer it names (streamed)',
  })
  async getUpdateFile(
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.appReleaseService.openUpdateFile(fileName);
    res.set({
      'Content-Type': fileName.endsWith('.yml')
        ? 'text/yaml; charset=utf-8'
        : file.contentType,
      'Cache-Control': 'no-cache',
      ...(file.size ? { 'Content-Length': String(file.size) } : {}),
    });
    return new StreamableFile(file.stream);
  }

  @Get('scrapers')
  @ApiOperation({
    summary: 'Agencies that can be crawled from the desktop app',
  })
  listScrapers(
    @Query(new ZodValidationPipe(DesktopCrawlScrapersQuerySchema))
    query: DesktopCrawlScrapersQueryType,
  ) {
    return this.desktopCrawlService.listScrapers(query);
  }

  @Get('scrapers/:id/job')
  @ApiOperation({ summary: 'Scraper config + page extractors for one crawl' })
  getJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.desktopCrawlService.getJob(id);
  }

  @Audited({
    action: 'desktop_crawl.upload',
    entity: 'CrawlRun',
    resultIds: { path: 'crawl_run_id' },
  })
  @Post('scrapers/:id/runs')
  @ApiConsumes('application/gzip')
  @ApiOperation({
    summary:
      'Upload a finished desktop crawl (gzipped JSON) and start saving + normalizing it',
  })
  uploadRun(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @CurrentUser('id') userId: string,
  ) {
    return this.ingestService.startIngest(id, this.parseUpload(req), userId);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Progress of an uploaded desktop crawl' })
  getRun(@Param('id', ParseUUIDPipe) id: string) {
    return this.desktopCrawlService.getRunStatus(id);
  }

  @Audited({ action: 'desktop_crawl.captcha_solve' })
  @Post('captcha/solve')
  @ApiOperation({ summary: 'Solve a captcha the desktop app hit (2captcha)' })
  solveCaptcha(
    @Body(new ZodValidationPipe(SolveCaptchaSchema)) dto: SolveCaptchaDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.captchaService.solve(dto, userId);
  }

  @Audited({ action: 'desktop_crawl.captcha_report' })
  @Post('captcha/:taskId/report')
  @ApiOperation({ summary: 'Tell 2captcha whether the token was accepted' })
  reportCaptcha(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ZodValidationPipe(ReportCaptchaSchema)) dto: ReportCaptchaDto,
  ) {
    return this.captchaService.report(taskId, dto.correct);
  }

  @Get('agencies/:agencyId/photos')
  @ApiOperation({ summary: 'Listings of the agency already pushed to a CRM' })
  listPhotoTargets(@Param('agencyId', ParseUUIDPipe) agencyId: string) {
    return this.photosService.listTargets(agencyId);
  }

  @Audited({ action: 'desktop_crawl.photos_check' })
  @Post('agencies/:agencyId/photos/check')
  @ApiOperation({
    summary: 'Read listings live from the CRM and report missing photos',
  })
  checkPhotos(
    @Param('agencyId', ParseUUIDPipe) agencyId: string,
    @Body(new ZodValidationPipe(CheckPhotosSchema)) dto: CheckPhotosDto,
  ) {
    return this.photosService.check(agencyId, dto.user_property_ids);
  }

  @Audited({
    action: 'desktop_crawl.photos_upload',
    entity: 'UserProperty',
    ids: { param: 'userPropertyId' },
  })
  @Post('photos/:userPropertyId')
  @UseInterceptors(
    FilesInterceptor('files', PHOTO_UPLOAD_MAX_FILES, {
      limits: { fileSize: PHOTO_UPLOAD_MAX_FILE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload photos downloaded by the app to the listing in the CRM',
  })
  uploadPhotos(
    @Param('userPropertyId', ParseUUIDPipe) userPropertyId: string,
    @Body(new ZodValidationPipe(UploadPhotosFieldsSchema))
    fields: UploadPhotosFieldsDto,
    @UploadedFiles() files: UploadedPhotoFile[] = [],
  ) {
    return this.photosService.upload(userPropertyId, fields.urls, files);
  }

  /** The body arrives as gzipped JSON (raw parser registered in DesktopCrawlModule). */
  private parseUpload(req: Request): DesktopCrawlUploadDto {
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException(
        'Expected a gzipped JSON body (Content-Type: application/gzip).',
      );
    }
    let json: string;
    try {
      json = gunzipSync(body, {
        maxOutputLength: DESKTOP_CRAWL_UPLOAD_MAX_JSON_BYTES,
      }).toString('utf8');
    } catch (error) {
      if (error instanceof RangeError) {
        throw new PayloadTooLargeException('The crawl is too large to upload.');
      }
      throw new BadRequestException('The upload is not valid gzip.');
    }
    try {
      return DesktopCrawlUploadSchema.parse(JSON.parse(json));
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'The uploaded crawl is not valid.',
          errors: error.errors.slice(0, 20).map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      throw new BadRequestException('The upload is not valid JSON.');
    }
  }
}
