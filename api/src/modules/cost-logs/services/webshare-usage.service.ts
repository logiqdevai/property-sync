import { Injectable, Logger } from '@nestjs/common';
import { CostOperationType, IntegrationType } from 'generated/prisma';
import { WEBSHARE_BYTES_PER_GB } from '@/integrations/webshare/constants/webshare.constants';
import { WebshareProxyService } from '@/integrations/webshare/services/webshare-proxy.service';
import { CostLogsService } from '../cost-logs.service';
import {
  RecordWebshareUsageParams,
  WebshareUsage,
} from '../interfaces/webshare-usage.interface';

const CACHE_TTL_MS = 60_000;

@Injectable()
export class WebshareUsageService {
  private readonly logger = new Logger(WebshareUsageService.name);
  private cache: { at: number; value: WebshareUsage } | null = null;

  constructor(
    private readonly webshare: WebshareProxyService,
    private readonly costLogs: CostLogsService,
  ) {}

  /** Live plan limit and usage for the current billing period, read from the Webshare API. */
  async getUsage(): Promise<WebshareUsage> {
    if (!this.webshare.isConfigured()) {
      return { configured: false };
    }
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.value;
    }

    const subscription = await this.webshare.getSubscription();
    const plan = await this.webshare.getPlan(subscription.plan);
    const stats = await this.webshare.getStatsAggregate({
      from: new Date(subscription.start_date),
    });

    const limitBytes =
      plan.bandwidth_limit && plan.bandwidth_limit > 0
        ? plan.bandwidth_limit * WEBSHARE_BYTES_PER_GB
        : null;
    const usedBytes = stats.bandwidth_total ?? 0;

    const value: WebshareUsage = {
      configured: true,
      plan: {
        id: plan.id,
        proxy_type: plan.proxy_type,
        proxy_subtype: plan.proxy_subtype,
        monthly_price: plan.monthly_price,
      },
      period_start: subscription.start_date,
      period_end: subscription.end_date,
      limit_bytes: limitBytes,
      used_bytes: usedBytes,
      remaining_bytes:
        limitBytes === null ? null : Math.max(limitBytes - usedBytes, 0),
      percent_used: limitBytes === null ? null : (usedBytes / limitBytes) * 100,
      requests_total: stats.requests_total ?? 0,
      requests_failed: stats.requests_failed ?? 0,
      fetched_at: new Date().toISOString(),
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  /**
   * Writes one PROXY cost log for bandwidth used through Webshare. Cost is the share of the
   * plan's monthly price the bytes represent (price / bandwidth_limit), both read from the API.
   * Never throws -- logging must not break the calling operation.
   */
  async recordUsage(params: RecordWebshareUsageParams): Promise<void> {
    try {
      const usage = await this.getUsage();
      const limitBytes = usage.limit_bytes;
      const totalCost =
        usage.plan && limitBytes
          ? (params.bytes / limitBytes) * usage.plan.monthly_price
          : 0;

      await this.costLogs.record({
        userId: params.userId,
        operationType: CostOperationType.PROXY,
        provider: IntegrationType.WEBSHARE,
        model: usage.plan
          ? `${usage.plan.proxy_type}-${usage.plan.proxy_subtype}`
          : null,
        inputQuantity: params.bytes,
        unitCount: params.requests ?? null,
        totalCost,
        crawlRunId: params.crawlRunId,
        userTrackedAgencyId: params.userTrackedAgencyId,
        metadata: params.metadata,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record Webshare usage: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
