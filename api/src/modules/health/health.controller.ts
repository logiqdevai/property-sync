import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { ApiHealthIndicator } from './indicators/api.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly apiIndicator: ApiHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check API, database, and Redis health' })
  @ApiResponse({ status: 200, description: 'All checks passed' })
  @ApiResponse({ status: 503, description: 'One or more checks failed' })
  check() {
    return this.health.check([
      () => this.apiIndicator.isHealthy('api'),
      () =>
        this.prismaIndicator.pingCheck('database', this.prisma, {
          timeout: 5000,
        }),
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
