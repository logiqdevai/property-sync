import { Injectable } from '@nestjs/common';
import { DewatermarkAuthContext } from '../interfaces/dewatermark-auth.interface';
import {
  DewatermarkEraseWatermarkParams,
  DewatermarkEraseWatermarkProParams,
  DewatermarkEraseWatermarkResult,
} from '../interfaces/dewatermark-image.interface';
import { ResolvedDewatermarkIntegration } from '../interfaces/dewatermark-integration.interface';
import { DewatermarkImageService } from './dewatermark-image.service';
import { DewatermarkIntegrationResolverService } from './dewatermark-integration-resolver.service';

@Injectable()
export class DewatermarkOrchestratorService {
  constructor(
    private readonly resolver: DewatermarkIntegrationResolverService,
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

  async eraseWatermarkForUser(
    userId: string,
    params: DewatermarkEraseWatermarkParams,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const auth = await this.authForUser(userId);
    return this.imageService.eraseWatermark(auth, params);
  }

  async eraseWatermarkProForUser(
    userId: string,
    params: DewatermarkEraseWatermarkProParams,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const auth = await this.authForUser(userId);
    return this.imageService.eraseWatermarkPro(auth, params);
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
