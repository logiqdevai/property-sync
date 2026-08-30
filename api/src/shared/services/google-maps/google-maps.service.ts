import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GoogleGeocodeDetails {
    lat: number;
    lng: number;
    // The Greek municipality ("Δήμος X") if Google's response includes one --
    // this is the string that lines up 1:1 with a path segment in the EstateWeb
    // location catalog (verified against real geocoding responses), regardless
    // of which administrative_area_level Google happens to assign it in a given
    // region (it is NOT consistently level 3 or level 4 across Greece).
    municipality: string | null;
    locality: string | null;
    formattedAddress: string | null;
}

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

        const result = data.results[0];
        const { lat, lng } = result.geometry.location;
        const components: Array<{ long_name: string; types: string[] }> =
            result.address_components ?? [];

        // Search every component regardless of its administrative_area_level_N --
        // that number is not stable across regions (e.g. it's level 4 in Attica),
        // whereas "Δήμος " as a long_name prefix reliably identifies the Greek
        // municipality node wherever Google places it in the hierarchy.
        const municipality =
            components.find((c) => /^Δήμος\s/.test(c.long_name))?.long_name ?? null;
        const locality =
            components.find((c) => c.types.includes('locality'))?.long_name ?? null;

        return {
            lat,
            lng,
            municipality,
            locality,
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
