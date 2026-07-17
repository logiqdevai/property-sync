import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { HealthController } from './health.controller';
import { ApiHealthIndicator } from './indicators/api.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController],
  providers: [ApiHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
