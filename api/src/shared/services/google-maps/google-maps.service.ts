import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
    formattedAddress: string | null;
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

@Injectable()
export class GoogleMapsService {

    private readonly apiKey: string;

    constructor(private readonly configService: ConfigService) {
        this.apiKey = this.configService.get('GOOGLE_MAPS_API_KEY');
    }

    async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {

        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.apiKey}`;

        const res = await fetch(url);
        const data = await res.json();

        // ZERO_RESULTS means Google genuinely has no match for this address -- a normal, silent
        // "skip". Any other non-OK status (REQUEST_DENIED, OVER_QUERY_LIMIT, INVALID_REQUEST, ...)
        // is a real problem and must NOT be swallowed the same way, or every geocoding failure
        // looks identical to "no address match" with zero visibility into what actually broke.
        if (data.status === 'ZERO_RESULTS') {
            return null;
        }

        if (data.status !== 'OK' || !data.results?.[0]) {
            throw new Error(
                `Geocoding API error: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`,
            );
        }

        const { lat, lng } = data.results[0].geometry.location;
        return { lat, lng };
    }

    /** Forward geocode from free-text address, returning the full structured result
     * (including the Greek municipality) instead of just coordinates. */
    async geocodeAddressDetailed(address: string): Promise<GoogleGeocodeDetails | null> {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=el&key=${this.apiKey}`;
        return this.fetchAndParseGeocode(url);
    }

    /** Reverse geocode from coordinates, returning the full structured result
     * (including the Greek municipality) instead of just an address string. */
    async reverseGeocode(lat: number, lng: number): Promise<GoogleGeocodeDetails | null> {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=el&key=${this.apiKey}`;
        return this.fetchAndParseGeocode(url);
    }

    private async fetchAndParseGeocode(url: string): Promise<GoogleGeocodeDetails | null> {
        const res = await fetch(url);
        const data = await res.json();

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

        return {
            lat,
            lng,
            adminSegments,
            formattedAddress: result.formatted_address ?? null,
        };
    }

    async getTimezone(lat: number, lng: number) {

        try {

            const timestamp = Math.floor(Date.now() / 1000);

            const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${this.apiKey}`;

            const res = await fetch(url);
            const data = await res.json();

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
