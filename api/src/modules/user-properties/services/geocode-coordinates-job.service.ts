import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GoogleMapsService } from '@/shared/services/google-maps/google-maps.service';
import {
  GeocodeCoordinatesItemResult,
  GeocodeCoordinatesJobData,
} from '../interfaces/geocode-coordinates-job.interface';

function buildAddressText(fields: {
  address: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
}): string | null {
  const parts = [
    fields.address,
    fields.district,
    fields.city,
    fields.postal_code,
    fields.country,
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.length > 0 ? parts.join(', ') : null;
}

@Injectable()
export class GeocodeCoordinatesJobService {
  private readonly logger = new Logger(GeocodeCoordinatesJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleMapsService: GoogleMapsService,
  ) {}

  async processProperty(
    data: GeocodeCoordinatesJobData,
  ): Promise<GeocodeCoordinatesItemResult> {
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
      },
    });

    if (!property) {
      return {
        entity_id: data.entity_id,
        status: 'failed',
        error: 'Property not found',
      };
    }

    if (property.latitude != null && property.longitude != null) {
      return {
        entity_id: data.entity_id,
        status: 'skipped',
        error: 'Already has coordinates',
      };
    }

    const addressText = buildAddressText(property);
    if (!addressText) {
      return {
        entity_id: data.entity_id,
        status: 'skipped',
        error: 'No address data available',
      };
    }

    try {
      const location = await this.googleMapsService.geocodeAddress(addressText);
      if (!location) {
        return {
          entity_id: data.entity_id,
          status: 'skipped',
          error: `Google Maps found no match for "${addressText}"`,
        };
      }

      await this.prisma.property.update({
        where: { id: data.entity_id },
        data: { latitude: location.lat, longitude: location.lng },
      });

      return { entity_id: data.entity_id, status: 'geocoded' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { entity_id: data.entity_id, status: 'failed', error: message };
    }
  }

  async processUserProperty(
    data: GeocodeCoordinatesJobData,
  ): Promise<GeocodeCoordinatesItemResult> {
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
      },
    });

    if (!property) {
      return {
        entity_id: data.entity_id,
        status: 'failed',
        error: 'Property not found',
      };
    }

    if (property.latitude != null && property.longitude != null) {
      return {
        entity_id: data.entity_id,
        status: 'skipped',
        error: 'Already has coordinates',
      };
    }

    const addressText = buildAddressText(property);
    if (!addressText) {
      return {
        entity_id: data.entity_id,
        status: 'skipped',
        error: 'No address data available',
      };
    }

    try {
      const location = await this.googleMapsService.geocodeAddress(addressText);
      if (!location) {
        return {
          entity_id: data.entity_id,
          status: 'skipped',
          error: `Google Maps found no match for "${addressText}"`,
        };
      }

      await this.prisma.userProperty.update({
        where: { id: data.entity_id },
        data: {
          latitude: location.lat,
          longitude: location.lng,
          is_modified: true,
        },
      });

      return { entity_id: data.entity_id, status: 'geocoded' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { entity_id: data.entity_id, status: 'failed', error: message };
    }
  }
}
