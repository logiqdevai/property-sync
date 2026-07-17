import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class ApiHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  isHealthy(key: string) {
    return this.healthIndicatorService.check(key).up({
      uptime_seconds: Math.floor(process.uptime()),
    });
  }
}
