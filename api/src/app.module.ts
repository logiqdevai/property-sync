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
import { PropertiesModule } from './modules/properties/properties.module';
import { OpenAiWebhooksModule } from './modules/openai-webhooks/openai-webhooks.module';
import { UserIntegrationsModule } from './modules/user-integrations/user-integrations.module';
import { UserTrackedAgenciesModule } from './modules/user-tracked-agencies/user-tracked-agencies.module';
import { UserPropertiesModule } from './modules/user-properties/user-properties.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QueuesModule } from './core/queues/queues.module';
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
    // GraphQLModule,
    AuthModule,
    UsersModule,
    AgenciesModule,
    ScrapersModule,
    UserIntegrationsModule,
    ScraperGenerationModule,
    CrawlRunsModule,
    JobsModule,
    PropertiesModule,
    OpenAiWebhooksModule,
    UserTrackedAgenciesModule,
    UserPropertiesModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
