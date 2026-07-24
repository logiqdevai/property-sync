import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma, UserProperty } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  CmsPushCreateResult,
  CmsSyncAdapter,
  CmsSyncCreateImagesParams,
  CmsSyncDeleteImagesParams,
  CmsSyncUpdateImagesParams,
} from '@/modules/cms-sync/interfaces/cms-sync-adapter.interface';
import { CmsPropertyFieldEntry } from '@/modules/properties/interfaces/cms-property.interface';
import { coerceCmsFieldValueForEstateWeb } from '@/modules/properties/utils/property-cms-field-mapper.util';
import {
  EstateWebPropertyAd,
  EstateWebPropertyFieldValue,
  EstateWebPropertyImage,
  EstateWebPropertyPayload,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '../interfaces/estateweb-property.interface';
import { EstateWebPushSiteSetting } from '../interfaces/estateweb-integration-settings.interface';
import {
  ESTATEWEB_INIT_LANGUAGES,
  EstateWebLanguageId,
  EstateWebScope,
} from '../constants/estateweb-enums.constants';
import { resolveEstateWebLocationId } from '../utils/estateweb-location-lookup.util';
import { resolveEstateWebScopeId } from '../utils/estateweb-catalog.util';
import { getEstateWebInitFieldsForType } from '../utils/estateweb-init-lookup.util';
import { buildEstateWebImageUrl } from '../utils/estateweb-image-url.util';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebIntegrationResolverService } from './estateweb-integration-resolver.service';
import { EstateWebPropertyService } from './estateweb-property.service';

interface ImageEntry {
  url: string;
  filename: string;
}

const EMPTY_METADATA = {
  guarantee: '',
  stamp: '',
  inc_type: 0,
  inc_value: '',
  inc_period: 0,
  inc_2years: 0,
  contract_period: '',
  terms: '',
  has_keys: '',
  rental_history: [] as unknown[],
};

@Injectable()
export class EstateWebCmsSyncAdapter implements CmsSyncAdapter {
  private readonly logger = new Logger(EstateWebCmsSyncAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebIntegrationResolverService: EstateWebIntegrationResolverService,
  ) {}

  async pushCreate(
    userIntegrationId: string,
    userProperty: UserProperty,
  ): Promise<CmsPushCreateResult> {
    this.assertRequiredFields(userProperty);

    const [pushSites, adLanguages] = await Promise.all([
      this.estateWebIntegrationResolverService.resolvePushSites(
        userIntegrationId,
      ),
      this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      ),
    ]);
    const payload = this.buildPayload(pushSites, adLanguages, userProperty);
    this.logger.log(
      `EstateWeb CREATE payload: type_id=${payload.type_id} location_id=${payload.location_id} scope_id=${payload.scope_id} fields=${payload.fields?.length ?? 0} price=${payload.price ?? 'null'} sites=${payload.sites.map((s) => `${s.agent_site_id}:${s.selected ? 1 : 0}`).join(',')} langs=${adLanguages.join(',')}`,
    );

    const result = await this.estateWebPropertyService.createProperty(
      userIntegrationId,
      payload,
    );

    await this.uploadImages(userIntegrationId, result.id, userProperty);

    return { integration_property_id: String(result.id) };
  }

  async pushUpdate(
    userIntegrationId: string,
    integrationPropertyId: string,
    userProperty: UserProperty,
  ): Promise<void> {
    this.assertRequiredFields(userProperty);

    const [pushSites, adLanguages] = await Promise.all([
      this.estateWebIntegrationResolverService.resolvePushSites(
        userIntegrationId,
      ),
      this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      ),
    ]);
    const payload = this.buildPayload(
      pushSites,
      adLanguages,
      userProperty,
      Number(integrationPropertyId),
    ) as EstateWebUpdatePropertyPayload;
    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );
  }

  async pushRemove(
    userIntegrationId: string,
    integrationPropertyId: string,
    userProperty: UserProperty,
  ): Promise<void> {
    this.assertRequiredFields(userProperty);

    const [pushSites, adLanguages] = await Promise.all([
      this.estateWebIntegrationResolverService.resolvePushSites(
        userIntegrationId,
      ),
      this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      ),
    ]);
    const payload = this.buildPayload(
      pushSites.map((site) => ({ ...site, selected: false })),
      adLanguages,
      userProperty,
      Number(integrationPropertyId),
    ) as EstateWebUpdatePropertyPayload;

    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );
  }

  async deleteImages(params: CmsSyncDeleteImagesParams): Promise<void> {
    const uniqueIds = [
      ...new Set(
        params.imageIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
    if (uniqueIds.length === 0) {
      throw new EstateWebException(
        'No valid CMS image ids provided',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }

    for (const imageId of uniqueIds) {
      await this.estateWebPropertyService.deletePropertyImage(
        params.userIntegrationId,
        imageId,
      );
    }

    await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.crmPropertyId,
    });
  }

  async updateImages(params: CmsSyncUpdateImagesParams): Promise<void> {
    const uniqueIds = [
      ...new Set(
        params.imageIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
    if (uniqueIds.length === 0) {
      throw new EstateWebException(
        'No valid CMS image ids provided',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = {
      show_on_site: params.show_on_site ? 1 : 0,
      show_on_groups: params.show_on_groups ? 1 : 0,
      show_on_foreign_agents: params.show_on_foreign_agents ? 1 : 0,
    } as const;

    for (const imageId of uniqueIds) {
      await this.estateWebPropertyService.updatePropertyImage(
        params.userIntegrationId,
        imageId,
        payload,
      );
    }

    await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.crmPropertyId,
    });
  }

  async createImages(params: CmsSyncCreateImagesParams): Promise<void> {
    const sourceImageUrls = [
      ...new Set(
        params.sourceImageUrls.filter(
          (url): url is string => typeof url === 'string' && url.length > 0,
        ),
      ),
    ];
    if (sourceImageUrls.length === 0) {
      throw new EstateWebException(
        'No source image urls provided',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }

    const propertyId = Number(params.crmPropertyId);
    const sourceByFilename = new Map<string, string>();
    let uploadedCount = 0;

    for (let index = 0; index < sourceImageUrls.length; index++) {
      const url = sourceImageUrls[index];
      try {
        const buffer = await this.downloadImage(url);
        if (!buffer?.length) continue;

        const filename = this.buildUniqueImageFilename(url, propertyId, index);
        const payload: EstateWebUploadImagePayload = {
          filename,
          show_on_site: 1,
          show_on_groups: 1,
          show_on_foreign_agents: 0,
          zindex: index + 1,
        };

        await this.estateWebPropertyService.uploadPropertyImage(
          params.userIntegrationId,
          propertyId,
          buffer,
          payload,
          'image/jpeg',
        );
        sourceByFilename.set(filename, url);
        uploadedCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to upload source image for CMS property=${params.crmPropertyId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (uploadedCount === 0) {
      throw new EstateWebException(
        'Failed to upload any source images to CMS',
        NotificationType.ESTATEWEB_EMPTY_IMAGE,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.crmPropertyId,
      sourceByFilename,
      sourceImageUrls,
    });
  }

  async replaceImageAfterWatermark(params: {
    userIntegrationId: string;
    userPropertyId: string;
    crmPropertyId: number | string;
    oldImageId: number;
    processedBuffer: Buffer;
    gcsUrl: string;
    oldImage: EstateWebPropertyImage;
    zindex: number;
    deleteOldImage?: boolean;
  }): Promise<void> {
    const propertyId = Number(params.crmPropertyId);
    const filename = this.buildUniqueImageFilename(
      params.gcsUrl,
      propertyId,
      params.zindex,
    );
    const payload: EstateWebUploadImagePayload = {
      filename,
      show_on_site: params.oldImage.show_on_site ? 1 : 0,
      show_on_groups: params.oldImage.show_on_groups ? 1 : 0,
      show_on_foreign_agents: params.oldImage.show_on_foreign_agents ? 1 : 0,
      zindex: params.zindex,
    };

    await this.estateWebPropertyService.uploadPropertyImage(
      params.userIntegrationId,
      propertyId,
      params.processedBuffer,
      payload,
      'image/jpeg',
    );

    const sourceByFilename = new Map<string, string>([
      [filename, params.gcsUrl],
    ]);

    await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.crmPropertyId,
      sourceByFilename,
    });

    if (!params.deleteOldImage) {
      return;
    }

    await this.estateWebPropertyService.deletePropertyImage(
      params.userIntegrationId,
      params.oldImageId,
    );

    await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.crmPropertyId,
    });
  }

  private buildPayload(
    pushSites: EstateWebPushSiteSetting[],
    adLanguages: EstateWebLanguageId[],
    userProperty?: UserProperty,
    integrationPropertyId?: number,
  ): EstateWebPropertyPayload {
    const price = userProperty?.price ? Number(userProperty.price) : 0;
    const priceStart = userProperty?.price_start
      ? Number(userProperty.price_start)
      : price;
    const priceWeb = userProperty?.price_web
      ? Number(userProperty.price_web)
      : price;
    const title = userProperty?.title ?? '';
    const description = userProperty?.description ?? '';

    return {
      id: integrationPropertyId ?? 0,
      type_id: userProperty?.estateweb_type_id ?? 0,
      location_id: this.resolveLocationId(userProperty) ?? 0,
      scope_id: this.resolveScopeId(userProperty),
      client_id: 0,
      coop_id: 0,
      to_client_id: 0,
      code: userProperty?.internal_id ?? userProperty?.property_id ?? '',
      address: '',
      zip: userProperty?.postal_code ?? '',
      price_start: priceStart,
      price,
      price_final: 0,
      price_web: priceWeb,
      sqm: userProperty?.square_meters
        ? Number(userProperty.square_meters)
        : 0,
      distance_airport: userProperty?.distance_airport ?? '',
      distance_port: userProperty?.distance_port ?? '',
      distance_beach: userProperty?.distance_beach ?? '',
      description,
      status_id: 0,
      is_offer: 0,
      is_exclusive_order: 0,
      video_url: userProperty?.video_url ?? '',
      show_video_on_site: 0,
      lat_lng: this.buildLatLng(userProperty),
      show_map_on_site: 0,
      metadata: this.buildMetadata(userProperty),
      client_contacted_at: '',
      expires_at: '',
      fields: this.buildFields(
        userProperty?.cms_fields,
        userProperty?.estateweb_type_id,
      ),
      sites: pushSites.map((site) => ({
        selected: site.selected,
        name: site.name,
        agent_site_id: site.agent_site_id,
        show_on_slider: site.show_on_slider,
        show_on_first_page: site.show_on_first_page,
        show_on_relative_pages: site.show_on_relative_pages,
      })),
      gateways: [],
      ads: this.buildAds(title, description, adLanguages),
      foreign_agents: [],
      history: [],
      notes: [],
      price_negotiable: 0,
      note: '',
    };
  }

  private buildAds(
    title: string,
    description: string,
    adLanguages: EstateWebLanguageId[],
  ): EstateWebPropertyAd[] {
    const selected = new Set(adLanguages);
    return ESTATEWEB_INIT_LANGUAGES.map((lang) =>
      selected.has(lang.id)
        ? {
            lang_id: lang.id,
            title,
            description,
            text: description,
          }
        : {
            lang_id: lang.id,
            title: '',
            description: '',
            text: '',
          },
    );
  }

  private buildMetadata(userProperty?: UserProperty): string {
    const raw = userProperty?.cms_metadata;
    const fromProperty =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};

    return JSON.stringify({
      ...EMPTY_METADATA,
      ...fromProperty,
      rental_history: Array.isArray(fromProperty.rental_history)
        ? fromProperty.rental_history
        : [],
    });
  }

  private resolveLocationId(userProperty?: UserProperty): number | null {
    if (userProperty?.estateweb_location_id) {
      return userProperty.estateweb_location_id;
    }
    return resolveEstateWebLocationId(
      userProperty?.city,
      userProperty?.district,
    );
  }

  private resolveScopeId(userProperty?: UserProperty): EstateWebScope {
    const scopeId = resolveEstateWebScopeId(
      userProperty?.listing_type,
      userProperty?.estateweb_scope_id,
    );
    if (scopeId === EstateWebScope.RENT) return EstateWebScope.RENT;
    return EstateWebScope.SALE;
  }

  private buildLatLng(userProperty?: UserProperty): string {
    if (!userProperty?.latitude || !userProperty?.longitude) return '';
    return `${userProperty.latitude},${userProperty.longitude}`;
  }

  private buildFields(
    cmsFields: unknown,
    propertyTypeId?: number | null,
  ): EstateWebPropertyFieldValue[] {
    if (!Array.isArray(cmsFields)) return [];
    const entries = cmsFields as CmsPropertyFieldEntry[];
    const allowedIds =
      propertyTypeId != null
        ? new Set(
            getEstateWebInitFieldsForType(propertyTypeId).map(
              (field) => field.id,
            ),
          )
        : null;
    const fields: EstateWebPropertyFieldValue[] = [];

    for (const entry of entries) {
      if (entry?.id == null || entry.value == null || entry.value === '') {
        continue;
      }
      if (allowedIds && !allowedIds.has(entry.id)) {
        continue;
      }
      const value = coerceCmsFieldValueForEstateWeb(entry.id, entry.value);
      if (value == null) continue;
      fields.push({ id: entry.id, value } as EstateWebPropertyFieldValue);
    }

    return fields;
  }

  private async uploadImages(
    userIntegrationId: string,
    propertyId: number,
    userProperty: UserProperty,
  ): Promise<void> {
    const images = this.parseImages(userProperty.images, propertyId);
    if (images.length === 0) return;

    const sourceByFilename = new Map<string, string>();
    let uploadedCount = 0;
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      try {
        const buffer = await this.downloadImage(image.url);
        if (!buffer?.length) continue;

        const payload: EstateWebUploadImagePayload = {
          filename: image.filename,
          show_on_site: 1,
          show_on_groups: 1,
          show_on_foreign_agents: 0,
          zindex: index + 1,
        };

        await this.estateWebPropertyService.uploadPropertyImage(
          userIntegrationId,
          propertyId,
          buffer,
          payload,
          'image/jpeg',
        );
        sourceByFilename.set(image.filename, image.url);
        uploadedCount += 1;
      } catch {
      }
    }

    if (uploadedCount === 0) return;

    try {
      await this.syncIntegrationPropertyImages({
        userIntegrationId,
        userPropertyId: userProperty.id,
        estateWebPropertyId: propertyId,
        sourceByFilename,
        sourceImageUrls: images.map((image) => image.url),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist IntegrationProperty images for user_property=${userProperty.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async syncIntegrationPropertyImages(params: {
    userIntegrationId: string;
    userPropertyId: string;
    estateWebPropertyId: number | string;
    sourceByFilename?: Map<string, string>;
    sourceImageUrls?: string[];
  }): Promise<EstateWebPropertyImage[]> {
    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: params.userIntegrationId },
      select: {
        user_id: true,
        user_integration_settings_id: true,
      },
    });
    if (!integration) {
      throw new EstateWebException(
        'EstateWeb integration connection not found',
        NotificationType.ESTATEWEB_INTEGRATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        { userIntegrationId: params.userIntegrationId },
      );
    }

    const existing = await this.prisma.integrationProperty.findUnique({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: params.userPropertyId,
        },
      },
      select: { images: true },
    });

    const remote = await this.estateWebPropertyService.getProperty(
      params.userIntegrationId,
      params.estateWebPropertyId,
    );
    const images = this.normalizeEstateWebImages(
      remote.images,
      remote.agent_id,
      {
        sourceByFilename: params.sourceByFilename,
        sourceImageUrls: params.sourceImageUrls,
        existingImages: existing?.images,
      },
    );

    await this.prisma.integrationProperty.upsert({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: params.userPropertyId,
        },
      },
      create: {
        user_id: integration.user_id,
        user_integration_settings_id: integration.user_integration_settings_id,
        user_property_id: params.userPropertyId,
        images: images as unknown as Prisma.InputJsonValue,
      },
      update: {
        images: images as unknown as Prisma.InputJsonValue,
      },
    });

    return images;
  }

  async syncOrRepairIntegrationPropertyImages(params: {
    userIntegrationId: string;
    userPropertyId: string;
    estateWebPropertyId: number | string;
    sourceImages?: unknown;
  }): Promise<EstateWebPropertyImage[]> {
    const sourceImageUrls = this.parseSourceImageUrls(params.sourceImages);
    return this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.estateWebPropertyId,
      sourceImageUrls,
    });
  }

  private normalizeEstateWebImages(
    images: EstateWebPropertyImage[] | undefined,
    agentId?: number | null,
    options?: {
      sourceByFilename?: Map<string, string>;
      sourceImageUrls?: string[];
      existingImages?: unknown;
    },
  ): EstateWebPropertyImage[] {
    if (!Array.isArray(images)) return [];

    const existingSourceById = this.buildExistingSourceImageById(
      options?.existingImages,
    );
    const normalized: EstateWebPropertyImage[] = [];
    let sourceIndex = 0;

    for (const image of images) {
      if (
        image == null ||
        typeof image.id !== 'number' ||
        typeof image.path !== 'string' ||
        typeof image.filename !== 'string'
      ) {
        continue;
      }

      const url = buildEstateWebImageUrl({
        path: image.path,
        filename: image.filename,
        agentId,
      });

      const sourceFromFilename = options?.sourceByFilename?.get(image.filename);
      const sourceFromIndex = options?.sourceImageUrls?.[sourceIndex];
      const sourceFromExisting = existingSourceById.get(image.id);
      const source_image =
        sourceFromFilename ||
        sourceFromIndex ||
        sourceFromExisting ||
        (typeof image.source_image === 'string' && image.source_image.length > 0
          ? image.source_image
          : undefined);

      normalized.push({
        id: image.id,
        path: image.path,
        filename: image.filename,
        show_on_site: Boolean(image.show_on_site),
        show_on_groups: Boolean(image.show_on_groups),
        show_on_foreign_agents: Boolean(image.show_on_foreign_agents),
        url,
        ...(source_image ? { source_image } : {}),
      });
      sourceIndex += 1;
    }

    return normalized;
  }

  private buildExistingSourceImageById(
    imagesJson: unknown,
  ): Map<number, string> {
    const map = new Map<number, string>();
    if (!Array.isArray(imagesJson)) return map;

    for (const item of imagesJson) {
      if (
        item == null ||
        typeof item !== 'object' ||
        typeof (item as { id?: unknown }).id !== 'number' ||
        typeof (item as { source_image?: unknown }).source_image !== 'string'
      ) {
        continue;
      }
      const sourceImage = (item as { source_image: string }).source_image;
      if (sourceImage.length === 0) continue;
      map.set((item as { id: number }).id, sourceImage);
    }

    return map;
  }

  private parseSourceImageUrls(imagesJson: unknown): string[] {
    if (!Array.isArray(imagesJson)) return [];
    return imagesJson.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
  }

  private parseImages(imagesJson: unknown, propertyId: number): ImageEntry[] {
    if (!Array.isArray(imagesJson)) return [];
    return imagesJson
      .filter((item): item is string => typeof item === 'string')
      .map((url, index) => ({
        url,
        filename: this.buildUniqueImageFilename(url, propertyId, index),
      }));
  }

  private buildUniqueImageFilename(
    url: string,
    propertyId: number,
    index: number,
  ): string {
    let ext = '.jpg';
    try {
      const name = new URL(url).pathname.split('/').pop() ?? '';
      const match = name.match(/(\.[a-zA-Z0-9]+)$/);
      if (match?.[1]) {
        ext = match[1].toLowerCase();
      }
    } catch {
    }
    const stamp = `${Date.now()}${String(index).padStart(3, '0')}${Math.floor(Math.random() * 900 + 100)}`;
    return `${propertyId}-${stamp}${ext}`;
  }

  private async downloadImage(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  private assertRequiredFields(userProperty?: UserProperty): void {
    if (!userProperty?.estateweb_type_id) {
      throw new EstateWebException(
        'EstateWeb type id is required',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!this.resolveLocationId(userProperty)) {
      throw new EstateWebException(
        'EstateWeb location id is required',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
