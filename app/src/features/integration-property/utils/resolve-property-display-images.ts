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

function resolvePropertyImageIndex(
  image: IntegrationPropertyImage,
  index: number,
  propertyImages: string[],
): number | null {
  if (
    typeof image.source_image === "string" &&
    image.source_image.length > 0
  ) {
    const matched = propertyImages.indexOf(image.source_image);
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
  if (
    integrationItems.length > 0 &&
    !(propertyImages.length > integrationItems.length)
  ) {
    return integrationItems;
  }
  if (!propertyImages.length) {
    return integrationItems;
  }
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
