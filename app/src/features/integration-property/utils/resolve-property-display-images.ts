import type {
  IntegrationProperty,
  IntegrationPropertyImage,
} from "../interfaces/integration-property.interfaces";

export type PropertyDisplayImage = {
  key: string;
  crmImageId: number | null;
  url: string;
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

export function getIntegrationPropertyDisplayImages(
  integrationProperty: IntegrationProperty | null | undefined,
): PropertyDisplayImage[] {
  if (!integrationProperty?.images?.length) return [];

  const items: PropertyDisplayImage[] = [];
  for (let index = 0; index < integrationProperty.images.length; index++) {
    const image = integrationProperty.images[index];
    const url = resolveIntegrationImageDisplayUrl(image);
    if (!url) continue;
    items.push({
      key: `${image.id}-${index}`,
      crmImageId: typeof image.id === "number" ? image.id : null,
      url,
    });
  }

  return items;
}

export function resolvePropertyDisplayImages(params: {
  integrationProperty?: IntegrationProperty | null;
  fallbackImages?: string[] | null;
}): PropertyDisplayImage[] {
  const integrationItems = getIntegrationPropertyDisplayImages(
    params.integrationProperty,
  );
  if (integrationItems.length > 0) return integrationItems;
  if (!params.fallbackImages?.length) return [];
  return params.fallbackImages
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((url, index) => ({
      key: `fallback-${index}`,
      crmImageId: null,
      url,
    }));
}
