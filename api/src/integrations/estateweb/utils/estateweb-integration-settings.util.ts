import { ListingType, Prisma } from 'generated/prisma';
import { UserIntegrationSettingsData } from '@/modules/user-integrations/interfaces/user-integration-settings.interface';
import { ESTATEWEB_DEFAULT_PUSH_SITES } from '../constants/estateweb-agent-catalog.constants';
import {
  ESTATEWEB_INIT_LANGUAGES,
  EstateWebLanguageId,
} from '../constants/estateweb-enums.constants';
import { EstateWebPushSiteSetting } from '../interfaces/estateweb-integration-settings.interface';

export const ESTATEWEB_DEFAULT_AD_LANGUAGES: EstateWebLanguageId[] = [1];

export const ESTATEWEB_DEFAULT_LISTING_TYPES: ListingType[] = [
  ListingType.SALE,
  ListingType.RENT,
];

const VALID_LANGUAGE_IDS = new Set<EstateWebLanguageId>(
  ESTATEWEB_INIT_LANGUAGES.map((lang) => lang.id),
);

const VALID_LISTING_TYPES = new Set<ListingType>(
  Object.values(ListingType),
);

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
  return Array.isArray(configured) ? configured : ESTATEWEB_DEFAULT_PUSH_SITES;
}

export function resolveEstateWebSelectedPushSites(
  settings: Prisma.JsonValue | null | undefined,
): EstateWebPushSiteSetting[] {
  return resolveEstateWebPushSites(settings).filter((site) => site.selected);
}

export function resolveEstateWebAdLanguages(
  settings: Prisma.JsonValue | null | undefined,
): EstateWebLanguageId[] {
  const configured =
    parseUserIntegrationSettingsData(settings)?.estateweb_ad_languages;
  if (!Array.isArray(configured)) {
    return ESTATEWEB_DEFAULT_AD_LANGUAGES;
  }

  const selected = [
    ...new Set(
      configured.filter(
        (id): id is EstateWebLanguageId =>
          typeof id === 'number' &&
          VALID_LANGUAGE_IDS.has(id as EstateWebLanguageId),
      ),
    ),
  ];

  return selected.length > 0 ? selected : ESTATEWEB_DEFAULT_AD_LANGUAGES;
}

export function resolveEstateWebListingTypes(
  settings: Prisma.JsonValue | null | undefined,
): ListingType[] | null {
  const configured =
    parseUserIntegrationSettingsData(settings)?.estateweb_listing_types;
  if (!Array.isArray(configured)) {
    return null;
  }

  const selected = [
    ...new Set(
      configured.filter(
        (type): type is ListingType =>
          typeof type === 'string' &&
          VALID_LISTING_TYPES.has(type as ListingType),
      ),
    ),
  ];

  return selected.length > 0 ? selected : null;
}

export function isEstateWebListingTypeAllowed(
  settings: Prisma.JsonValue | null | undefined,
  listingType: ListingType,
): boolean {
  const allowed = resolveEstateWebListingTypes(settings);
  if (allowed === null) {
    return true;
  }
  return allowed.includes(listingType);
}
