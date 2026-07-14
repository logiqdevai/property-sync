import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AiProvider, IntegrationType } from 'generated/prisma';
import {
  ResolvedApiKey,
  ResolvedSourceAgencyApiKey,
} from './interfaces/user-integration.interface';

/**
 * Minimal Feature 09 dependency surface consumed by Feature 04 (AI generation) and
 * Feature 06 (property normalization). Full admin/user CRUD for IntegrationTarget /
 * UserIntegration is built out in Feature 09 — this only implements the credential
 * resolver contract documented in docs/plan/directions/03-domain-model.md so those
 * later features aren't blocked on ordering.
 */
@Injectable()
export class UserIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveApiKey(
    userId: string,
    integrationType: IntegrationType,
  ): Promise<ResolvedApiKey> {
    const userIntegration = await this.prisma.userIntegration.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        api_key_secret: { not: null },
        integration_target: { integration_type: integrationType },
      },
    });

    if (!userIntegration?.api_key_secret) {
      throw new BadRequestException(
        `Connect ${integrationType} on the Integrations page first`,
      );
    }

    return {
      userIntegrationId: userIntegration.id,
      apiKey: userIntegration.api_key_secret,
    };
  }

  async resolveForSourceAgency(
    sourceAgencyId: string,
    aiProvider: AiProvider,
  ): Promise<ResolvedSourceAgencyApiKey | null> {
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        source_agency_id: sourceAgencyId,
        enabled: true,
        ai_provider: aiProvider,
      },
      orderBy: { created_at: 'asc' },
    });

    // AiProvider and IntegrationType share member names (OPENAI/ANTHROPIC/GEMINI) by design.
    const integrationType = aiProvider as unknown as IntegrationType;

    for (const tracker of trackers) {
      const userIntegration = await this.prisma.userIntegration.findFirst({
        where: {
          user_id: tracker.user_id,
          is_active: true,
          api_key_secret: { not: null },
          integration_target: { integration_type: integrationType },
        },
      });

      if (userIntegration?.api_key_secret) {
        return {
          userIntegrationId: userIntegration.id,
          apiKey: userIntegration.api_key_secret,
          userId: tracker.user_id,
        };
      }
    }

    return null;
  }
}
