import { environments } from "@/config/environments";
import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export function getIntegrationWebhookUrl(
  integrationType: IntegrationType | string,
  connectionId: string,
): string | null {
  if (integrationType !== IntegrationTypes.OPENAI) {
    return null;
  }

  const base = environments.API_URL.replace(/\/$/, "");
  return `${base}/webhooks/openai/${connectionId}`;
}
