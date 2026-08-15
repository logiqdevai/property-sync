import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
