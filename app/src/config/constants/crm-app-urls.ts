import {
  IntegrationTypes,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

export type CrmAppUrlPaths = {
  property: string;
};

export const CrmAppUrls = {
  [IntegrationTypes.ESTATEWEB]: {
    property: "https://app.estateweb.gr/app/property",
  },
} as const satisfies Partial<Record<IntegrationType, CrmAppUrlPaths>>;

export function getCrmPropertyAppUrl(
  integrationPropertyId: string,
  integrationType: IntegrationType = IntegrationTypes.ESTATEWEB,
): string | null {
  const base = CrmAppUrls[integrationType as keyof typeof CrmAppUrls]?.property;
  if (!base || !integrationPropertyId) return null;
  return `${base}/${integrationPropertyId}`;
}
