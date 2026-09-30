import type {
  IntegrationProperty,
  IntegrationPropertyImage,
} from "../interfaces/integration-property.interfaces";

export type PropertyDisplayImage = {
  key: string;
  crmImageId: number | null;
  propertyImageIndex: number | null;
  url: string;
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
};

function resolveIntegrationImageDisplayUrl(
  image: IntegrationPropertyImage,
): string | null {
  if (typeof image.source_image === "string" && image.source_image.length > 0) {
    return image.source_image;
  }
  if (typeof image.url === "string" && image.url.length > 0) {
    return image.url;
  }
  if (
    typeof image.path === "string" &&
    image.path.length > 0 &&
    typeof image.filename === "string" &&
    image.filename.length > 0
  ) {
    return `https://images.estateweb.gr/${image.path}/${image.filename}`;
  }
  return null;
}

// Mirrors the backend's EstateWebCmsSyncAdapter.normalizeSourceImageIdentity(): the same
// scraped photo is often re-served at a different size or with a different cache-busting
// query string across crawls, so comparing raw URLs treats it as a different photo and
// makes an already-synced image look unsynced. Strips the query string and a trailing
// "_WIDTHxHEIGHT" resize suffix before comparing.
function normalizeSourceImageIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(
      /[_-]\d{2,5}x\d{2,5}(?=\.[a-zA-Z0-9]+$)/i,
      "",
    );
    return `${parsed.host}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function resolvePropertyImageIndex(
  image: IntegrationPropertyImage,
  index: number,
  propertyImages: string[],
  propertyImageIdentities: string[],
): number | null {
  if (
    typeof image.source_image === "string" &&
    image.source_image.length > 0
  ) {
    const identity = normalizeSourceImageIdentity(image.source_image);
    const matched = propertyImageIdentities.indexOf(identity);
    if (matched >= 0) return matched;
  }
  if (index >= 0 && index < propertyImages.length) return index;
  return null;
}

export function getIntegrationPropertyDisplayImages(
  integrationProperty: IntegrationProperty | null | undefined,
  propertyImages: string[] = [],
): PropertyDisplayImage[] {
  if (!integrationProperty?.images?.length) return [];

  const propertyImageIdentities = propertyImages.map(
    normalizeSourceImageIdentity,
  );
  const items: PropertyDisplayImage[] = [];
  for (let index = 0; index < integrationProperty.images.length; index++) {
    const image = integrationProperty.images[index];
    const url = resolveIntegrationImageDisplayUrl(image);
    if (!url) continue;
    items.push({
      key: `${image.id}-${index}`,
      crmImageId: typeof image.id === "number" ? image.id : null,
      propertyImageIndex: resolvePropertyImageIndex(
        image,
        index,
        propertyImages,
        propertyImageIdentities,
      ),
      url,
      show_on_site: Boolean(image.show_on_site),
      show_on_groups: Boolean(image.show_on_groups),
      show_on_foreign_agents: Boolean(image.show_on_foreign_agents),
    });
  }

  return items;
}

export function resolvePropertyDisplayImages(params: {
  integrationProperty?: IntegrationProperty | null;
  fallbackImages?: string[] | null;
}): PropertyDisplayImage[] {
  const propertyImages = (params.fallbackImages ?? []).filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  const integrationItems = getIntegrationPropertyDisplayImages(
    params.integrationProperty,
    propertyImages,
  );
  if (!propertyImages.length) {
    return integrationItems;
  }
  if (!integrationItems.length) {
    return propertyImages.map((url, index) => ({
      key: `fallback-${index}`,
      crmImageId: null,
      propertyImageIndex: index,
      url,
      show_on_site: false,
      show_on_groups: false,
      show_on_foreign_agents: false,
    }));
  }

  // Keep every synced CRM image (with its real crmImageId, so delete/reorder/watermark
  // stay available) and append any scraped photos the CRM hasn't received yet, so they
  // can still be picked for "Upload to CRM".
  const matchedIndexes = new Set(
    integrationItems
      .map((item) => item.propertyImageIndex)
      .filter((index): index is number => index != null),
  );
  const unsyncedItems = propertyImages
    .map((url, index) => ({ url, index }))
    .filter(({ index }) => !matchedIndexes.has(index))
    .map(({ url, index }) => ({
      key: `fallback-${index}`,
      crmImageId: null,
      propertyImageIndex: index,
      url,
      show_on_site: false,
      show_on_groups: false,
      show_on_foreign_agents: false,
    }));

  return [...integrationItems, ...unsyncedItems];
}
