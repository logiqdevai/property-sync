import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailModule } from './modules/internal/mail/mail.module';
import { SmsModule } from './modules/internal/sms/sms.module';
import { AiModule } from './modules/internal/ai/ai.module';
import { RedisModule } from './core/databases/redis/redis.module';
import { RedisCacheModule } from './modules/internal/redis-cache/redis-cache.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { ScrapersModule } from './modules/scrapers/scrapers.module';
import { ScraperGenerationModule } from './modules/scraper-generation/scraper-generation.module';
import { CrawlRunsModule } from './modules/crawl-runs/crawl-runs.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { OpenAiWebhooksModule } from './modules/openai-webhooks/openai-webhooks.module';
import { UserIntegrationsModule } from './modules/user-integrations/user-integrations.module';
import { UserTrackedAgenciesModule } from './modules/user-tracked-agencies/user-tracked-agencies.module';
import { UserPropertiesModule } from './modules/user-properties/user-properties.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationTargetsModule } from './modules/integration-targets/integration-targets.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UserDashboardModule } from './modules/user-dashboard/user-dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { QueuesModule } from './core/queues/queues.module';
import { BullBoardModule } from './core/queues/bull-board.module';
import { ConfigModule } from './shared/config/env/env.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    MailModule,
    SmsModule,
    AiModule,
    RedisModule,
    RedisCacheModule,
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
    JobsModule,
    DiagnosticsModule,
    PropertiesModule,
    OpenAiWebhooksModule,
    UserTrackedAgenciesModule,
    UserPropertiesModule,
    NotificationsModule,
    IntegrationTargetsModule,
    DashboardModule,
    UserDashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
