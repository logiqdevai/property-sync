import { ESTATEWEB_DEFAULT_PUSH_SITES } from '../constants/estateweb-agent-catalog.constants';
import {
  EstateWebIntegrationSettings,
  EstateWebPushSiteSetting,
} from '../interfaces/estateweb-integration-settings.interface';

/// Reads the user-configured push sites from UserIntegrationSettings.settings,
/// falling back to ESTATEWEB_DEFAULT_PUSH_SITES when the user hasn't configured any yet.
export function resolveEstateWebPushSites(
  settings: unknown,
): EstateWebPushSiteSetting[] {
  const configured = (settings as EstateWebIntegrationSettings | null | undefined)
    ?.estateweb_default_sites;
  const pushSites = Array.isArray(configured)
    ? configured
    : ESTATEWEB_DEFAULT_PUSH_SITES;

  return pushSites.filter((site) => site.selected);
}
