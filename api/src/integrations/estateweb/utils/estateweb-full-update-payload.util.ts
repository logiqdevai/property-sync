import {
  EstateWebPropertyFieldValue,
  EstateWebPropertyResponse,
  EstateWebPropertySite,
  EstateWebUpdatePropertyPayload,
} from '../interfaces/estateweb-property.interface';
import { EstateWebFieldType } from '../constants/estateweb-enums.constants';
import { getEstateWebInitField } from './estateweb-init-lookup.util';

/**
 * EstateWeb's PATCH /api/property/:id is NOT a true partial patch -- fields like
 * price/description/lat_lng/metadata/ads/sites are reset to defaults if omitted, while
 * images/notes/fields/foreign_agents are preserved regardless. Confirmed via a live
 * test-and-restore incident. So every update must round-trip the FULL current record and
 * only change the fields actually intended to change (here: `sites`).
 */
export function buildEstateWebFullUpdatePayload(
  current: EstateWebPropertyResponse,
  sites: EstateWebPropertySite[],
): EstateWebUpdatePropertyPayload {
  return {
    id: current.id,
    type_id: current.type_id,
    scope_id: current.scope_id,
    location_id: current.location_id,
    client_id: current.client_id ?? undefined,
    coop_id: current.coop_id ?? undefined,
    to_client_id: current.to_client_id ?? undefined,
    code: current.code ?? '',
    address: current.address ?? '',
    zip: current.zip ?? '',
    price_start: current.price_start ?? 0,
    price: current.price ?? 0,
    price_final: current.price_final ?? 0,
    price_web: current.price_web ?? 0,
    sqm: current.sqm ?? 0,
    distance_airport: current.distance_airport ?? '',
    distance_port: current.distance_port ?? '',
    distance_beach: current.distance_beach ?? '',
    description: current.description ?? '',
    status_id: current.status_id,
    is_offer: current.is_offer ? 1 : 0,
    is_exclusive_order: current.is_exclusive_order ? 1 : 0,
    video_url: current.video_url ?? '',
    show_video_on_site: current.show_video_on_site ? 1 : 0,
    lat_lng: current.lat_lng ?? '',
    show_map_on_site: current.show_map_on_site ? 1 : 0,
    metadata: JSON.stringify(current.metadata ?? {}),
    client_contacted_at: current.client_contacted_at ?? '',
    expires_at: current.expires_at ?? '',
    fields: (current.fields ?? [])
      .map((field) => {
        const definition = getEstateWebInitField(field.field_id);
        if (!definition) return null;
        if (definition.type_id === EstateWebFieldType.SELECT) {
          return { id: field.field_id, value: Number(field.value) };
        }
        return { id: field.field_id, value: field.value };
      })
      .filter((field): field is EstateWebPropertyFieldValue => field !== null),
    sites: sites.map((site) => ({ ...site, selected: true })),
    gateways: [],
    ads: current.ads ?? [],
    foreign_agents: current.foreign_agents ?? [],
    notes: [],
    price_negotiable: current.price_negotiable ? 1 : 0,
  } as EstateWebUpdatePropertyPayload;
}
