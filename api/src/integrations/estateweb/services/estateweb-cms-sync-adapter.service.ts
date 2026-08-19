import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma, UserProperty } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  CmsPushCreateResult,
  CmsSyncAdapter,
  CmsSyncBackfillImagesParams,
  CmsSyncCreateImagesParams,
  CmsSyncDeleteImagesParams,
  CmsSyncPushOptions,
  CmsSyncUpdateImagesParams,
} from '@/modules/cms-sync/interfaces/cms-sync-adapter.interface';
import { CmsPropertyFieldEntry } from '@/modules/properties/interfaces/cms-property.interface';
import { coerceCmsFieldValueForEstateWeb } from '@/modules/properties/utils/property-cms-field-mapper.util';
import { sanitizeEstateWebDistance } from '@/modules/properties/utils/property-normalization.utils';
import {
  EstateWebPropertyAd,
  EstateWebPropertyFieldValue,
  EstateWebPropertyImage,
  EstateWebPropertyPayload,
  EstateWebPropertySite,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '../interfaces/estateweb-property.interface';
import { EstateWebPushSiteSetting } from '../interfaces/estateweb-integration-settings.interface';
import {
  ESTATEWEB_INIT_LANGUAGES,
  EstateWebLanguageId,
  EstateWebScope,
} from '../constants/estateweb-enums.constants';
import { resolveEstateWebLocationFromSources } from '../utils/estateweb-location-lookup.util';
import { resolveEstateWebScopeId } from '../utils/estateweb-catalog.util';
import { getEstateWebInitFieldsForType } from '../utils/estateweb-init-lookup.util';
import { buildEstateWebImageUrl } from '../utils/estateweb-image-url.util';
import { resolveEstateWebPushSitesForTracker } from '../utils/estateweb-integration-settings.util';
import {
  computeSalePriceStart,
  hasValidSalePriceStart,
  pickSalePercentage,
  resolveSaleBasePrice,
  resolveSalesPricingSettings,
  shouldApplySalesPriceStart,
} from '@/modules/user-integrations/utils/sales-pricing.util';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebIntegrationResolverService } from './estateweb-integration-resolver.service';
import { EstateWebPropertyService } from './estateweb-property.service';
import { ContentProductionService } from '@/modules/content-publishing/services/content-production.service';
import { ContentResolutionService } from '@/modules/content-publishing/services/content-resolution.service';
import { EstateWebAdLanguageMaps } from '@/modules/content-publishing/interfaces/content-publishing.interface';

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
    private readonly contentProductionService: ContentProductionService,
    private readonly contentResolutionService: ContentResolutionService,
  ) {}

  async pushCreate(
    userIntegrationId: string,
    userProperty: UserProperty,
    options?: CmsSyncPushOptions,
  ): Promise<CmsPushCreateResult> {
    this.assertRequiredFields(userProperty);

    const [pushSites, adLanguages, adMaps] = await Promise.all([
      this.resolvePushSitesForSync(
        userIntegrationId,
        userProperty.id,
        options?.watermarkManualSelection,
        options?.sitesOverride,
      ),
      this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      ),
      this.resolveContentAds(
        userProperty,
        userIntegrationId,
        options?.forceContentProduction === true,
      ),
    ]);
    await this.applySalesPriceStartIfNeeded(
      userIntegrationId,
      userProperty,
      options?.forceSalesPriceRecalc === true,
    );
    const payload = this.buildPayload(
      pushSites,
      adLanguages,
      userProperty,
      undefined,
      options?.sitesOverride !== undefined,
      adMaps,
    );
    this.logger.log(
      `EstateWeb CREATE payload: type_id=${payload.type_id} location_id=${payload.location_id} scope_id=${payload.scope_id} fields=${payload.fields?.length ?? 0} price=${payload.price ?? 'null'} lat_lng=${payload.lat_lng || 'none'} sites=${payload.sites.map((s) => `${s.agent_site_id}:${s.selected ? 1 : 0}`).join(',')} langs=${adMaps.languages.join(',')}`,
    );

    const result = await this.estateWebPropertyService.createProperty(
      userIntegrationId,
      payload,
    );

    const propertyNote = options?.propertyNote?.trim();
    if (propertyNote) {
      await this.estateWebPropertyService.createPropertyNote(
        userIntegrationId,
        result.id,
        { note: propertyNote },
      );
    }

    await this.persistIntegrationPropertySites({
      userIntegrationId,
      userPropertyId: userProperty.id,
      sites: payload.sites,
      ads: payload.ads ?? [],
    });

    await this.uploadImages(userIntegrationId, result.id, userProperty.id, userProperty.images);

    return { integration_property_id: String(result.id) };
  }

  async pushUpdate(
    userIntegrationId: string,
    integrationPropertyId: string,
    userProperty: UserProperty,
    options?: CmsSyncPushOptions,
  ): Promise<void> {
    this.assertRequiredFields(userProperty);

    const [pushSites, adLanguages, adMaps] = await Promise.all([
      this.resolvePushSitesForSync(
        userIntegrationId,
        userProperty.id,
        options?.watermarkManualSelection,
        options?.sitesOverride,
      ),
      this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      ),
      this.resolveContentAds(
        userProperty,
        userIntegrationId,
        options?.forceContentProduction === true,
      ),
    ]);
    await this.applySalesPriceStartIfNeeded(
      userIntegrationId,
      userProperty,
      options?.forceSalesPriceRecalc === true,
    );
    const payload = this.buildPayload(
      pushSites,
      adLanguages,
      userProperty,
      Number(integrationPropertyId),
      options?.sitesOverride !== undefined,
      adMaps,
    ) as EstateWebUpdatePropertyPayload;
    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );

    await this.persistIntegrationPropertySites({
      userIntegrationId,
      userPropertyId: userProperty.id,
      sites: payload.sites,
      ads: payload.ads ?? [],
    });

    await this.ensureImagesCached({
      userIntegrationId,
      crmPropertyId: integrationPropertyId,
      userPropertyId: userProperty.id,
      sourceImages: userProperty.images,
    });
  }

  async ensureImagesCached(
    params: CmsSyncBackfillImagesParams,
  ): Promise<void> {
    try {
      const propertyId = Number(params.crmPropertyId);
      if (!Number.isFinite(propertyId)) return;

      const remote = await this.estateWebPropertyService.getProperty(
        params.userIntegrationId,
        params.crmPropertyId,
      );
      const remoteHasImages =
        Array.isArray(remote.images) &&
        remote.images.some(
          (image) => image != null && typeof image.id === 'number',
        );

      if (!remoteHasImages) {
        const sourceImages =
          params.sourceImages ??
          (await this.loadUserPropertySourceImages(params.userPropertyId));
        if (this.parseImages(sourceImages, propertyId).length > 0) {
          await this.uploadImages(
            params.userIntegrationId,
            propertyId,
            params.userPropertyId,
            sourceImages,
          );
          return;
        }
      }

      const cachedImages = await this.loadCachedIntegrationPropertyImages(
        params.userIntegrationId,
        params.userPropertyId,
      );
      if (this.hasUsableCachedImageIds(cachedImages)) return;

      await this.syncIntegrationPropertyImages({
        userIntegrationId: params.userIntegrationId,
        userPropertyId: params.userPropertyId,
        estateWebPropertyId: params.crmPropertyId,
        sourceImageUrls: this.parseSourceImageUrls(params.sourceImages),
        preserveExistingSourceImages: false,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to ensure CMS images for user_property=${params.userPropertyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async loadUserPropertySourceImages(
    userPropertyId: string,
  ): Promise<unknown> {
    const row = await this.prisma.userProperty.findUnique({
      where: { id: userPropertyId },
      select: { images: true },
    });
    return row?.images ?? [];
  }

  private async loadCachedIntegrationPropertyImages(
    userIntegrationId: string,
    userPropertyId: string,
  ): Promise<unknown> {
    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      select: { user_id: true, user_integration_settings_id: true },
    });
    if (!integration) return null;

    const row = await this.prisma.integrationProperty.findUnique({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: userPropertyId,
        },
      },
      select: { images: true },
    });

    return row?.images ?? null;
  }

  private hasUsableCachedImageIds(images: unknown): boolean {
    if (!Array.isArray(images) || images.length === 0) return false;
    return images.some(
      (item) =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as { id?: unknown }).id === 'number',
    );
  }

  async pushRemove(
    userIntegrationId: string,
    integrationPropertyId: string,
    userProperty: UserProperty,
    _options?: CmsSyncPushOptions,
  ): Promise<void> {
    this.assertRequiredFields(userProperty);

    const adLanguages =
      await this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      );
    const payload = this.buildPayload(
      [],
      adLanguages,
      userProperty,
      Number(integrationPropertyId),
    ) as EstateWebUpdatePropertyPayload;

    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );

    await this.persistIntegrationPropertySites({
      userIntegrationId,
      userPropertyId: userProperty.id,
      sites: [],
      ads: [],
    });
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
    gcsUrl?: string;
    oldImage: EstateWebPropertyImage;
    zindex: number;
    deleteOldImage?: boolean;
    stepLogs?: Array<{
      step: string;
      status: 'started' | 'ok' | 'failed' | 'skipped';
      duration_ms?: number;
      detail?: string;
      error?: string;
    }>;
  }): Promise<void> {
    const propertyId = Number(params.crmPropertyId);
    const filename = this.buildUniqueImageFilename(
      params.gcsUrl || 'processed.jpg',
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

    const pushStep = (
      step: string,
      status: 'started' | 'ok' | 'failed' | 'skipped',
      detail?: string,
      error?: string,
      duration_ms?: number,
    ) => {
      const existing = params.stepLogs?.find(
        (item) => item.step === step && item.status === 'started',
      );
      if (existing && status !== 'started') {
        existing.status = status;
        existing.detail = detail ?? existing.detail;
        existing.error = error;
        existing.duration_ms = duration_ms;
      } else {
        params.stepLogs?.push({ step, status, detail, error, duration_ms });
      }
      const line = `[watermark-replace] ${step} ${status}${detail ? ` ${detail}` : ''}${error ? ` error=${error}` : ''}`;
      if (status === 'failed') {
        this.logger.error(line);
      } else {
        this.logger.log(line);
      }
    };

    const run = async <T>(
      step: string,
      fn: () => Promise<T>,
      detail?: string,
    ): Promise<T> => {
      const started = Date.now();
      pushStep(step, 'started', detail);
      try {
        const result = await fn();
        pushStep(step, 'ok', detail, undefined, Date.now() - started);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushStep(step, 'failed', detail, message, Date.now() - started);
        throw error;
      }
    };

    await run(
      'estateweb_upload_image',
      () =>
        this.estateWebPropertyService.uploadPropertyImage(
          params.userIntegrationId,
          propertyId,
          params.processedBuffer,
          payload,
          'image/jpeg',
        ),
      `property_id=${propertyId} filename=${filename} bytes=${params.processedBuffer.length} zindex=${params.zindex}`,
    );

    const sourceByFilename = params.gcsUrl
      ? new Map<string, string>([[filename, params.gcsUrl]])
      : undefined;

    await run(
      'estateweb_sync_after_upload',
      () =>
        this.syncIntegrationPropertyImages({
          userIntegrationId: params.userIntegrationId,
          userPropertyId: params.userPropertyId,
          estateWebPropertyId: params.crmPropertyId,
          sourceByFilename,
        }),
      `user_property_id=${params.userPropertyId} has_source_map=${Boolean(sourceByFilename)}`,
    );

    if (!params.deleteOldImage) {
      pushStep(
        'estateweb_delete_old_image',
        'skipped',
        `old_image_id=${params.oldImageId}`,
      );
      return;
    }

    await run(
      'estateweb_delete_old_image',
      () =>
        this.estateWebPropertyService.deletePropertyImage(
          params.userIntegrationId,
          params.oldImageId,
        ),
      `old_image_id=${params.oldImageId}`,
    );

    await run(
      'estateweb_sync_after_delete',
      () =>
        this.syncIntegrationPropertyImages({
          userIntegrationId: params.userIntegrationId,
          userPropertyId: params.userPropertyId,
          estateWebPropertyId: params.crmPropertyId,
        }),
      `user_property_id=${params.userPropertyId}`,
    );
  }

  private async resolvePushSitesForSync(
    userIntegrationId: string,
    userPropertyId: string,
    watermarkManualSelection?: boolean,
    sitesOverride?: CmsSyncPushOptions['sitesOverride'],
  ): Promise<EstateWebPushSiteSetting[]> {
    if (sitesOverride !== undefined) {
      return sitesOverride.map((site) => ({
        selected: true,
        name: site.name,
        agent_site_id: site.agent_site_id,
        show_on_slider: site.show_on_slider,
        show_on_first_page: site.show_on_first_page,
        show_on_relative_pages: site.show_on_relative_pages,
      }));
    }

    const storedSites = await this.loadStoredIntegrationPropertySites(
      userIntegrationId,
      userPropertyId,
    );
    if (storedSites !== null) {
      return storedSites;
    }

    if (watermarkManualSelection === undefined) {
      return this.estateWebIntegrationResolverService.resolvePushSites(
        userIntegrationId,
      );
    }

    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      include: { settings: true },
    });

    return resolveEstateWebPushSitesForTracker(
      integration?.settings?.settings,
      watermarkManualSelection,
    );
  }

  private parseStoredSites(value: unknown): EstateWebPushSiteSetting[] | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!Array.isArray(value)) {
      return null;
    }

    const sites: EstateWebPushSiteSetting[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const site = item as Partial<EstateWebPushSiteSetting>;
      const agentSiteId = Number(site.agent_site_id);
      if (!Number.isFinite(agentSiteId)) continue;
      sites.push({
        selected: site.selected !== false,
        name: typeof site.name === 'string' ? site.name : '',
        agent_site_id: agentSiteId,
        show_on_slider: site.show_on_slider === 1 ? 1 : 0,
        show_on_first_page: site.show_on_first_page === 1 ? 1 : 0,
        show_on_relative_pages: site.show_on_relative_pages === 1 ? 1 : 0,
      });
    }
    return sites;
  }

  private async loadStoredIntegrationPropertySites(
    userIntegrationId: string,
    userPropertyId: string,
  ): Promise<EstateWebPushSiteSetting[] | null> {
    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      select: {
        user_id: true,
        user_integration_settings_id: true,
      },
    });
    if (!integration) {
      return null;
    }

    const row = await this.prisma.integrationProperty.findUnique({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: userPropertyId,
        },
      },
      select: { sites: true },
    });

    return this.parseStoredSites(row?.sites);
  }

  private async persistIntegrationPropertySites(params: {
    userIntegrationId: string;
    userPropertyId: string;
    sites: EstateWebPropertySite[];
    ads?: EstateWebPropertyAd[];
  }): Promise<void> {
    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: params.userIntegrationId },
      select: {
        user_id: true,
        user_integration_settings_id: true,
      },
    });
    if (!integration) {
      this.logger.warn(
        `Skip persisting IntegrationProperty sites: integration not found (${params.userIntegrationId})`,
      );
      return;
    }

    const sites: EstateWebPushSiteSetting[] = params.sites.map((site) => ({
      selected: true,
      name: site.name ?? '',
      agent_site_id: Number(site.agent_site_id),
      show_on_slider: site.show_on_slider ? 1 : 0,
      show_on_first_page: site.show_on_first_page ? 1 : 0,
      show_on_relative_pages: site.show_on_relative_pages ? 1 : 0,
    }));

    const ads = (params.ads ?? []).map((ad) => ({
      lang_id: ad.lang_id,
      title: ad.title ?? '',
      description: ad.description ?? '',
      text: ad.text ?? ad.description ?? '',
    }));

    try {
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
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: params.userPropertyId,
          sites: sites as unknown as Prisma.InputJsonValue,
          ads: ads as unknown as Prisma.InputJsonValue,
        },
        update: {
          sites: sites as unknown as Prisma.InputJsonValue,
          ...(params.ads !== undefined
            ? { ads: ads as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist IntegrationProperty sites for user_property=${params.userPropertyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async applySalesPriceStartIfNeeded(
    userIntegrationId: string,
    userProperty: UserProperty,
    forceRecalc = false,
  ): Promise<void> {
    const [integration, canonical] = await Promise.all([
      this.prisma.userIntegration.findUnique({
        where: { id: userIntegrationId },
        include: { settings: true },
      }),
      this.prisma.property.findUnique({
        where: { id: userProperty.canonical_property_id },
        select: { price_start: true },
      }),
    ]);

    const sales = resolveSalesPricingSettings(integration?.settings?.settings);
    // `price` is frozen after creation — the sales markup must track the
    // live price, which only ever moves via `price_web` on re-crawl.
    const basePrice = resolveSaleBasePrice(
      userProperty.price_web,
      userProperty.price,
      userProperty.square_meters,
    );
    if (
      basePrice == null ||
      !shouldApplySalesPriceStart(
        canonical?.price_start,
        sales,
        basePrice,
        forceRecalc,
      )
    ) {
      return;
    }

    if (
      !forceRecalc &&
      hasValidSalePriceStart(userProperty.price_start, basePrice)
    ) {
      return;
    }

    const pct = pickSalePercentage(
      sales.sale_percentage_start,
      sales.sale_percentage_end,
      userProperty.id,
    );
    const nextPriceStart = computeSalePriceStart(basePrice, pct);
    if (nextPriceStart == null) {
      this.logger.warn(
        `Skipping sales price_start for property=${userProperty.id}: base=${basePrice} produced invalid start`,
      );
      return;
    }

    await this.prisma.userProperty.update({
      where: { id: userProperty.id },
      data: { price_start: nextPriceStart },
    });

    userProperty.price_start = new Prisma.Decimal(nextPriceStart);
  }

  private buildPayload(
    pushSites: EstateWebPushSiteSetting[],
    adLanguages: EstateWebLanguageId[],
    userProperty?: UserProperty,
    integrationPropertyId?: number,
    useSitesAsProvided = false,
    adMaps?: EstateWebAdLanguageMaps,
  ): EstateWebPropertyPayload {
    const price =
      resolveSaleBasePrice(
        userProperty?.price,
        userProperty?.price_web,
        userProperty?.square_meters,
      ) ?? (userProperty?.price ? Number(userProperty.price) : 0);
    const priceStartRaw =
      userProperty?.price_start != null
        ? Number(userProperty.price_start)
        : NaN;
    const priceStart =
      Number.isFinite(priceStartRaw) && priceStartRaw > price
        ? priceStartRaw
        : price;
    const priceWebRaw =
      userProperty?.price_web != null ? Number(userProperty.price_web) : NaN;
    const priceWeb =
      Number.isFinite(priceWebRaw) && priceWebRaw >= price
        ? priceWebRaw
        : price;
    const title = userProperty?.title ?? '';
    const description = userProperty?.description ?? '';
    const latLng = this.buildLatLng(userProperty);
    const resolvedAds = adMaps
      ? this.buildAdsFromMaps(adMaps)
      : this.buildAds(title, description, adLanguages);

    return {
      id: integrationPropertyId ?? 0,
      type_id: userProperty?.estateweb_type_id ?? 0,
      location_id: this.resolveLocationId(userProperty) ?? 0,
      scope_id: this.resolveScopeId(userProperty),
      client_id: 0,
      coop_id: 0,
      to_client_id: 0,
      code: this.resolveEstateWebCode(userProperty),
      address: '',
      zip: userProperty?.postal_code ?? '',
      price_start: priceStart,
      price,
      price_final: 0,
      price_web: priceWeb,
      sqm: userProperty?.square_meters
        ? Number(userProperty.square_meters)
        : 0,
      distance_airport:
        sanitizeEstateWebDistance(userProperty?.distance_airport) ?? '',
      distance_port: sanitizeEstateWebDistance(userProperty?.distance_port) ?? '',
      distance_beach:
        sanitizeEstateWebDistance(userProperty?.distance_beach) ?? '',
      description,
      status_id: 0,
      is_offer: 0,
      is_exclusive_order: 0,
      video_url: userProperty?.video_url ?? '',
      show_video_on_site: 0,
      lat_lng: latLng,
      show_map_on_site: latLng ? 1 : 0,
      metadata: this.buildMetadata(userProperty),
      client_contacted_at: '',
      expires_at: '',
      fields: this.buildFields(
        userProperty?.cms_fields,
        userProperty?.estateweb_type_id,
      ),
      sites: (useSitesAsProvided
        ? pushSites
        : pushSites.filter((site) => site.selected)
      ).map((site) => ({
        selected: true,
        name: site.name,
        agent_site_id: site.agent_site_id,
        show_on_slider: site.show_on_slider,
        show_on_first_page: site.show_on_first_page,
        show_on_relative_pages: site.show_on_relative_pages,
      })),
      gateways: [],
      ads: resolvedAds,
      foreign_agents: [],
      history: [],
      notes: [],
      price_negotiable: 0,
      note: '',
    };
  }

  private async resolveContentAds(
    userProperty: UserProperty,
    userIntegrationId: string,
    forceContentProduction = false,
  ): Promise<EstateWebAdLanguageMaps> {
    if (forceContentProduction) {
      await this.contentProductionService.ensureReady(userProperty.id);
    }
    const fallback =
      await this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      );
    const maps = await this.contentResolutionService.resolveAdMaps(
      userProperty,
      fallback,
    );
    return maps;
  }

  private buildAdsFromMaps(
    adMaps: EstateWebAdLanguageMaps,
  ): EstateWebPropertyAd[] {
    return ESTATEWEB_INIT_LANGUAGES.map((lang) => {
      const title = adMaps.titles[lang.id] ?? '';
      const description = adMaps.descriptions[lang.id] ?? '';
      return {
        lang_id: lang.id,
        title,
        description,
        text: description,
      };
    });
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

  private resolveEstateWebCode(userProperty?: UserProperty): string {
    const candidates = [
      userProperty?.internal_id,
      userProperty?.property_id,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      // Strip stray leading punctuation (e.g. a scraped "#1987") before
      // validating, so a fixable value doesn't degrade to an empty code.
      const sanitized = String(candidate)
        .trim()
        .replace(/^[^A-Za-z0-9]+/, '')
        .slice(0, 64);
      if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sanitized)) {
        return sanitized;
      }
    }
    return '';
  }

  private resolveLocationId(userProperty?: UserProperty): number | null {
    if (userProperty?.estateweb_location_id) {
      return userProperty.estateweb_location_id;
    }
    return (
      resolveEstateWebLocationFromSources({
        city: userProperty?.city,
        district: userProperty?.district,
        title: userProperty?.title,
        description: userProperty?.description,
      })?.id ?? null
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
    const latitude = this.toCoordinate(userProperty?.latitude);
    const longitude = this.toCoordinate(userProperty?.longitude);
    if (latitude == null || longitude == null) return '';
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return '';
    return `${latitude},${longitude}`;
  }

  private toCoordinate(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof (value as { toNumber: unknown }).toNumber === 'function'
    ) {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
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
    userPropertyId: string,
    imagesJson: unknown,
  ): Promise<void> {
    const images = this.parseImages(imagesJson, propertyId);
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
        userPropertyId,
        estateWebPropertyId: propertyId,
        sourceByFilename,
        sourceImageUrls: images.map((image) => image.url),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist IntegrationProperty images for user_property=${userPropertyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async syncIntegrationPropertyImages(params: {
    userIntegrationId: string;
    userPropertyId: string;
    estateWebPropertyId: number | string;
    sourceByFilename?: Map<string, string>;
    sourceImageUrls?: string[];
    preserveExistingSourceImages?: boolean;
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
    const preserveExistingSourceImages =
      params.preserveExistingSourceImages !== false;
    const images = this.normalizeEstateWebImages(
      remote.images,
      remote.agent_id,
      {
        sourceByFilename: params.sourceByFilename,
        sourceImageUrls: preserveExistingSourceImages
          ? params.sourceImageUrls
          : undefined,
        existingImages: preserveExistingSourceImages
          ? existing?.images
          : undefined,
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
