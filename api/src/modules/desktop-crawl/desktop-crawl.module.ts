import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { raw } from 'express';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CaptchaModule } from '@/integrations/captcha/captcha.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { PropertiesModule } from '@/modules/properties/properties.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { UserPropertiesModule } from '@/modules/user-properties/user-properties.module';
import { GcsIntegrationModule } from '@/integrations/storage/gcs/gcs.module';
import { DesktopCrawlAutoUpdateRestoreCron } from '@/background/desktop-crawl-auto-update-restore.cron';
import {
  DESKTOP_CRAWL_UPLOAD_CONTENT_TYPE,
  DESKTOP_CRAWL_UPLOAD_MAX_GZIP_BYTES,
} from './constants/desktop-crawl.constants';
import { DesktopCrawlController } from './desktop-crawl.controller';
import { DesktopCrawlService } from './services/desktop-crawl.service';
import { DesktopCrawlIngestService } from './services/desktop-crawl-ingest.service';
import { DesktopCrawlCaptchaService } from './services/desktop-crawl-captcha.service';
import { DesktopCrawlPhotosService } from './services/desktop-crawl-photos.service';
import { DesktopCrawlPushService } from './services/desktop-crawl-push.service';
import { DesktopAppReleaseService } from './services/desktop-app-release.service';

@Module({
  imports: [
    PrismaModule,
    CaptchaModule,
    EstateWebModule,
    PropertiesModule,
    CmsSyncModule,
    UserPropertiesModule,
    GcsIntegrationModule,
  ],
  controllers: [DesktopCrawlController],
  providers: [
    DesktopCrawlService,
    DesktopCrawlIngestService,
    DesktopCrawlCaptchaService,
    DesktopCrawlPhotosService,
    DesktopCrawlPushService,
    DesktopAppReleaseService,
    DesktopCrawlAutoUpdateRestoreCron,
  ],
})
export class DesktopCrawlModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Crawl uploads are gzipped JSON (tens of MB unpacked) -- read them as a raw Buffer; the
    // controller unpacks and validates. The global JSON parser ignores this content type.
    consumer
      .apply(
        raw({
          type: DESKTOP_CRAWL_UPLOAD_CONTENT_TYPE,
          limit: DESKTOP_CRAWL_UPLOAD_MAX_GZIP_BYTES,
        }),
      )
      .forRoutes({
        path: 'desktop-crawl/scrapers/:id/runs',
        method: RequestMethod.POST,
      });
  }
}
