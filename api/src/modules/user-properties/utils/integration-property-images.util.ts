import { IntegrationType } from 'generated/prisma';
import {
  EstateWebIntegrationPropertyImage,
  IntegrationPropertyImage,
  IntegrationPropertyImageBase,
} from '../interfaces/integration-property-image.interface';

function parseEstateWebImages(
  imagesJson: unknown,
): EstateWebIntegrationPropertyImage[] {
  if (!Array.isArray(imagesJson)) return [];

  const images: EstateWebIntegrationPropertyImage[] = [];
  for (const item of imagesJson) {
    if (
      item == null ||
      typeof item !== 'object' ||
      typeof (item as { id?: unknown }).id !== 'number' ||
      typeof (item as { path?: unknown }).path !== 'string' ||
      typeof (item as { filename?: unknown }).filename !== 'string'
    ) {
      continue;
    }

    const image = item as EstateWebIntegrationPropertyImage;
    images.push({
      id: image.id,
      path: image.path,
      filename: image.filename,
      show_on_site: Boolean(image.show_on_site),
      show_on_groups: Boolean(image.show_on_groups),
      show_on_foreign_agents: Boolean(image.show_on_foreign_agents),
      url: typeof image.url === 'string' ? image.url : undefined,
      source_image:
        typeof image.source_image === 'string' && image.source_image.length > 0
          ? image.source_image
          : undefined,
    });
  }

  return images;
}

export function parseIntegrationPropertyImages(
  imagesJson: unknown,
  integrationType: IntegrationType,
): IntegrationPropertyImage[] {
  switch (integrationType) {
    case IntegrationType.ESTATEWEB:
      return parseEstateWebImages(imagesJson);
    default:
      return [];
  }
}

export function resolveIntegrationImageProcessUrl(
  image: Pick<IntegrationPropertyImageBase, 'source_image' | 'url'>,
): string | undefined {
  if (
    typeof image.source_image === 'string' &&
    image.source_image.length > 0
  ) {
    return image.source_image;
  }
  if (typeof image.url === 'string' && image.url.length > 0) {
    return image.url;
  }
  return undefined;
}

export function patchIntegrationPropertyImageSource(
  imagesJson: unknown,
  integrationType: IntegrationType,
  imageId: number,
  sourceImage: string,
): IntegrationPropertyImage[] | null {
  const images = parseIntegrationPropertyImages(imagesJson, integrationType);
  const index = images.findIndex((item) => item.id === imageId);
  if (index < 0) return null;

  images[index] = {
    ...images[index],
    source_image: sourceImage,
  };

  return images;
}
