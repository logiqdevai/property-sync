import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  GoogleCallContext,
  GoogleMapsService,
} from '@/shared/services/google-maps/google-maps.service';
import { resolveEstateWebLocationFromSources } from '@/integrations/estateweb/utils/estateweb-location-lookup.util';
import {
  ResolveEstateWebLocationItemResult,
  ResolveEstateWebLocationJobData,
} from '../interfaces/resolve-estateweb-location-job.interface';
import { buildAddressText } from './geocode-coordinates-job.service';

type LocationInputs = {
  latitude: unknown;
  longitude: unknown;
  address: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
};

const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * True when a UserProperty still carries exactly the location fields of the canonical
 * Property it was copied from (no per-user truncation/edit). In that case it has the same
 * Google input as the canonical row, so it must inherit the canonical's resolved
 * estateweb_location_id instead of being resolved a second time.
 */
export function sameLocationInputs(a: LocationInputs, b: LocationInputs): boolean {
  return (
    num(a.latitude) === num(b.latitude) &&
    num(a.longitude) === num(b.longitude) &&
    (a.address ?? null) === (b.address ?? null) &&
    (a.district ?? null) === (b.district ?? null) &&
    (a.city ?? null) === (b.city ?? null) &&
    (a.postal_code ?? null) === (b.postal_code ?? null) &&
    (a.country ?? null) === (b.country ?? null)
  );
}

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
  // admin/locality names out of the response -- lat/lng backfill is explicitly out of
  // scope for this job (handled separately by geocode-missing-coordinates).
  //
  // The property's canonical Property.id -- resolves the SourceAgency.city of its
  // (primary, or otherwise first-linked) source. A canonical Property can in principle be
  // backed by more than one SourceProperty/agency (see the SourceAgency -> Scraper ->
  // CrawlRun -> SourceProperty -> Property comment on the schema); is_primary_source picks
  // a single, stable one to scope by. Returns null when the agency has no city set (or the
  // property somehow has no source link at all), which leaves resolution unscoped, exactly
  // as before this feature existed.
  private async resolveAgencyCity(propertyId: string): Promise<string | null> {
    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: propertyId },
      orderBy: [{ is_primary_source: 'desc' }, { created_at: 'asc' }],
      select: {
        source_property: { select: { source_agency: { select: { city: true } } } },
      },
    });
    return link?.source_property.source_agency.city ?? null;
  }

  // Returns [] (not an error) when Google has nothing usable -- ZERO_RESULTS, or a
  // result with no admin/locality components -- so the resolver still runs on the
  // property's own city/district/title/description below instead of being skipped
  // outright. Only a real Google API error (bad key, quota, ...) should fail the item.
  private async resolveGoogleAddressSegments(fields: {
    latitude: unknown;
    longitude: unknown;
    address: string | null;
    district: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  }, ctx: GoogleCallContext): Promise<{ segments: string[]; coordinatePrefectures: string[] }> {
    if (fields.latitude != null && fields.longitude != null) {
      const details = await this.googleMapsService.reverseGeocode(
        Number(fields.latitude),
        Number(fields.longitude),
        ctx,
      );
      return {
        segments: details?.adminSegments ?? [],
        coordinatePrefectures: details?.prefectureSegments ?? [],
      };
    }

    const addressText = buildAddressText(fields);
    if (!addressText) return { segments: [], coordinatePrefectures: [] };

    const details = await this.googleMapsService.geocodeAddressDetailed(
      addressText,
      ctx,
    );
    // Forward-geocoding ambiguous text can merge several homonyms' regions (root cause #11),
    // so it never yields a hard prefecture constraint.
    return { segments: details?.adminSegments ?? [], coordinatePrefectures: [] };
  }

  // Hands a canonical Property's freshly resolved id to every UserProperty copy that has the
  // same location inputs and has not diverged (id still null, or still the canonical's old id),
  // so user rows never trigger their own Google lookup for the same listing.
  private async propagateToUserProperties(
    property: LocationInputs & { id: string },
    resolvedId: number,
    previousId: number | null,
  ): Promise<void> {
    const rows = await this.prisma.userProperty.findMany({
      where: {
        canonical_property_id: property.id,
        OR: [
          { estateweb_location_id: null },
          ...(previousId != null ? [{ estateweb_location_id: previousId }] : []),
        ],
        NOT: { estateweb_location_id: resolvedId },
      },
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
    const ids = rows.filter((row) => sameLocationInputs(row, property)).map((row) => row.id);
    if (ids.length === 0) return;
    await this.prisma.userProperty.updateMany({
      where: { id: { in: ids } },
      data: {
        estateweb_location_id: resolvedId,
        is_modified: true,
        pending_crm_update: true,
      },
    });
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
      const [google, agencyCity] = await Promise.all([
        this.resolveGoogleAddressSegments(property, {
          purpose: 'resolve_estateweb_location',
        }),
        this.resolveAgencyCity(property.id),
      ]);

      const resolved = resolveEstateWebLocationFromSources({
        city: property.city,
        district: property.district,
        title: property.title,
        description: property.description,
        googleAddressSegments: google.segments,
        googleCoordinatePrefectures: google.coordinatePrefectures,
        agencyCity,
      });

      if (!resolved) {
        return { entity_id: data.entity_id, status: 'skipped', title: property.title };
      }
      if (resolved.id === property.estateweb_location_id) {
        await this.propagateToUserProperties(property, resolved.id, property.estateweb_location_id);
        return { entity_id: data.entity_id, status: 'unchanged', title: property.title };
      }

      await this.prisma.property.update({
        where: { id: data.entity_id },
        data: { estateweb_location_id: resolved.id },
      });
      await this.propagateToUserProperties(property, resolved.id, property.estateweb_location_id);

      return { entity_id: data.entity_id, status: 'resolved', title: property.title };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        entity_id: data.entity_id,
        status: 'failed',
        title: property.title,
        error: message,
      };
    }
  }

  async processUserProperty(
    data: ResolveEstateWebLocationJobData,
  ): Promise<ResolveEstateWebLocationItemResult> {
    const property = await this.prisma.userProperty.findFirst({
      where: { id: data.entity_id, user_id: data.user_id },
      select: {
        id: true,
        canonical_property_id: true,
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
      // Same Google input as the canonical Property => reuse its answer, no second resolution.
      const canonical = await this.prisma.property.findUnique({
        where: { id: property.canonical_property_id },
        select: {
          latitude: true,
          longitude: true,
          address: true,
          district: true,
          city: true,
          postal_code: true,
          country: true,
          estateweb_location_id: true,
        },
      });
      if (
        canonical?.estateweb_location_id != null &&
        sameLocationInputs(property, canonical)
      ) {
        if (canonical.estateweb_location_id === property.estateweb_location_id) {
          return { entity_id: data.entity_id, status: 'unchanged', title: property.title };
        }
        await this.prisma.userProperty.update({
          where: { id: data.entity_id },
          data: {
            estateweb_location_id: canonical.estateweb_location_id,
            is_modified: true,
            pending_crm_update: true,
          },
        });
        return { entity_id: data.entity_id, status: 'resolved', title: property.title };
      }

      const [google, agencyCity] = await Promise.all([
        this.resolveGoogleAddressSegments(property, {
          userId: data.user_id,
          userPropertyId: property.id,
          purpose: 'resolve_estateweb_location',
        }),
        this.resolveAgencyCity(property.canonical_property_id),
      ]);

      const resolved = resolveEstateWebLocationFromSources({
        city: property.city,
        district: property.district,
        title: property.title,
        description: property.description,
        googleAddressSegments: google.segments,
        googleCoordinatePrefectures: google.coordinatePrefectures,
        agencyCity,
      });

      if (!resolved) {
        return { entity_id: data.entity_id, status: 'skipped', title: property.title };
      }
      if (resolved.id === property.estateweb_location_id) {
        return { entity_id: data.entity_id, status: 'unchanged', title: property.title };
      }

      await this.prisma.userProperty.update({
        where: { id: data.entity_id },
        data: {
          estateweb_location_id: resolved.id,
          is_modified: true,
          pending_crm_update: true,
        },
      });

      return { entity_id: data.entity_id, status: 'resolved', title: property.title };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        entity_id: data.entity_id,
        status: 'failed',
        title: property.title,
        error: message,
      };
    }
  }
}
