import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  IntegrationType,
  NotificationType,
  Prisma,
  UserProperty,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { isLikelyImageBuffer } from '@/shared/utils/images/image-signature.utils';
import {
  CmsPushCreateResult,
  CmsSyncAdapter,
  CmsSyncBackfillImagesParams,
  CmsSyncCreateImagesParams,
  CmsSyncDeleteImagesParams,
  CmsSyncPushOptions,
  CmsSyncReorderImagesParams,
  CmsSyncUpdateImagesParams,
} from '@/modules/cms-sync/interfaces/cms-sync-adapter.interface';
import { CmsPropertyFieldEntry } from '@/modules/properties/interfaces/cms-property.interface';
import { parseIntegrationPropertyImages } from '@/modules/user-properties/utils/integration-property-images.util';
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
import { resolveEstateWebCode } from '../utils/estateweb-property-code.util';
import { resolveEstateWebPushSitesForTracker } from '../utils/estateweb-integration-settings.util';
import {
  computeSalePriceStart,
  hasValidSalePriceStart,
  isSalePriceStartWithinMarkupRange,
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
import {
  isSourceGalleryShrunk,
  planImageReconcile,
} from '../utils/estateweb-image-reconcile.util';

interface ImageEntry {
  url: string;
  filename: string;
}

interface ImageUploadFailure {
  attempts: number;
  last_attempt_at?: string;
}

interface CachedIntegrationPropertyRow {
  images: unknown;
  linked_via_reconciliation: boolean;
  excluded_source_images: unknown;
  image_upload_failures: unknown;
}

export interface EstateWebImageReconcileResult {
  status: 'in_sync' | 'reconciled' | 'planned' | 'skipped';
  skip_reason?: string;
  crm_before: number;
  crm_after: number;
  desired: number;
  deleted_ids: number[];
  uploaded: number;
  upload_failed: string[];
  reordered: boolean;
}

// A source image that has failed to download/upload this many times is left
// out of every future top-up attempt until the source URL itself changes
// (e.g. a re-crawl finds a fresh image) -- otherwise a permanently dead or
// bot-protected URL gets hit again on every single sync cycle forever.
const MAX_IMAGE_UPLOAD_ATTEMPTS = 5;

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

    // The CRM record now exists. Persist the link BEFORE any follow-up step: if a
    // later step throws, the sync run is retried, and a retry that doesn't know this
    // listing exists would create yet another copy of it in the CRM.
    await this.linkCreatedProperty(userProperty, result.id);

    // The note is cosmetic. A failure here must not fail the whole CREATE -- the
    // listing already exists, and failing would send the retry back through CREATE.
    const propertyNote = options?.propertyNote?.trim();
    if (propertyNote) {
      try {
        await this.estateWebPropertyService.createPropertyNote(
          userIntegrationId,
          result.id,
          { note: propertyNote },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to add CRM note for user_property=${userProperty.id} integration_property_id=${result.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await this.persistIntegrationPropertySites({
      userIntegrationId,
      userPropertyId: userProperty.id,
      sites: payload.sites,
      ads: payload.ads ?? [],
    });

    await this.uploadImages(
      userIntegrationId,
      result.id,
      userProperty.id,
      userProperty.images,
    );

    return { integration_property_id: String(result.id) };
  }

  private async linkCreatedProperty(
    userProperty: UserProperty,
    crmPropertyId: number,
  ): Promise<void> {
    try {
      await this.prisma.userProperty.updateMany({
        where: { id: userProperty.id, user_id: userProperty.user_id },
        data: { integration_property_id: String(crmPropertyId) },
      });
    } catch (error) {
      // Best effort: the caller stamps the same id once pushCreate returns.
      this.logger.warn(
        `Failed to persist integration_property_id=${crmPropertyId} for user_property=${userProperty.id} right after CREATE: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
      reconciledLink: options?.reconciledLink,
    });
  }

  // A listing counts as "reconciled" (linked to a CRM property this pipeline
  // didn't create) either because this very call says so, or because a past
  // call already recorded it on the cached row. Once true, it's sticky --
  // we never top up that listing's images from our scraped source, only ever
  // caching whatever the CRM already has.
  async ensureImagesCached(params: CmsSyncBackfillImagesParams): Promise<void> {
    try {
      const propertyId = Number(params.crmPropertyId);
      if (!Number.isFinite(propertyId)) return;

      const cachedRow = await this.loadCachedIntegrationPropertyRow(
        params.userIntegrationId,
        params.userPropertyId,
      );

      if (params.reconciledLink === true && !cachedRow?.linked_via_reconciliation) {
        await this.markLinkedViaReconciliation(
          params.userIntegrationId,
          params.userPropertyId,
        );
      }

      const isReconciledLink =
        params.reconciledLink === true ||
        cachedRow?.linked_via_reconciliation === true;

      if (isReconciledLink) {
        await this.ensureImagesCachedLegacy(params, propertyId, cachedRow?.images);
        return;
      }

      await this.ensureImagesCachedWithTopUp(params, propertyId, cachedRow);
    } catch (error) {
      this.logger.warn(
        `Failed to ensure CMS images for user_property=${params.userPropertyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Original behaviour, preserved as-is for listings we didn't create: fill
  // in images only when the CRM listing currently has none at all. A listing
  // that already has a photo (curated directly in the CRM, or by whoever
  // owned it before reconciliation linked it to us) is left untouched.
  private async ensureImagesCachedLegacy(
    params: CmsSyncBackfillImagesParams,
    propertyId: number,
    cachedImages: unknown,
  ): Promise<void> {
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

    if (this.hasUsableCachedImageIds(cachedImages)) return;

    await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.crmPropertyId,
      sourceImageUrls: this.parseSourceImageUrls(params.sourceImages),
      preserveExistingSourceImages: false,
    });
  }

  // For listings this pipeline created: make the CRM gallery exactly equal
  // our images (each once, in order, nothing else) via reconcileImages. The
  // previous behaviour only ever topped up "missing" photos and never removed
  // anything, so every cache/CRM mismatch turned into a duplicate upload.
  // Falls back to add-only when our source gallery looks like a crawler gap,
  // and first rebuilds our record of the CRM gallery when we have none, so a
  // listing is never wiped and re-uploaded blind.
  private async ensureImagesCachedWithTopUp(
    params: CmsSyncBackfillImagesParams,
    propertyId: number,
    cachedRow: CachedIntegrationPropertyRow | null,
  ): Promise<void> {
    const sourceImages =
      params.sourceImages ??
      (await this.loadUserPropertySourceImages(params.userPropertyId));
    const localEntries = this.parseImages(sourceImages, propertyId);

    if (localEntries.length === 0) {
      if (this.hasUsableCachedImageIds(cachedRow?.images)) return;
      await this.syncIntegrationPropertyImages({
        userIntegrationId: params.userIntegrationId,
        userPropertyId: params.userPropertyId,
        estateWebPropertyId: params.crmPropertyId,
        sourceImageUrls: [],
        preserveExistingSourceImages: false,
      });
      return;
    }

    if (await this.isSourceGalleryShrunkForProperty(params.userPropertyId)) {
      await this.topUpOnly(params, propertyId, cachedRow, localEntries, sourceImages);
      return;
    }

    if (this.buildExistingSourceImageById(cachedRow?.images).size === 0) {
      await this.syncIntegrationPropertyImages({
        userIntegrationId: params.userIntegrationId,
        userPropertyId: params.userPropertyId,
        estateWebPropertyId: params.crmPropertyId,
        sourceImageUrls: this.parseSourceImageUrls(sourceImages),
        preserveExistingSourceImages: false,
      });
    }

    await this.reconcileImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      crmPropertyId: params.crmPropertyId,
      desiredImages: this.parseSourceImageUrls(sourceImages),
    });
  }

  private async isSourceGalleryShrunkForProperty(
    userPropertyId: string,
  ): Promise<boolean> {
    const property = await this.prisma.userProperty.findUnique({
      where: { id: userPropertyId },
      select: {
        user_id: true,
        images_curated_at: true,
        canonical_property_id: true,
        canonical_property: {
          select: {
            images: true,
            source_links: {
              take: 1,
              select: { source_property: { select: { source_agency_id: true } } },
            },
          },
        },
      },
    });
    // A hand-edited selection doesn't come from the source gallery, so a
    // shrunken source can't have corrupted it.
    if (property?.images_curated_at != null) return false;
    const canonical = property?.canonical_property;
    const agencyId = canonical?.source_links[0]?.source_property.source_agency_id;
    if (!property || !canonical || !agencyId) return false;

    const tracker = await this.prisma.userTrackedAgency.findFirst({
      where: { user_id: property.user_id, source_agency_id: agencyId },
      select: { max_image_count: true },
    });
    const rows = await this.prisma.$queryRaw<Array<{ peak: number | null }>>`
      SELECT MAX(jsonb_array_length(old_value))::int AS peak
      FROM property_history
      WHERE field = 'images'
        AND jsonb_typeof(old_value) = 'array'
        AND property_id = ${property.canonical_property_id}`;
    const currentCount = Array.isArray(canonical.images) ? canonical.images.length : 0;
    return isSourceGalleryShrunk(
      currentCount,
      rows[0]?.peak ?? undefined,
      tracker?.max_image_count ?? null,
    );
  }

  // The previous add-only behaviour: upload scraped images not yet on the CRM,
  // never delete. Skips images the user deliberately deleted from the CRM and
  // backs off images that keep failing to download/upload.
  private async topUpOnly(
    params: CmsSyncBackfillImagesParams,
    propertyId: number,
    cachedRow: CachedIntegrationPropertyRow | null,
    localEntries: ImageEntry[],
    sourceImages: unknown,
  ): Promise<void> {
    const excludedUrls = new Set(
      this.parseSourceImageUrls(cachedRow?.excluded_source_images),
    );
    const excludedIdentities = new Set(
      [...excludedUrls].map((url) => this.normalizeSourceImageIdentity(url)),
    );
    const remoteSourceIdentities = new Set(
      [...this.buildExistingSourceImageById(cachedRow?.images).values()].map(
        (url) => this.normalizeSourceImageIdentity(url),
      ),
    );
    const failures = this.parseImageUploadFailures(
      cachedRow?.image_upload_failures,
    );

    // Compare by normalized identity, not the raw URL: the same scraped photo
    // is often re-served at a different size/query string across crawls (e.g.
    // a thumbnail URL cached from an older crawl vs. the full-size URL a
    // newer crawl stores) -- an exact-string diff would treat that as a new,
    // missing image and upload a duplicate of a photo already on the CRM.
    const missing = localEntries.filter((entry) => {
      const identity = this.normalizeSourceImageIdentity(entry.url);
      if (excludedIdentities.has(identity)) return false;
      if (remoteSourceIdentities.has(identity)) return false;
      const failure = failures[entry.url];
      if (failure && failure.attempts >= MAX_IMAGE_UPLOAD_ATTEMPTS) return false;
      return true;
    });

    if (missing.length === 0) {
      if (this.hasUsableCachedImageIds(cachedRow?.images)) return;
      await this.syncIntegrationPropertyImages({
        userIntegrationId: params.userIntegrationId,
        userPropertyId: params.userPropertyId,
        estateWebPropertyId: params.crmPropertyId,
        sourceImageUrls: this.parseSourceImageUrls(sourceImages),
        preserveExistingSourceImages: false,
      });
      return;
    }

    await this.topUpMissingImages(
      params.userIntegrationId,
      propertyId,
      params.userPropertyId,
      missing,
      failures,
    );
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

  private async resolveIntegrationScope(
    userIntegrationId: string,
  ): Promise<{ user_id: string; user_integration_settings_id: string } | null> {
    return this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      select: { user_id: true, user_integration_settings_id: true },
    });
  }

  private async loadCachedIntegrationPropertyRow(
    userIntegrationId: string,
    userPropertyId: string,
  ): Promise<CachedIntegrationPropertyRow | null> {
    const integration = await this.resolveIntegrationScope(userIntegrationId);
    if (!integration) return null;

    return this.prisma.integrationProperty.findUnique({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: userPropertyId,
        },
      },
      select: {
        images: true,
        linked_via_reconciliation: true,
        excluded_source_images: true,
        image_upload_failures: true,
      },
    });
  }

  private async markLinkedViaReconciliation(
    userIntegrationId: string,
    userPropertyId: string,
  ): Promise<void> {
    const integration = await this.resolveIntegrationScope(userIntegrationId);
    if (!integration) return;

    await this.prisma.integrationProperty.upsert({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: userPropertyId,
        },
      },
      create: {
        user_id: integration.user_id,
        user_integration_settings_id: integration.user_integration_settings_id,
        user_property_id: userPropertyId,
        linked_via_reconciliation: true,
      },
      update: { linked_via_reconciliation: true },
    });
  }

  // Collapses a source image URL to a stable identity for dedup purposes:
  // drops the query string (crawl-to-crawl cache-busting params) and a
  // trailing "_WIDTHxHEIGHT" resize suffix (a common convention across
  // real-estate/CMS image servers) right before the extension, so the same
  // photo served at a different size or re-crawled with a new query string
  // still matches what's already on the CRM. Falls back to a plain
  // lowercased/trimmed comparison if the URL doesn't parse.
  private normalizeSourceImageIdentity(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(
        /[_-]\d{2,5}x\d{2,5}(?=\.[a-zA-Z0-9]+$)/i,
        '',
      );
      return `${parsed.host}${path}`.toLowerCase();
    } catch {
      return url.trim().toLowerCase();
    }
  }

  private parseImageUploadFailures(
    imagesJson: unknown,
  ): Record<string, ImageUploadFailure> {
    if (imagesJson == null || typeof imagesJson !== 'object') return {};
    const result: Record<string, ImageUploadFailure> = {};
    for (const [url, value] of Object.entries(
      imagesJson as Record<string, unknown>,
    )) {
      if (value == null || typeof value !== 'object') continue;
      const attempts = (value as { attempts?: unknown }).attempts;
      const lastAttemptAt = (value as { last_attempt_at?: unknown })
        .last_attempt_at;
      if (typeof attempts !== 'number') continue;
      result[url] = {
        attempts,
        last_attempt_at:
          typeof lastAttemptAt === 'string' ? lastAttemptAt : undefined,
      };
    }
    return result;
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

    // Use the exact same payload-building path as pushUpdate's known-working
    // `sitesOverride: []` case (what /properties/update-estateweb-sites uses,
    // confirmed live) -- NOT a hand-rolled round-trip. An earlier version here
    // round-tripped the full record and explicitly deselected every site, then
    // hard-failed if a re-GET still showed sites live. That "still live" check
    // was firing on stale reads: EstateWeb's PATCH applies immediately but its
    // GET has read-after-write lag (confirmed live -- a property re-checked
    // ~10 minutes after PATCH correctly showed sites cleared, with nothing else
    // touching it in between). So the extra verification did nothing but
    // report false failures for every property in a batch.
    const adLanguages =
      await this.estateWebIntegrationResolverService.resolveAdLanguages(
        userIntegrationId,
      );
    const adMaps = await this.resolveContentAds(userProperty, userIntegrationId);
    const payload = this.buildPayload(
      [],
      adLanguages,
      userProperty,
      Number(integrationPropertyId),
      true, // useSitesAsProvided -- send `sites: []` as-is, matching pushUpdate's sitesOverride: []
      adMaps,
    ) as EstateWebUpdatePropertyPayload;

    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );

    // Intentionally do NOT persist `sites: []` locally here (unlike pushUpdate,
    // which always persists whatever sites it just pushed). This unpublish is a
    // transient, crawler-driven reaction to the source listing disappearing --
    // not a user decision to permanently stop publishing. Leaving the stored
    // site preference untouched lets resolvePushSitesForSync() restore the
    // original sites automatically on the next pushUpdate() once the listing
    // reappears, instead of the property staying unpublished on every site
    // forever (see incident notes in api/RULES.md).
    await this.persistIntegrationPropertySites({
      userIntegrationId,
      userPropertyId: userProperty.id,
      ads: payload.ads,
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

    // Resolve which scraped source URLs these CRM image ids correspond to
    // *before* deleting, so a deliberate deletion is remembered -- otherwise
    // the next sync's image top-up would see the URL as "missing" from the
    // CRM and silently re-add the very image the user just removed.
    const cachedRow = await this.loadCachedIntegrationPropertyRow(
      params.userIntegrationId,
      params.userPropertyId,
    );
    const sourceById = this.buildExistingSourceImageById(cachedRow?.images);
    // Deleting a duplicate copy is not deleting the photo: only remember a
    // photo as deliberately removed when no other image on the listing still
    // shows it. Otherwise the sync would also remove the remaining copy and
    // never upload the photo again.
    const deleted = new Set(uniqueIds);
    const stillShown = new Set(
      [...sourceById.entries()]
        .filter(([id]) => !deleted.has(id))
        .map(([, url]) => this.normalizeSourceImageIdentity(url)),
    );
    const deletedSourceUrls = uniqueIds
      .map((id) => sourceById.get(id))
      .filter((url): url is string => typeof url === 'string')
      .filter((url) => !stillShown.has(this.normalizeSourceImageIdentity(url)));

    for (const imageId of uniqueIds) {
      await this.estateWebPropertyService.deletePropertyImage(
        params.userIntegrationId,
        imageId,
      );
    }

    if (deletedSourceUrls.length > 0) {
      await this.recordExcludedSourceImages(
        params.userIntegrationId,
        params.userPropertyId,
        deletedSourceUrls,
      );
    }

    await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: params.crmPropertyId,
    });
  }

  private async recordExcludedSourceImages(
    userIntegrationId: string,
    userPropertyId: string,
    urls: string[],
  ): Promise<void> {
    const integration = await this.resolveIntegrationScope(userIntegrationId);
    if (!integration) return;

    const existingRow = await this.prisma.integrationProperty.findUnique({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: userPropertyId,
        },
      },
      select: { excluded_source_images: true },
    });
    const merged = new Set([
      ...this.parseSourceImageUrls(existingRow?.excluded_source_images),
      ...urls,
    ]);
    const value = [...merged];

    await this.prisma.integrationProperty.upsert({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: userPropertyId,
        },
      },
      create: {
        user_id: integration.user_id,
        user_integration_settings_id: integration.user_integration_settings_id,
        user_property_id: userPropertyId,
        excluded_source_images: value as unknown as Prisma.InputJsonValue,
      },
      update: {
        excluded_source_images: value as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async reorderImages(params: CmsSyncReorderImagesParams): Promise<void> {
    const orderedIds = [
      ...new Set(
        params.imageIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    if (orderedIds.length === 0) {
      throw new EstateWebException(
        'No valid CMS image ids provided',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.estateWebPropertyService.reorderPropertyImages(
      params.userIntegrationId,
      params.crmPropertyId,
      {
        data: orderedIds.map((id, index) => ({ id, zindex: index + 1 })),
      },
    );

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
    const requested = [
      ...new Set(
        params.sourceImageUrls.filter(
          (url): url is string => typeof url === 'string' && url.length > 0,
        ),
      ),
    ];
    if (requested.length === 0) {
      throw new EstateWebException(
        'No source image urls provided',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Never upload a photo the listing already shows: "Push images to CRM"
    // re-sends every image we track, and uploading the ones already there
    // created duplicate copies.
    const cachedRow = await this.loadCachedIntegrationPropertyRow(
      params.userIntegrationId,
      params.userPropertyId,
    );
    const alreadyShown = new Set(
      [...this.buildExistingSourceImageById(cachedRow?.images).values()].map(
        (url) => this.normalizeSourceImageIdentity(url),
      ),
    );
    const sourceImageUrls = requested.filter(
      (url) => !alreadyShown.has(this.normalizeSourceImageIdentity(url)),
    );
    if (sourceImageUrls.length === 0) return;

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

  // Used by the automatic per-tracker watermark pipeline: it only knows the
  // OLD source URL it just replaced locally, not a CRM image id. Finds the
  // cached CRM image whose source_image matches that URL by normalized
  // identity (same matching used by the image top-up path) and -- if found --
  // replaces it in place via replaceImageAfterWatermark instead of letting
  // the generic top-up logic treat the processed image as a brand new one and
  // append a duplicate. Returns false (no-op) when there's nothing cached yet
  // to replace -- the caller's normal image push still picks it up as new.
  async replaceCachedImageBySourceUrl(params: {
    userIntegrationId: string;
    userPropertyId: string;
    crmPropertyId: string;
    oldSourceUrl: string;
    processedBuffer: Buffer;
    gcsUrl: string;
  }): Promise<boolean> {
    const cachedRow = await this.loadCachedIntegrationPropertyRow(
      params.userIntegrationId,
      params.userPropertyId,
    );
    const images = parseIntegrationPropertyImages(
      cachedRow?.images,
      IntegrationType.ESTATEWEB,
    );
    if (images.length === 0) return false;

    const targetIdentity = this.normalizeSourceImageIdentity(
      params.oldSourceUrl,
    );
    const matchIndex = images.findIndex(
      (image) =>
        typeof image.source_image === 'string' &&
        image.source_image.length > 0 &&
        this.normalizeSourceImageIdentity(image.source_image) ===
          targetIdentity,
    );
    if (matchIndex === -1) return false;

    const oldImage = images[matchIndex];
    await this.replaceImageAfterWatermark({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      crmPropertyId: params.crmPropertyId,
      oldImageId: oldImage.id,
      processedBuffer: params.processedBuffer,
      gcsUrl: params.gcsUrl,
      oldImage,
      zindex: matchIndex + 1,
      deleteOldImage: true,
    });
    return true;
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
    // Omit entirely to leave the stored site preference untouched (e.g. a transient
    // pushRemove unpublish) -- pass [] explicitly only when the caller intends to
    // record "publish nowhere" as the new sticky preference.
    sites?: EstateWebPropertySite[];
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

    const sites: EstateWebPushSiteSetting[] | undefined = params.sites?.map(
      (site) => ({
        selected: true,
        name: site.name ?? '',
        agent_site_id: Number(site.agent_site_id),
        show_on_slider: site.show_on_slider ? 1 : 0,
        show_on_first_page: site.show_on_first_page ? 1 : 0,
        show_on_relative_pages: site.show_on_relative_pages ? 1 : 0,
      }),
    );

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
          sites: (sites ?? []) as unknown as Prisma.InputJsonValue,
          ads: ads as unknown as Prisma.InputJsonValue,
        },
        update: {
          ...(sites !== undefined
            ? { sites: sites as unknown as Prisma.InputJsonValue }
            : {}),
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

    if (!sales.enable_sales) {
      // Disabling the toggle must not just stop *new* markups -- a markup
      // already written to price_start otherwise survives forever (both
      // here, which used to just no-op, and via mapFromCanonical() in
      // user-properties.service.ts, which keeps carrying the stale value
      // forward on every re-crawl). Reset it to the plain `price`, but only
      // when the source listing itself has no genuine discount, so a real
      // CRM/source markdown is never touched.
      if (
        userProperty.price_start != null &&
        basePrice != null &&
        !hasValidSalePriceStart(canonical?.price_start, basePrice)
      ) {
        await this.prisma.userProperty.update({
          where: { id: userProperty.id },
          data: { price_start: userProperty.price },
        });
        userProperty.price_start = userProperty.price;
      }
      return;
    }

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
      isSalePriceStartWithinMarkupRange(
        userProperty.price_start,
        basePrice,
        sales,
      )
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
    // `price_web` is the live, crawl-tracked price and may legitimately be
    // below the frozen `price` (e.g. the listing dropped in price) — never
    // clamp it back up to the stale `price`, or CRM pushes silently drop
    // real price drops.
    const priceWebRaw =
      userProperty?.price_web != null ? Number(userProperty.price_web) : NaN;
    const priceWeb = Number.isFinite(priceWebRaw) ? priceWebRaw : price;
    const priceStartRaw =
      userProperty?.price_start != null
        ? Number(userProperty.price_start)
        : NaN;
    const priceStart =
      Number.isFinite(priceStartRaw) && priceStartRaw > priceWeb
        ? priceStartRaw
        : priceWeb;
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
      sqm: userProperty?.square_meters ? Number(userProperty.square_meters) : 0,
      distance_airport:
        sanitizeEstateWebDistance(userProperty?.distance_airport) ?? '',
      distance_port:
        sanitizeEstateWebDistance(userProperty?.distance_port) ?? '',
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
    return resolveEstateWebCode(
      userProperty?.internal_id,
      userProperty?.property_id,
    );
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
        if (!buffer?.length) {
          this.logger.warn(
            `[uploadImages] empty/unreachable source image for property=${propertyId} user_property=${userPropertyId}: ${image.url}`,
          );
          continue;
        }

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
      } catch (error) {
        this.logger.warn(
          `[uploadImages] failed to upload source image for property=${propertyId} user_property=${userPropertyId} url=${image.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (uploadedCount === 0) {
      this.logger.warn(
        `[uploadImages] 0/${images.length} source images uploaded for property=${propertyId} user_property=${userPropertyId}`,
      );
      return;
    }

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

  // Uploads only the given (already-known-missing) images onto an existing CRM
  // listing, appended after whatever images are already there, and persists
  // per-URL attempt counts so a chronically failing image backs off instead
  // of being retried on every future sync.
  private async topUpMissingImages(
    userIntegrationId: string,
    propertyId: number,
    userPropertyId: string,
    missing: ImageEntry[],
    failures: Record<string, ImageUploadFailure>,
  ): Promise<void> {
    const remote = await this.estateWebPropertyService.getProperty(
      userIntegrationId,
      propertyId,
    );
    const startingZindex = Array.isArray(remote.images)
      ? remote.images.length
      : 0;

    const sourceByFilename = new Map<string, string>();
    const updatedFailures = { ...failures };
    let uploadedCount = 0;

    for (let index = 0; index < missing.length; index++) {
      const image = missing[index];
      try {
        const buffer = await this.downloadImage(image.url);
        if (!buffer?.length) {
          this.recordImageUploadFailure(updatedFailures, image.url);
          this.logger.warn(
            `[topUpMissingImages] empty/unreachable source image for property=${propertyId} user_property=${userPropertyId}: ${image.url}`,
          );
          continue;
        }

        const payload: EstateWebUploadImagePayload = {
          filename: image.filename,
          show_on_site: 1,
          show_on_groups: 1,
          show_on_foreign_agents: 0,
          zindex: startingZindex + index + 1,
        };

        await this.estateWebPropertyService.uploadPropertyImage(
          userIntegrationId,
          propertyId,
          buffer,
          payload,
          'image/jpeg',
        );
        sourceByFilename.set(image.filename, image.url);
        delete updatedFailures[image.url];
        uploadedCount += 1;
      } catch (error) {
        this.recordImageUploadFailure(updatedFailures, image.url);
        this.logger.warn(
          `[topUpMissingImages] failed to upload source image for property=${propertyId} user_property=${userPropertyId} url=${image.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (uploadedCount > 0) {
      try {
        await this.syncIntegrationPropertyImages({
          userIntegrationId,
          userPropertyId,
          estateWebPropertyId: propertyId,
          sourceByFilename,
          preserveExistingSourceImages: true,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to persist IntegrationProperty images for user_property=${userPropertyId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await this.persistImageUploadFailures(
      userIntegrationId,
      userPropertyId,
      updatedFailures,
    );
  }

  // Makes the live EstateWeb gallery exactly equal `desiredImages`: each
  // desired photo exactly once, in that order, nothing else. Identity of a
  // live CRM image comes from our cached source_image (keyed by CRM id); a
  // live image we have no record of is treated as not ours-to-keep. Uploads
  // run before deletes so a failed upload never leaves the listing with fewer
  // photos than it started with for that slot. Never empties a gallery.
  async reconcileImages(params: {
    userIntegrationId: string;
    userPropertyId: string;
    crmPropertyId: number | string;
    desiredImages: string[];
    dryRun?: boolean;
  }): Promise<EstateWebImageReconcileResult> {
    const propertyId = Number(params.crmPropertyId);
    const result: EstateWebImageReconcileResult = {
      status: 'in_sync',
      crm_before: 0,
      crm_after: 0,
      desired: 0,
      deleted_ids: [],
      uploaded: 0,
      upload_failed: [],
      reordered: false,
    };
    if (!Number.isFinite(propertyId)) {
      return { ...result, status: 'skipped', skip_reason: 'invalid_crm_property_id' };
    }

    const cachedRow = await this.loadCachedIntegrationPropertyRow(
      params.userIntegrationId,
      params.userPropertyId,
    );
    if (cachedRow?.linked_via_reconciliation) {
      return { ...result, status: 'skipped', skip_reason: 'listing_not_created_by_us' };
    }

    const remote = await this.estateWebPropertyService.getProperty(
      params.userIntegrationId,
      propertyId,
    );
    const live = (Array.isArray(remote.images) ? remote.images : []).filter(
      (image) => image != null && typeof image.id === 'number',
    );
    result.crm_before = live.length;

    const failures = this.parseImageUploadFailures(cachedRow?.image_upload_failures);
    const sourceById = this.buildExistingSourceImageById(cachedRow?.images);
    const { desired, toDelete, toUpload, orderWrong } = planImageReconcile({
      crmImageIds: live.map((image) => image.id),
      sourceById,
      desiredImages: params.desiredImages,
      excludedImages: this.parseSourceImageUrls(cachedRow?.excluded_source_images),
      isUploadBlocked: (url) =>
        (failures[url]?.attempts ?? 0) >= MAX_IMAGE_UPLOAD_ATTEMPTS,
      normalize: (url) => this.normalizeSourceImageIdentity(url),
    });
    result.desired = desired.length;
    if (desired.length === 0) {
      return { ...result, status: 'skipped', skip_reason: 'no_desired_images' };
    }

    if (toDelete.length === 0 && toUpload.length === 0 && !orderWrong) {
      result.crm_after = live.length;
      return result;
    }

    if (params.dryRun) {
      return {
        ...result,
        status: 'planned',
        deleted_ids: toDelete,
        uploaded: toUpload.length,
        reordered: orderWrong || toUpload.length > 0,
        crm_after: live.length - toDelete.length + toUpload.length,
      };
    }

    const sourceByFilename = new Map<string, string>();
    const updatedFailures = { ...failures };
    for (let index = 0; index < toUpload.length; index++) {
      const url = toUpload[index];
      const filename = this.buildUniqueImageFilename(url, propertyId, index);
      try {
        const buffer = await this.downloadImage(url);
        if (!buffer?.length) throw new Error('empty or unreachable source image');
        await this.estateWebPropertyService.uploadPropertyImage(
          params.userIntegrationId,
          propertyId,
          buffer,
          {
            filename,
            show_on_site: 1,
            show_on_groups: 1,
            show_on_foreign_agents: 0,
            zindex: live.length + index + 1,
          },
          'image/jpeg',
        );
        sourceByFilename.set(filename, url);
        delete updatedFailures[url];
        result.uploaded += 1;
      } catch (error) {
        this.recordImageUploadFailure(updatedFailures, url);
        result.upload_failed.push(url);
        this.logger.warn(
          `[reconcileImages] upload failed property=${propertyId} user_property=${params.userPropertyId} url=${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // An image we have no record of might be the very photo whose upload just
    // failed; only remove those once every upload succeeded.
    const deletable =
      result.upload_failed.length > 0
        ? toDelete.filter((imageId) => sourceById.has(imageId))
        : toDelete;
    for (const imageId of deletable) {
      try {
        await this.estateWebPropertyService.deletePropertyImage(
          params.userIntegrationId,
          imageId,
        );
        result.deleted_ids.push(imageId);
      } catch (error) {
        if (error instanceof EstateWebException && error.getStatus() === HttpStatus.NOT_FOUND) {
          result.deleted_ids.push(imageId);
          continue;
        }
        throw error;
      }
    }

    const refreshed = await this.syncIntegrationPropertyImages({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      estateWebPropertyId: propertyId,
      sourceByFilename,
      preserveExistingSourceImages: true,
    });

    const idByIdentity = new Map<string, number>();
    for (const image of refreshed) {
      if (!image.source_image) continue;
      const identity = this.normalizeSourceImageIdentity(image.source_image);
      if (!idByIdentity.has(identity)) idByIdentity.set(identity, image.id);
    }
    const finalOrder = desired
      .map((url) => idByIdentity.get(this.normalizeSourceImageIdentity(url)))
      .filter((id): id is number => id != null);
    const leftovers = refreshed.map((image) => image.id).filter((id) => !finalOrder.includes(id));
    const targetOrder = [...finalOrder, ...leftovers];
    if (targetOrder.join(',') !== refreshed.map((image) => image.id).join(',')) {
      await this.reorderImages({
        userIntegrationId: params.userIntegrationId,
        userPropertyId: params.userPropertyId,
        crmPropertyId: String(propertyId),
        imageIds: targetOrder,
      });
      result.reordered = true;
    }

    await this.persistImageUploadFailures(
      params.userIntegrationId,
      params.userPropertyId,
      updatedFailures,
    );

    result.crm_after = refreshed.length;
    result.status = 'reconciled';
    return result;
  }

  private recordImageUploadFailure(
    failures: Record<string, ImageUploadFailure>,
    url: string,
  ): void {
    const existing = failures[url];
    failures[url] = {
      attempts: (existing?.attempts ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    };
  }

  private async persistImageUploadFailures(
    userIntegrationId: string,
    userPropertyId: string,
    failures: Record<string, ImageUploadFailure>,
  ): Promise<void> {
    const integration = await this.resolveIntegrationScope(userIntegrationId);
    if (!integration) return;

    const value = Object.keys(failures).length > 0 ? failures : null;
    await this.prisma.integrationProperty.upsert({
      where: {
        user_id_user_integration_settings_id_user_property_id: {
          user_id: integration.user_id,
          user_integration_settings_id:
            integration.user_integration_settings_id,
          user_property_id: userPropertyId,
        },
      },
      create: {
        user_id: integration.user_id,
        user_integration_settings_id: integration.user_integration_settings_id,
        user_property_id: userPropertyId,
        image_upload_failures: value as unknown as Prisma.InputJsonValue,
      },
      update: {
        image_upload_failures: value as unknown as Prisma.InputJsonValue,
      },
    });
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
      // Positional fallback is only safe when there's no precise per-image
      // filename map at all (a full-gallery repair/resync with just an ordered
      // url list). When sourceByFilename IS provided, sourceImageUrls holds only
      // the handful of URLs uploaded THIS call, not one-per-remote-image -- so
      // indexing it by sourceIndex (which counts every remote image, old and
      // new) would wrongly tag an unrelated pre-existing image with the new
      // photo's URL the moment its position happens to fall inside that short
      // list, duplicating the new photo under two CRM image ids.
      const sourceFromIndex = options?.sourceByFilename
        ? undefined
        : options?.sourceImageUrls?.[sourceIndex];
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
    } catch {}
    const stamp = `${Date.now()}${String(index).padStart(3, '0')}${Math.floor(Math.random() * 900 + 100)}`;
    return `${propertyId}-${stamp}${ext}`;
  }

  private async downloadImage(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(
          `[downloadImage] ${response.status} ${response.statusText} for ${url}`,
        );
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Some bot-protection layers return HTTP 200 with a tiny HTML
      // captcha/redirect page instead of the real image -- response.ok
      // alone can't catch that. See image-signature.utils.ts for why.
      if (!isLikelyImageBuffer(buffer)) {
        this.logger.warn(
          `[downloadImage] response for ${url} doesn't look like a real image (likely a bot-protection page) -- skipping`,
        );
        return null;
      }
      return buffer;
    } catch (error) {
      this.logger.warn(
        `[downloadImage] failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
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
