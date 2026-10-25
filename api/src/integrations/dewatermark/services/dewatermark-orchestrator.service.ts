import { Injectable } from '@nestjs/common';
import { DewatermarkAuthContext } from '../interfaces/dewatermark-auth.interface';
import { DewatermarkCreditInfo } from '../interfaces/dewatermark-credit.interface';
import {
  DewatermarkEraseWatermarkParams,
  DewatermarkEraseWatermarkProParams,
  DewatermarkEraseWatermarkResult,
} from '../interfaces/dewatermark-image.interface';
import { ResolvedDewatermarkIntegration } from '../interfaces/dewatermark-integration.interface';
import { DewatermarkCreditService } from './dewatermark-credit.service';
import { DewatermarkImageService } from './dewatermark-image.service';
import { DewatermarkIntegrationResolverService } from './dewatermark-integration-resolver.service';

// A cached balance older than this is re-read before the next erase, so credits bought or spent
// outside this process (dashboard use, top-ups) are not billed to the next image.
const BALANCE_BASELINE_TTL_MS = 10 * 60 * 1000;
// One erase never legitimately burns more than a handful of credits; anything outside this is a
// balance change from somewhere else, so it is discarded instead of logged as image cost.
const MAX_PLAUSIBLE_CREDITS_PER_ERASE = 5;

@Injectable()
export class DewatermarkOrchestratorService {
  // Last seen credit balance per API key. Each finishing erase swaps it atomically, so
  // concurrent erases attribute consumption to different calls but the totals telescope exactly.
  private readonly lastBalance = new Map<string, { balance: number; at: number }>();

  constructor(
    private readonly resolver: DewatermarkIntegrationResolverService,
    private readonly creditService: DewatermarkCreditService,
    private readonly imageService: DewatermarkImageService,
  ) {}

  resolveActiveForUser(userId: string): Promise<ResolvedDewatermarkIntegration> {
    return this.resolver.resolveActiveForUser(userId);
  }

  resolveByUserIntegrationId(
    userIntegrationId: string,
    userId?: string,
  ): Promise<ResolvedDewatermarkIntegration> {
    return this.resolver.resolveByUserIntegrationId(userIntegrationId, userId);
  }

  findActiveForUser(
    userId: string,
  ): Promise<ResolvedDewatermarkIntegration | null> {
    return this.resolver.findActiveForUser(userId);
  }

  testConnection(userIntegrationId: string, userId?: string) {
    return this.resolver.testConnection(userIntegrationId, userId);
  }

  async getCreditInfoForUser(userId: string): Promise<DewatermarkCreditInfo> {
    const auth = await this.authForUser(userId);
    return this.creditService.getCreditInfo(auth);
  }

  async getCreditInfo(
    userIntegrationId: string,
    userId?: string,
  ): Promise<DewatermarkCreditInfo> {
    const auth = await this.authForIntegration(userIntegrationId, userId);
    return this.creditService.getCreditInfo(auth);
  }

  // Wraps an erase so the result carries the credits it really consumed, read from the
  // account's creditInfo balance (the erase response itself carries no cost). Measurement
  // failures never fail the erase: creditsConsumed is simply left undefined.
  private async measureCredits(
    auth: DewatermarkAuthContext,
    run: () => Promise<DewatermarkEraseWatermarkResult>,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const key = auth.apiKey;
    let startBalance: number | null = null;
    const known = this.lastBalance.get(key);
    if (!known || Date.now() - known.at > BALANCE_BASELINE_TTL_MS) {
      try {
        startBalance = (await this.creditService.getCreditInfo(auth)).available_credit;
        this.lastBalance.set(key, { balance: startBalance, at: Date.now() });
      } catch {
        this.lastBalance.delete(key);
      }
    }

    const result = await run();

    try {
      const after = (await this.creditService.getCreditInfo(auth)).available_credit;
      const before = this.lastBalance.get(key)?.balance ?? startBalance;
      this.lastBalance.set(key, { balance: after, at: Date.now() });
      if (before != null) {
        const consumed = before - after;
        if (consumed >= 0 && consumed <= MAX_PLAUSIBLE_CREDITS_PER_ERASE) {
          result.creditsConsumed = consumed;
        }
      }
    } catch {
      this.lastBalance.delete(key);
    }
    return result;
  }

  async eraseWatermarkForUser(
    userId: string,
    params: DewatermarkEraseWatermarkParams,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const auth = await this.authForUser(userId);
    return this.measureCredits(auth, () =>
      this.imageService.eraseWatermark(auth, params),
    );
  }

  async eraseWatermarkProForUser(
    userId: string,
    params: DewatermarkEraseWatermarkProParams,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const auth = await this.authForUser(userId);
    return this.measureCredits(auth, () =>
      this.imageService.eraseWatermarkPro(auth, params),
    );
  }

  async eraseWatermark(
    userIntegrationId: string,
    params: DewatermarkEraseWatermarkParams,
    userId?: string,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const auth = await this.authForIntegration(userIntegrationId, userId);
    return this.imageService.eraseWatermark(auth, params);
  }

  async eraseWatermarkPro(
    userIntegrationId: string,
    params: DewatermarkEraseWatermarkProParams,
    userId?: string,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const auth = await this.authForIntegration(userIntegrationId, userId);
    return this.imageService.eraseWatermarkPro(auth, params);
  }

  private async authForUser(userId: string): Promise<DewatermarkAuthContext> {
    const integration = await this.resolver.resolveActiveForUser(userId);
    return { apiKey: integration.apiKey };
  }

  private async authForIntegration(
    userIntegrationId: string,
    userId?: string,
  ): Promise<DewatermarkAuthContext> {
    const integration = await this.resolver.resolveByUserIntegrationId(
      userIntegrationId,
      userId,
    );
    return { apiKey: integration.apiKey };
  }
}
