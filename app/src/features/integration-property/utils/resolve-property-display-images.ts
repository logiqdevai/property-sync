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

// Mirrors the backend's GcsFolders.propertyImages check (isPropertyImagesGcsUrl in
// watermark-removal.service.ts): identifies a URL as one of our own already-processed
// (e.g. watermark-removed) uploads, as opposed to a source-site URL.
const PROCESSED_IMAGE_MARKER = "/property-images/";

function isProcessedImageUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes(PROCESSED_IMAGE_MARKER);
}

// `image.source_image` is a cache of what the CRM was told at push time -- it goes stale
// the moment a local-only reprocess (e.g. the automatic watermark pipeline) replaces that
// same position in UserProperty.images without having reached the CRM yet (see
// docs/CLIENT-ISSUES-2026-10-01.md issue #1: the pipeline never used to flag that push).
// Until that push happens, showing the CRM's stale cache here silently hides a real,
// already-paid-for change. Prefer the fresher local copy whenever the CRM's own cached
// value isn't itself already a processed one -- never overrides a CRM value that's
// already current.
function resolveIntegrationImageDisplayUrl(
  image: IntegrationPropertyImage,
  localOverrideUrl?: string | null,
): string | null {
  if (
    isProcessedImageUrl(localOverrideUrl) &&
    !isProcessedImageUrl(image.source_image)
  ) {
    return localOverrideUrl as string;
  }
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
// The watermark pipeline names processed files "...-src-<hash>.jpg", where the hash is the
// source identity of the original it was cut from.
const SOURCE_HASH_IN_FILENAME = /-src-([0-9a-f]{16})\.[a-zA-Z0-9]+$/;

export function extractSourceIdentityHash(url: string): string | null {
  return url.match(SOURCE_HASH_IN_FILENAME)?.[1] ?? null;
}

export function normalizeSourceImageIdentity(url: string): string {
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
    const propertyImageIndex = resolvePropertyImageIndex(
      image,
      index,
      propertyImages,
      propertyImageIdentities,
    );
    const localOverrideUrl =
      propertyImageIndex != null ? propertyImages[propertyImageIndex] : null;
    const url = resolveIntegrationImageDisplayUrl(image, localOverrideUrl);
    if (!url) continue;
    items.push({
      key: `${image.id}-${index}`,
      crmImageId: typeof image.id === "number" ? image.id : null,
      propertyImageIndex,
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
  // can still be picked for "Upload to CRM". Never resurrect a photo the user explicitly
  // deleted from the CRM (tracked server-side in excluded_source_images) -- otherwise a
  // deleted image just reappears as a broken, unmanageable tile.
  const excludedIdentities = new Set(
    (params.integrationProperty?.excluded_source_images ?? [])
      .filter(
        (url): url is string => typeof url === "string" && url.length > 0,
      )
      .map(normalizeSourceImageIdentity),
  );
  const matchedIndexes = new Set(
    integrationItems
      .map((item) => item.propertyImageIndex)
      .filter((index): index is number => index != null),
  );
  const unsyncedItems = propertyImages
    .map((url, index) => ({ url, index }))
    .filter(
      ({ index, url }) =>
        !matchedIndexes.has(index) &&
        !excludedIdentities.has(normalizeSourceImageIdentity(url)),
    )
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
