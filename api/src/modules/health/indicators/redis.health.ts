import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import Redis, { type RedisOptions } from 'ioredis';
import { REDIS_OPTIONS } from '@/core/databases/redis/redis.constants';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_OPTIONS)
    private readonly redisOptions: RedisOptions | null,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    if (!this.redisOptions) {
      return indicator.down({ message: 'Redis not configured' });
    }

    const client = new Redis({
      host: this.redisOptions.host,
      port: this.redisOptions.port,
      username: this.redisOptions.username,
      password: this.redisOptions.password,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
      enableReadyCheck: true,
      retryStrategy: () => null,
    });

    client.on('error', () => undefined);

    try {
      await client.connect();
      const pong = await client.ping();
      if (pong !== 'PONG') {
        return indicator.down({ message: `Unexpected ping response: ${pong}` });
      }
      return indicator.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return indicator.down({ message });
    } finally {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }
}
