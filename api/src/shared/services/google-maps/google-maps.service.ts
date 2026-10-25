import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CostOperationType, IntegrationType, Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CostLogsService } from '@/modules/cost-logs/cost-logs.service';
import { PlatformConfigService } from '@/modules/platform-config/platform-config.service';

export interface GoogleGeocodeDetails {
    lat: number;
    lng: number;
    // Ordered broad-to-specific administrative/locality names from Google's response
    // (region/prefecture down to neighborhood). These line up 1:1 with individual path
    // segments in the EstateWeb location catalog often enough to be useful scoping
    // hints -- e.g. Google's administrative_area_level_3 "Θεσσαλονίκη" matches the
    // catalog's prefecture segment even though Google never spells out "Δήμος X" outside
    // Attica-style regions. Deliberately NOT limited to components literally prefixed
    // "Δήμος " -- that regex only ever matched Attica addresses (verified against real
    // geocoding responses for Thessaloniki/Crete, which return bare admin names with no
    // "Δήμος" word at all), so restricting to it left the vast majority of addresses with
    // no usable hint.
    adminSegments: string[];
    // Just the administrative_area_level_3 names -- in Greece that's the prefecture /
    // regional unit ("Λασίθι", "Κορινθία", "Περιφερειακή Ενότητα Πειραιώς"), unlike
    // adminSegments, where a locality can share a prefecture's name ("Ηράκλειο" Attica).
    prefectureSegments: string[];
    formattedAddress: string | null;
}

export type GoogleCallKind = 'geocode' | 'reverse_geocode' | 'timezone';

/** Who/what a Google call is for, so its cost_logs row can be attributed. */
export interface GoogleCallContext {
    userId?: string | null;
    userPropertyId?: string | null;
    // Free-text reason stored in cost_logs.metadata (e.g. 'resolve_estateweb_location').
    purpose?: string;
}

// Broad-to-specific: administrative hierarchy first (region/prefecture/municipality,
// whatever levels Google assigns for a given part of Greece), then locality/sublocality/
// neighborhood. Deliberately excludes street_number/route/postal_code/country/plus_code/
// premise/subpremise and POI-ish types (establishment, point_of_interest, ...) -- those
// are never path segments in the EstateWeb catalog.
const ADMIN_SEGMENT_TYPE_PRIORITY = [
    'administrative_area_level_1',
    'administrative_area_level_2',
    'administrative_area_level_3',
    'administrative_area_level_4',
    'administrative_area_level_5',
    'administrative_area_level_6',
    'administrative_area_level_7',
    'locality',
    'sublocality',
    'sublocality_level_1',
    'sublocality_level_2',
    'sublocality_level_3',
    'sublocality_level_4',
    'sublocality_level_5',
    'neighborhood',
];

// Admin boundaries barely change; this only bounds how stale a cached answer can get.
const GEOCODE_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
// Reverse-geocode cache cell: 3 decimals ~ 110 m. Hints are municipality/prefecture level, and
// scrapers often reuse one approximate point per area, so neighbours share one billed call.
const REVERSE_CACHE_DECIMALS = 3;

// Radius within which an already-cached reverse-geocode answer is reused without a new call.
// Agencies list in one town at a time and scrapers often reuse approximate points, so
// neighbouring listings share an answer. Kept small so municipality borders stay safe;
// answers reused this way are never written back as new rows (no drift chains).
const NEARBY_REUSE_RADIUS_M = 300;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLng = (bLng - aLng) * rad;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

@Injectable()
export class GoogleMapsService {

    private readonly apiKey: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly costLogs: CostLogsService,
        private readonly platformConfig: PlatformConfigService,
        private readonly prisma: PrismaService,
    ) {
        this.apiKey = this.configService.get('GOOGLE_MAPS_API_KEY');
    }

    // Google bills a request whenever it answers OK or ZERO_RESULTS; REQUEST_DENIED,
    // OVER_QUERY_LIMIT, INVALID_REQUEST and network failures are free but still logged (cost 0)
    // so quota/key problems are visible in the cost log. Never throws -- CostLogsService.record
    // already swallows DB errors, and a failed rate lookup must not break the Google call.
    private async recordCall(
        kind: GoogleCallKind,
        status: string,
        ctx: GoogleCallContext | undefined,
        extra: Record<string, unknown> = {},
    ): Promise<void> {
        try {
            const billed = status === 'OK' || status === 'ZERO_RESULTS';
            const rate = billed
                ? await this.platformConfig.getGoogleGeocodingCostPerRequest()
                : 0;
            await this.costLogs.record({
                userId: ctx?.userId ?? null,
                userPropertyId: ctx?.userPropertyId ?? null,
                operationType: CostOperationType.GEOCODING,
                provider: IntegrationType.GOOGLE_MAPS,
                model: kind,
                unitCount: 1,
                totalCost: rate,
                metadata: { status, purpose: ctx?.purpose ?? null, ...extra },
            });
        } catch {
            // best-effort logging only
        }
    }

    private async fetchJson(
        kind: GoogleCallKind,
        url: string,
        ctx?: GoogleCallContext,
    ): Promise<any> {
        let data: any;
        try {
            const res = await fetch(url);
            data = await res.json();
        } catch (error) {
            await this.recordCall(kind, 'NETWORK_ERROR', ctx, {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        await this.recordCall(kind, String(data?.status ?? 'UNKNOWN'), ctx, {
            ...(data?.error_message ? { error_message: data.error_message } : {}),
        });
        return data;
    }

    // Shares the forward-geocode cache/call with geocodeAddressDetailed, so a property that is
    // first geocoded for coordinates and then location-resolved from the same address text
    // costs one Google request instead of two.
    async geocodeAddress(
        address: string,
        ctx?: GoogleCallContext,
    ): Promise<{ lat: number; lng: number } | null> {
        const details = await this.geocodeAddressDetailed(address, ctx);
        return details ? { lat: details.lat, lng: details.lng } : null;
    }

    /** Forward geocode from free-text address, returning the full structured result
     * (including the Greek municipality) instead of just coordinates. */
    async geocodeAddressDetailed(
        address: string,
        ctx?: GoogleCallContext,
    ): Promise<GoogleGeocodeDetails | null> {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=el&key=${this.apiKey}`;
        const key = `f:${address.trim().toLowerCase().replace(/\s+/g, ' ')}`;
        return this.cachedGeocode(key, 'forward', () =>
            this.fetchAndParseGeocode('geocode', url, ctx),
        );
    }

    /** Reverse geocode from coordinates, returning the full structured result
     * (including the Greek municipality) instead of just an address string. */
    async reverseGeocode(
        lat: number,
        lng: number,
        ctx?: GoogleCallContext,
    ): Promise<GoogleGeocodeDetails | null> {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=el&key=${this.apiKey}`;
        const key = `r:${lat.toFixed(REVERSE_CACHE_DECIMALS)},${lng.toFixed(REVERSE_CACHE_DECIMALS)}`;
        return this.cachedGeocode(
            key,
            'reverse',
            () => this.fetchAndParseGeocode('reverse_geocode', url, ctx),
            { lat, lng },
        );
    }

    // Nearest still-fresh cached reverse answer within NEARBY_REUSE_RADIUS_M, if any. Real
    // answers only (a cached ZERO_RESULTS point says nothing about its neighbours).
    private async findNearbyReverse(
        lat: number,
        lng: number,
    ): Promise<GoogleGeocodeDetails | null> {
        try {
            const dLat = NEARBY_REUSE_RADIUS_M / 111_000;
            const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
            const rows = await this.prisma.geocodeCache.findMany({
                where: {
                    kind: 'reverse',
                    result: { not: Prisma.DbNull },
                    created_at: { gt: new Date(Date.now() - GEOCODE_CACHE_TTL_MS) },
                    lat: { gte: lat - dLat, lte: lat + dLat },
                    lng: { gte: lng - dLng, lte: lng + dLng },
                },
                take: 50,
            });
            let best: (typeof rows)[number] | null = null;
            let bestDist = Infinity;
            for (const row of rows) {
                if (row.lat == null || row.lng == null) continue;
                const dist = haversineMeters(lat, lng, row.lat, row.lng);
                if (dist <= NEARBY_REUSE_RADIUS_M && dist < bestDist) {
                    best = row;
                    bestDist = dist;
                }
            }
            if (!best) return null;
            void this.prisma.geocodeCache
                .update({
                    where: { id: best.id },
                    data: { hit_count: { increment: 1 }, last_hit_at: new Date() },
                })
                .catch(() => undefined);
            return best.result as unknown as GoogleGeocodeDetails;
        } catch {
            return null;
        }
    }

    // In-flight dedupe: concurrent workers asking for the same key share one Google request.
    private readonly inFlight = new Map<string, Promise<GoogleGeocodeDetails | null>>();

    // DB-backed cache around a Google lookup. Cache failures never break geocoding: a read or
    // write error just falls through to (or past) the live call. ZERO_RESULTS is cached as a
    // NULL result; thrown API errors (bad key, quota, ...) are never cached.
    private async cachedGeocode(
        key: string,
        kind: 'forward' | 'reverse',
        fetcher: () => Promise<GoogleGeocodeDetails | null>,
        coords?: { lat: number; lng: number },
    ): Promise<GoogleGeocodeDetails | null> {
        const pending = this.inFlight.get(key);
        if (pending) return pending;

        const run = (async () => {
            try {
                const row = await this.prisma.geocodeCache.findUnique({
                    where: { cache_key: key },
                });
                if (row && Date.now() - row.created_at.getTime() < GEOCODE_CACHE_TTL_MS) {
                    void this.prisma.geocodeCache
                        .update({
                            where: { id: row.id },
                            data: { hit_count: { increment: 1 }, last_hit_at: new Date() },
                        })
                        .catch(() => undefined);
                    return (row.result as unknown as GoogleGeocodeDetails | null) ?? null;
                }
            } catch {
                // cache read failed -- fall through to the live call
            }

            if (coords) {
                const near = await this.findNearbyReverse(coords.lat, coords.lng);
                if (near) return near;
            }

            const details = await fetcher();

            try {
                const result = details
                    ? (details as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull;
                await this.prisma.geocodeCache.upsert({
                    where: { cache_key: key },
                    create: {
                        cache_key: key,
                        kind,
                        lat: coords?.lat ?? null,
                        lng: coords?.lng ?? null,
                        result,
                    },
                    update: {
                        result,
                        lat: coords?.lat ?? null,
                        lng: coords?.lng ?? null,
                        created_at: new Date(),
                    },
                });
            } catch {
                // cache write failed (e.g. concurrent insert) -- the answer is still valid
            }
            return details;
        })().finally(() => this.inFlight.delete(key));

        this.inFlight.set(key, run);
        return run;
    }

    private async fetchAndParseGeocode(
        kind: GoogleCallKind,
        url: string,
        ctx?: GoogleCallContext,
    ): Promise<GoogleGeocodeDetails | null> {
        const data = await this.fetchJson(kind, url, ctx);

        if (data.status === 'ZERO_RESULTS') {
            return null;
        }

        if (data.status !== 'OK' || !data.results?.[0]) {
            throw new Error(
                `Geocoding API error: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`,
            );
        }

        const results: Array<{
            geometry: { location: { lat: number; lng: number } };
            formatted_address?: string;
            address_components?: Array<{ long_name: string; types: string[] }>;
        }> = data.results;
        const result = results[0];
        const { lat, lng } = result.geometry.location;

        // Reverse geocoding spreads the admin hierarchy across SEPARATE top-level result
        // entries rather than nesting it all in results[0].address_components -- e.g. for
        // an Attica address, "Δήμος Φιλοθέης-Ψυχικού" (administrative_area_level_4) only
        // appears in a later result entry (its own minimal {admin_level_4, country} pair),
        // never inside the precise street-address result. Must merge components across
        // every result entry, or the exact case this hint was built for goes right back to
        // having no usable municipality segment (verified against the real API response).
        const components = results.flatMap((r) => r.address_components ?? []);

        const adminSegments: string[] = [];
        for (const type of ADMIN_SEGMENT_TYPE_PRIORITY) {
            for (const component of components) {
                if (
                    component.types.includes(type) &&
                    !adminSegments.includes(component.long_name)
                ) {
                    adminSegments.push(component.long_name);
                }
            }
        }

        const prefectureSegments = [
            ...new Set(
                components
                    .filter((component) => component.types.includes('administrative_area_level_3'))
                    .map((component) => component.long_name),
            ),
        ];

        return {
            lat,
            lng,
            adminSegments,
            prefectureSegments,
            formattedAddress: result.formatted_address ?? null,
        };
    }

    async getTimezone(lat: number, lng: number, ctx?: GoogleCallContext) {

        try {

            const timestamp = Math.floor(Date.now() / 1000);

            const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${this.apiKey}`;

            const data = await this.fetchJson('timezone', url, ctx);

            return {
                timeZoneId: data.timeZoneId, // e.g. "Europe/Athens"
                timeZoneName: data.timeZoneName, // e.g. "Eastern European Summer Time"
                rawOffset: data.rawOffset, // offset from UTC in seconds
                dstOffset: data.dstOffset, // daylight savings offset in seconds
            };
        } catch (error) {
            console.log(error);
            throw new InternalServerErrorException(error.message);
        }
    }

}
