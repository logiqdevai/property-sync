import { Prisma } from 'generated/prisma';
import { UserIntegrationSettingsData } from '@/modules/user-integrations/interfaces/user-integration-settings.interface';
import { ESTATEWEB_DEFAULT_PUSH_SITES } from '../constants/estateweb-agent-catalog.constants';
import { EstateWebPushSiteSetting } from '../interfaces/estateweb-integration-settings.interface';

export function parseUserIntegrationSettingsData(
  settings: Prisma.JsonValue | null | undefined,
): UserIntegrationSettingsData | null {
  if (settings === null || settings === undefined) {
    return null;
  }
  if (typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }
  return settings as UserIntegrationSettingsData;
}

export function resolveEstateWebPushSites(
  settings: Prisma.JsonValue | null | undefined,
): EstateWebPushSiteSetting[] {
  const configured =
    parseUserIntegrationSettingsData(settings)?.estateweb_default_sites;
  const pushSites = Array.isArray(configured)
    ? configured
    : ESTATEWEB_DEFAULT_PUSH_SITES;

  return pushSites.filter((site) => site.selected);
}
