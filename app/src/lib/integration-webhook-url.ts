import { environments } from "@/config/environments";
import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export function integrationSupportsWebhookUrl(
  integrationType: IntegrationType | string,
): boolean {
  return integrationType === IntegrationTypes.OPENAI;
}

export function getIntegrationWebhookUrl(
  integrationType: IntegrationType | string,
  connectionId: string,
): string | null {
  if (!integrationSupportsWebhookUrl(integrationType)) {
    return null;
  }

  const base = environments.API_URL.replace(/\/$/, "");
  return `${base}/webhooks/openai/${connectionId}`;
}
