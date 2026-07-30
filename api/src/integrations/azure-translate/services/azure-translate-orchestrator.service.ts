import { Injectable } from '@nestjs/common';
import { AzureTranslateAuthContext } from '../interfaces/azure-translate-auth.interface';
import { ResolvedAzureTranslateIntegration } from '../interfaces/azure-translate-integration.interface';
import { AzureTranslateOptions, AzureTranslateResult } from '../interfaces/azure-translate.interface';
import { AzureTranslateIntegrationResolverService } from './azure-translate-integration-resolver.service';
import { AzureTranslateService } from './azure-translate.service';

@Injectable()
export class AzureTranslateOrchestratorService {
  constructor(
    private readonly resolver: AzureTranslateIntegrationResolverService,
    private readonly translateService: AzureTranslateService,
  ) {}

  resolveActiveForUser(
    userId: string,
  ): Promise<ResolvedAzureTranslateIntegration> {
    return this.resolver.resolveActiveForUser(userId);
  }

  resolveByUserIntegrationId(
    userIntegrationId: string,
    userId?: string,
  ): Promise<ResolvedAzureTranslateIntegration> {
    return this.resolver.resolveByUserIntegrationId(userIntegrationId, userId);
  }

  findActiveForUser(
    userId: string,
  ): Promise<ResolvedAzureTranslateIntegration | null> {
    return this.resolver.findActiveForUser(userId);
  }

  testConnection(userIntegrationId: string, userId?: string) {
    return this.resolver.testConnection(userIntegrationId, userId);
  }

  async translateForUser(
    userId: string,
    options: AzureTranslateOptions,
  ): Promise<AzureTranslateResult[]> {
    const auth = await this.authForUser(userId);
    return this.translateService.translate(auth, options);
  }

  async translate(
    userIntegrationId: string,
    options: AzureTranslateOptions,
    userId?: string,
  ): Promise<AzureTranslateResult[]> {
    const auth = await this.authForIntegration(userIntegrationId, userId);
    return this.translateService.translate(auth, options);
  }

  async translateTextForUser(
    userId: string,
    text: string,
    to: string,
    from?: string,
  ): Promise<string> {
    const auth = await this.authForUser(userId);
    return this.translateService.translateText(auth, text, to, from);
  }

  async translateText(
    userIntegrationId: string,
    text: string,
    to: string,
    from?: string,
    userId?: string,
  ): Promise<string> {
    const auth = await this.authForIntegration(userIntegrationId, userId);
    return this.translateService.translateText(auth, text, to, from);
  }

  private async authForUser(
    userId: string,
  ): Promise<AzureTranslateAuthContext> {
    const integration = await this.resolver.resolveActiveForUser(userId);
    return { apiKey: integration.apiKey };
  }

  private async authForIntegration(
    userIntegrationId: string,
    userId?: string,
  ): Promise<AzureTranslateAuthContext> {
    const integration = await this.resolver.resolveByUserIntegrationId(
      userIntegrationId,
      userId,
    );
    return { apiKey: integration.apiKey };
  }
}
