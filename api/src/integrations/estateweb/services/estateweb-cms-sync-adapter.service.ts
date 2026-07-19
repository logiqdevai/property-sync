import { HttpStatus, Injectable } from '@nestjs/common';
import { UserProperty } from 'generated/prisma';
import {
  CmsPushCreateResult,
  CmsSyncAdapter,
} from '@/modules/cms-sync/interfaces/cms-sync-adapter.interface';
import { CmsPropertyFieldEntry } from '@/modules/properties/interfaces/cms-property.interface';
import {
  EstateWebPropertyFieldValue,
  EstateWebPropertyPayload,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '../interfaces/estateweb-property.interface';
import { EstateWebScope } from '../constants/estateweb-enums.constants';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { NotificationType } from 'generated/prisma';
import { EstateWebPropertyService } from './estateweb-property.service';

interface ImageEntry {
  url: string;
  filename: string;
}

@Injectable()
export class EstateWebCmsSyncAdapter implements CmsSyncAdapter {
  constructor(
    private readonly estateWebPropertyService: EstateWebPropertyService,
  ) {}

  async pushCreate(
    userIntegrationId: string,
    userProperty: UserProperty,
  ): Promise<CmsPushCreateResult> {
    this.assertRequiredFields(userProperty);

    const payload = this.buildPayload(userProperty);
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

    const payload = this.buildPayload(
      userProperty,
      Number(integrationPropertyId),
    ) as EstateWebUpdatePropertyPayload;
    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );

    await this.uploadImages(
      userIntegrationId,
      Number(integrationPropertyId),
      userProperty,
    );
  }

  async pushRemove(
    userIntegrationId: string,
    integrationPropertyId: string,
  ): Promise<void> {
    const payload = this.buildPayload(
      undefined,
      Number(integrationPropertyId),
    ) as EstateWebUpdatePropertyPayload;
    payload.status_id = 0;

    await this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      integrationPropertyId,
      payload,
    );
  }

  private buildPayload(
    userProperty?: UserProperty,
    integrationPropertyId?: number,
  ): EstateWebPropertyPayload {
    const payload: EstateWebPropertyPayload = {
      id: integrationPropertyId,
      type_id: userProperty?.estateweb_type_id ?? 0,
      location_id: userProperty?.estateweb_location_id ?? 0,
      scope_id: this.resolveScopeId(userProperty),
      address: userProperty?.address ?? undefined,
      zip: userProperty?.postal_code ?? undefined,
      price_start: userProperty?.price_start
        ? Number(userProperty.price_start)
        : userProperty?.price
          ? Number(userProperty.price)
          : undefined,
      price: userProperty?.price ? Number(userProperty.price) : undefined,
      price_web: userProperty?.price_web
        ? Number(userProperty.price_web)
        : undefined,
      sqm: userProperty?.square_meters
        ? Number(userProperty.square_meters)
        : undefined,
      description: userProperty?.description ?? undefined,
      distance_airport: userProperty?.distance_airport ?? undefined,
      distance_port: userProperty?.distance_port ?? undefined,
      distance_beach: userProperty?.distance_beach ?? undefined,
      video_url: userProperty?.video_url ?? undefined,
      lat_lng: this.buildLatLng(userProperty),
      fields: this.buildFields(userProperty?.cms_fields),
    };

    return payload;
  }

  private resolveScopeId(userProperty?: UserProperty): EstateWebScope {
    if (userProperty?.listing_type === 'RENT') return EstateWebScope.RENT;
    if (userProperty?.listing_type === 'SHORT_TERM_RENT')
      return EstateWebScope.RENT;
    return EstateWebScope.SALE;
  }

  private buildLatLng(userProperty?: UserProperty): string | undefined {
    if (!userProperty?.latitude || !userProperty?.longitude) return undefined;
    return `${userProperty.latitude},${userProperty.longitude}`;
  }

  private buildFields(
    cmsFields: unknown,
  ): EstateWebPropertyFieldValue[] | undefined {
    if (!Array.isArray(cmsFields)) return undefined;
    const entries = cmsFields as CmsPropertyFieldEntry[];
    return entries
      .filter(
        (entry): entry is CmsPropertyFieldEntry =>
          entry?.id != null && entry.value != null,
      )
      .map((entry) => ({
        id: entry.id,
        value: String(entry.value),
      })) as EstateWebPropertyFieldValue[];
  }

  private async uploadImages(
    userIntegrationId: string,
    propertyId: number,
    userProperty: UserProperty,
  ): Promise<void> {
    const images = this.parseImages(userProperty.images);
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      try {
        const buffer = await this.downloadImage(image.url);
        if (!buffer?.length) continue;

        const payload: EstateWebUploadImagePayload = {
          filename: image.filename,
          show_on_site: 1,
          show_on_groups: 1,
          show_on_foreign_agents: 1,
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

  private parseImages(imagesJson: unknown): ImageEntry[] {
    if (!Array.isArray(imagesJson)) return [];
    return imagesJson
      .filter((item): item is string => typeof item === 'string')
      .map((url, index) => ({
        url,
        filename: `image-${index + 1}.jpg`,
      }));
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
    if (!userProperty?.estateweb_location_id) {
      throw new EstateWebException(
        'EstateWeb location id is required',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
