import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UserProperty } from 'generated/prisma';
import {
  CmsPushCreateResult,
  CmsSyncAdapter,
} from '@/modules/cms-sync/interfaces/cms-sync-adapter.interface';
import { CmsPropertyFieldEntry } from '@/modules/properties/interfaces/cms-property.interface';
import { coerceCmsFieldValueForEstateWeb } from '@/modules/properties/utils/property-cms-field-mapper.util';
import {
  EstateWebPropertyAd,
  EstateWebPropertyFieldValue,
  EstateWebPropertyPayload,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '../interfaces/estateweb-property.interface';
import { EstateWebPushSiteSetting } from '../interfaces/estateweb-integration-settings.interface';
import {
  ESTATEWEB_INIT_LANGUAGES,
  EstateWebScope,
} from '../constants/estateweb-enums.constants';
import { resolveEstateWebLocationId } from '../utils/estateweb-location-lookup.util';
import { resolveEstateWebScopeId } from '../utils/estateweb-catalog.util';
import { getEstateWebInitFieldsForType } from '../utils/estateweb-init-lookup.util';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { NotificationType } from 'generated/prisma';
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
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebIntegrationResolverService: EstateWebIntegrationResolverService,
  ) {}

  async pushCreate(
    userIntegrationId: string,
    userProperty: UserProperty,
  ): Promise<CmsPushCreateResult> {
    this.assertRequiredFields(userProperty);

    const pushSites =
      await this.estateWebIntegrationResolverService.resolvePushSites(
        userIntegrationId,
      );
    const payload = this.buildPayload(pushSites, userProperty);
    this.logger.log(
      `EstateWeb CREATE payload: type_id=${payload.type_id} location_id=${payload.location_id} scope_id=${payload.scope_id} fields=${payload.fields?.length ?? 0} price=${payload.price ?? 'null'}`,
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

    const pushSites =
      await this.estateWebIntegrationResolverService.resolvePushSites(
        userIntegrationId,
      );
    const payload = this.buildPayload(
      pushSites,
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

    const pushSites =
      await this.estateWebIntegrationResolverService.resolvePushSites(
        userIntegrationId,
      );
    const payload = this.buildPayload(
      pushSites,
      userProperty,
      Number(integrationPropertyId),
    ) as EstateWebUpdatePropertyPayload;

    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );
  }

  private buildPayload(
    pushSites: EstateWebPushSiteSetting[],
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
      sites: pushSites.map((site) => ({ ...site, selected: false })),
      gateways: [],
      ads: this.buildAds(title, description),
      foreign_agents: [],
      history: [],
      notes: [],
      price_negotiable: 0,
      note: '',
    };
  }

  private buildAds(title: string, description: string): EstateWebPropertyAd[] {
    return ESTATEWEB_INIT_LANGUAGES.map((lang) =>
      lang.id === 1
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
      } catch {
        // Individual image upload failures are non-fatal; the property push succeeded.
      }
    }
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
    let base = `image-${index + 1}`;
    try {
      const name = new URL(url).pathname.split('/').pop() ?? '';
      const match = name.match(/^(.+?)(\.[a-zA-Z0-9]+)?$/);
      if (match?.[1]) {
        base = match[1].replace(/[^a-zA-Z0-9_-]/g, '_');
      }
      if (match?.[2]) {
        ext = match[2].toLowerCase();
      }
    } catch {
      // keep defaults
    }
    return `${propertyId}-${index + 1}-${base}${ext}`;
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
