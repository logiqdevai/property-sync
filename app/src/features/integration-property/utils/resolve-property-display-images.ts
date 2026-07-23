import type {
  IntegrationProperty,
  IntegrationPropertyImage,
} from "../interfaces/integration-property.interfaces";

function resolveIntegrationImageDisplayUrl(
  image: IntegrationPropertyImage,
): string | null {
  if (typeof image.source_image === "string" && image.source_image.length > 0) {
    return image.source_image;
  }
  return null;
}

export function getIntegrationPropertyImageUrls(
  integrationProperty: IntegrationProperty | null | undefined,
): string[] {
  if (!integrationProperty?.images?.length) return [];

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const image of integrationProperty.images) {
    const url = resolveIntegrationImageDisplayUrl(image);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

export function resolvePropertyDisplayImages(params: {
  integrationProperty?: IntegrationProperty | null;
  fallbackImages?: string[] | null;
}): string[] {
  const integrationUrls = getIntegrationPropertyImageUrls(
    params.integrationProperty,
  );
  if (integrationUrls.length > 0) return integrationUrls;
  if (!params.fallbackImages?.length) return [];
  return params.fallbackImages.filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
}
