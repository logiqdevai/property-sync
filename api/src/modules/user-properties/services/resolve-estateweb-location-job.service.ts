import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GoogleMapsService } from '@/shared/services/google-maps/google-maps.service';
import { resolveEstateWebLocationFromSources } from '@/integrations/estateweb/utils/estateweb-location-lookup.util';
import {
  ResolveEstateWebLocationItemResult,
  ResolveEstateWebLocationJobData,
} from '../interfaces/resolve-estateweb-location-job.interface';
import { buildAddressText } from './geocode-coordinates-job.service';

@Injectable()
export class ResolveEstateWebLocationJobService {
  private readonly logger = new Logger(ResolveEstateWebLocationJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleMapsService: GoogleMapsService,
  ) {}

  // Reverse-geocodes existing coordinates when present (cheaper/more reliable
  // ground truth than re-forward-geocoding scraped text), otherwise forward-geocodes
  // the same address text the coordinates job already builds. Either way we only read
  // the municipality out of the response -- lat/lng backfill is explicitly out of
  // scope for this job (handled separately by geocode-missing-coordinates).
  private async resolveGoogleMunicipality(fields: {
    latitude: unknown;
    longitude: unknown;
    address: string | null;
    district: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  }): Promise<string | null> {
    if (fields.latitude != null && fields.longitude != null) {
      const details = await this.googleMapsService.reverseGeocode(
        Number(fields.latitude),
        Number(fields.longitude),
      );
      return details?.municipality ?? null;
    }

    const addressText = buildAddressText(fields);
    if (!addressText) return null;

    const details = await this.googleMapsService.geocodeAddressDetailed(
      addressText,
    );
    return details?.municipality ?? null;
  }

  async processProperty(
    data: ResolveEstateWebLocationJobData,
  ): Promise<ResolveEstateWebLocationItemResult> {
    const property = await this.prisma.property.findUnique({
      where: { id: data.entity_id },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        address: true,
        district: true,
        city: true,
        postal_code: true,
        country: true,
        title: true,
        description: true,
        estateweb_location_id: true,
      },
    });

    if (!property) {
      return {
        entity_id: data.entity_id,
        status: 'failed',
        error: 'Property not found',
      };
    }

    try {
      const municipality = await this.resolveGoogleMunicipality(property);
      if (!municipality) {
        return {
          entity_id: data.entity_id,
          status: 'skipped',
          error: 'Google returned no municipality for this address',
        };
      }

      const resolved = resolveEstateWebLocationFromSources({
        city: property.city,
        district: property.district,
        title: property.title,
        description: property.description,
        googleMunicipality: municipality,
      });

      if (!resolved || resolved.id === property.estateweb_location_id) {
        return { entity_id: data.entity_id, status: 'unchanged' };
      }

      await this.prisma.property.update({
        where: { id: data.entity_id },
        data: { estateweb_location_id: resolved.id },
      });

      return { entity_id: data.entity_id, status: 'resolved' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { entity_id: data.entity_id, status: 'failed', error: message };
    }
  }

  async processUserProperty(
    data: ResolveEstateWebLocationJobData,
  ): Promise<ResolveEstateWebLocationItemResult> {
    const property = await this.prisma.userProperty.findFirst({
      where: { id: data.entity_id, user_id: data.user_id },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        address: true,
        district: true,
        city: true,
        postal_code: true,
        country: true,
        title: true,
        description: true,
        estateweb_location_id: true,
      },
    });

    if (!property) {
      return {
        entity_id: data.entity_id,
        status: 'failed',
        error: 'Property not found',
      };
    }

    try {
      const municipality = await this.resolveGoogleMunicipality(property);
      if (!municipality) {
        return {
          entity_id: data.entity_id,
          status: 'skipped',
          error: 'Google returned no municipality for this address',
        };
      }

      const resolved = resolveEstateWebLocationFromSources({
        city: property.city,
        district: property.district,
        title: property.title,
        description: property.description,
        googleMunicipality: municipality,
      });

      if (!resolved || resolved.id === property.estateweb_location_id) {
        return { entity_id: data.entity_id, status: 'unchanged' };
      }

      await this.prisma.userProperty.update({
        where: { id: data.entity_id },
        data: {
          estateweb_location_id: resolved.id,
          is_modified: true,
          pending_crm_update: true,
        },
      });

      return { entity_id: data.entity_id, status: 'resolved' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { entity_id: data.entity_id, status: 'failed', error: message };
    }
  }
}
