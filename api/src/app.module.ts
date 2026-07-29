import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './core/databases/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { ScrapersModule } from './modules/scrapers/scrapers.module';
import { ScraperGenerationModule } from './modules/scraper-generation/scraper-generation.module';
import { CrawlRunsModule } from './modules/crawl-runs/crawl-runs.module';
import { CmsSyncRunsModule } from './modules/cms-sync-runs/cms-sync-runs.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { SourcePropertiesModule } from './modules/source-properties/source-properties.module';
import { OpenAiWebhooksModule } from './modules/openai-webhooks/openai-webhooks.module';
import { UserIntegrationsModule } from './modules/user-integrations/user-integrations.module';
import { UserTrackedAgenciesModule } from './modules/user-tracked-agencies/user-tracked-agencies.module';
import { UserPropertiesModule } from './modules/user-properties/user-properties.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationTargetsModule } from './modules/integration-targets/integration-targets.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UserDashboardModule } from './modules/user-dashboard/user-dashboard.module';
import { EstateWebAdminModule } from './modules/estateweb/estateweb-admin.module';
import { HealthModule } from './modules/health/health.module';
import { QueuesModule } from './core/queues/queues.module';
import { BullBoardModule } from './core/queues/bull-board.module';
import { ConfigModule } from './shared/config/env/env.module';
import { CmsSyncModule } from './modules/cms-sync/cms-sync.module';
import { ContentPublishingModule } from './modules/content-publishing/content-publishing.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    RedisModule,
    QueuesModule,
    BullBoardModule,
    HealthModule,
    // GraphQLModule,
    AuthModule,
    UsersModule,
    AgenciesModule,
    ScrapersModule,
    UserIntegrationsModule,
    ScraperGenerationModule,
    CrawlRunsModule,
    CmsSyncRunsModule,
    JobsModule,
    DiagnosticsModule,
    PropertiesModule,
    SourcePropertiesModule,
    OpenAiWebhooksModule,
    UserTrackedAgenciesModule,
    UserPropertiesModule,
    NotificationsModule,
    IntegrationTargetsModule,
    PlatformConfigModule,
    DashboardModule,
    UserDashboardModule,
    EstateWebAdminModule,
    CmsSyncModule,
    ContentPublishingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
