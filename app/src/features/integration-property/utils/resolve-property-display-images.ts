import type {
  IntegrationProperty,
  IntegrationPropertyImage,
} from "../interfaces/integration-property.interfaces";

const ESTATEWEB_IMAGE_SERVER = "https://images.estateweb.gr/";

function buildEstateWebImageUrl(image: IntegrationPropertyImage): string | null {
  if (typeof image.url === "string" && image.url.length > 0) {
    return image.url;
  }
  if (typeof image.path !== "string" || typeof image.filename !== "string") {
    return null;
  }

  const filename = image.filename.replace(/^\/+/, "");
  const rawPath = image.path.replace(/^\/+/, "").replace(/\/+$/, "");

  if (rawPath.includes("/")) {
    if (rawPath.endsWith(filename)) {
      return `${ESTATEWEB_IMAGE_SERVER}${rawPath}`;
    }
    return `${ESTATEWEB_IMAGE_SERVER}${rawPath}/${filename}`;
  }

  if (!rawPath) {
    return `${ESTATEWEB_IMAGE_SERVER}${filename}`;
  }

  return `${ESTATEWEB_IMAGE_SERVER}${rawPath}/${filename}`;
}

function resolveIntegrationImageDisplayUrl(
  image: IntegrationPropertyImage,
): string | null {
  if (typeof image.source_image === "string" && image.source_image.length > 0) {
    return image.source_image;
  }
  return buildEstateWebImageUrl(image);
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
