import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogInterceptor } from './interceptors/activity-log.interceptor';

/**
 * Global so any service can inject ActivityLogsService.recordChange() without importing this
 * module. The CLS middleware gives every HTTP request an AsyncLocalStorage context that the
 * interceptor uses to collect recordChange() calls.
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
  ],
  controllers: [ActivityLogsController],
  providers: [
    ActivityLogsService,
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
