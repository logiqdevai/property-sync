import { BadRequestException } from '@nestjs/common';
import { AuthType, IntegrationType } from 'generated/prisma';
import { CredentialInput } from './credential-fields.util';

const AI_INTEGRATION_TYPES = new Set<IntegrationType>([
  IntegrationType.OPENAI,
  IntegrationType.ANTHROPIC,
  IntegrationType.GEMINI,
  IntegrationType.DEEPSEEK,
]);

export function isAiIntegrationType(type: IntegrationType): boolean {
  return AI_INTEGRATION_TYPES.has(type);
}

export function assertWebhookKeyAllowed(
  integrationType: IntegrationType,
  webhookKey?: string,
): void {
  if (webhookKey !== undefined && webhookKey !== '' && !isAiIntegrationType(integrationType)) {
    throw new BadRequestException('Webhook key is only supported for AI provider integrations');
  }
}

export function validateAiIntegrationWebhookKey(
  integrationType: IntegrationType,
  authType: AuthType,
  input: CredentialInput,
  options: { requireOnCreate?: boolean } = {},
): void {
  assertWebhookKeyAllowed(integrationType, input.webhook_key);

  if (!options.requireOnCreate || !isAiIntegrationType(integrationType)) {
    return;
  }

  if (
    (authType === AuthType.API_KEY || authType === AuthType.BEARER_TOKEN) &&
    !input.webhook_key
  ) {
    throw new BadRequestException('Webhook signing secret is required');
  }
}
