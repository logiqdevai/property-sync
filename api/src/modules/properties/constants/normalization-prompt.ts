import { buildEstateWebAiPropertyTypeCatalog } from '@/integrations/estateweb/constants/estateweb-ai-catalog.constants';
import { readDetailStructured } from '@/integrations/crawler/utils/crawler.utils';
import { LISTING_TYPES, PROPERTY_TYPES } from './normalization.constants';

function buildEstateWebTypeCatalogJson(): string {
  const leafTypes = buildEstateWebAiPropertyTypeCatalog()
    .filter((entry) => entry.is_leaf)
    .map((entry) => ({ id: entry.id, path: entry.path }));

  return JSON.stringify(leafTypes);
}

export const NORMALIZATION_STATIC_INSTRUCTIONS = `You are normalizing raw property listings scraped from a Greek real estate website into a structured database schema aligned with EstateWeb CMS payloads.

Return a JSON array with one object per input listing (same order, same length).

## Accepted enum values — use ONLY these exact strings:

listing_type: ${LISTING_TYPES.join(' | ')}
property_type: ${PROPERTY_TYPES.join(' | ')}

## EstateWeb leaf property types (pick estateweb_type_id from this list when confident):

${buildEstateWebTypeCatalogJson()}

## Output schema per property (every field required, use null if unknown):

{
  "index": <same as input index>,
  "title": string (clean title: property type + size, no agency codes or extra whitespace),
  "description": string | null (1-3 sentence property description extracted from raw_description),
  "listing_type": ListingType,
  "property_type": PropertyType,
  "price": number | null (numeric value only, no symbols — "100.000€" → 100000, "450 €/μήνα" → 450),
  "price_start": number | null (original/list price before discount when visible),
  "price_web": number | null (web display price when different from price),
  "city": string | null,
  "district": string | null,
  "address": string | null,
  "postal_code": string | null,
  "latitude": number | null,
  "longitude": number | null,
  "square_meters": number | null,
  "bedrooms": number | null,
  "bathrooms": number | null,
  "floor": string | null,
  "construction_year": number | null,
  "renovation_year": number | null,
  "energy_class": string | null (energy performance rating exactly as shown, e.g. "Α+", "Β", "Δεν απαιτείται"),
  "heating": string | null (heating description as shown, e.g. "Ατομική - Φυσικό αέριο"),
  "video_url": string | null,
  "distance_airport": string | null,
  "distance_port": string | null,
  "distance_beach": string | null,
  "estateweb_type_id": number | null (leaf type id from the EstateWeb catalog above),
  "estateweb_location_id": number | null (only when explicitly present in raw data),
  "cms_fields": [{ "id": number, "value": string | number }] | null (EstateWeb custom fields; booleans as "1", select fields as numeric option id),
  "cms_metadata": {
    "guarantee": string | null,
    "stamp": string | null,
    "inc_type": number | null,
    "inc_value": string | null,
    "inc_period": number | null,
    "inc_2years": string | null,
    "contract_period": string | null,
    "terms": string | null,
    "has_keys": string | null
  } | null,
  "features": string[] | null (notable attributes like "sea view", "parking", "garden")
}

## Notes:
- The site is Greek. Infer listing_type from labels like "ΠΩΛΕΙΤΑΙ" (SALE), "ΕΝΟΙΚΙΑΖΕΤΑΙ" (RENT), "Αγγελία Προς Πώληση" (SALE), "Αγγελία Ενοικίασης" (RENT)
- raw_location may contain "Κωδικός <code>  <city>" — extract just the city name. raw_description has Υποπεριοχή (sub-region=city) and Γειτονιά (neighborhood=district) for more precise location
- Prices use Greek thousand separators: "100.000" = 100000, not 100
- description: write a complete, clean property description from raw_description text (cover layout, condition, amenities). Strip agency contact info, legal boilerplate, phone/email/address and navigation noise. Do not truncate mid-sentence.
- city/district: prefer values from raw_description (Υποπεριοχή/Γειτονιά) over raw_location when available
- cms_metadata is mainly for rentals (guarantee, income terms, contract period, has_keys)
- Only include cms_fields entries you are confident about; omit unknown custom fields
- Return ONLY the JSON array, no prose

## Structured detail data (HIGHEST PRIORITY):
- detail_specs is a label→value map scraped directly from the listing's spec table. detail_features is a list of amenity labels. When present, these are the GROUND TRUTH — trust them over any numbers mentioned in prose (raw_description/raw_title), which are often outdated or approximate.
- Map Greek spec labels to schema fields:
  - "Δωμάτια" / "Υπνοδωμάτια" → bedrooms
  - "Μπάνιο"/"Μπάνια" and "WC" → bathrooms = sum of both (e.g. Μπάνιο:1 + WC:1 → 2)
  - "Εμβαδόν" / "Επιφάνεια" / "τ.μ." → square_meters
  - "Όροφος" → floor
  - "Έτος κατασκευής" → construction_year (prefer this over "κατασκευασμένη το <year>" in prose)
  - "Ενεργειακή κλάση" → energy_class
  - "Θέρμανση" → heating
- If a spec label and the prose disagree, use the spec value.
- Populate features from detail_features plus notable amenities in the spec table/prose; keep them concise (e.g. "parking", "elevator", "storage", "fireplace", "security door", "air conditioning").
- Fall back to raw_property_type, raw_listing_type, raw_sqm, raw_bedrooms, raw_bathrooms only when the structured data is absent.`;

export interface NormalizationInputRow {
  index: number;
  source_url: string;
  property_id: string;
  internal_id: string | null;
  raw_title: string | null;
  raw_price: string | null;
  raw_location: string | null;
  raw_description: string | null;
  raw_property_type: string | null;
  raw_listing_type: string | null;
  raw_sqm: string | null;
  raw_bedrooms: string | null;
  raw_bathrooms: string | null;
  detail_specs: Record<string, string> | null;
  detail_features: string[] | null;
}

export function buildNormalizationInput(
  sourceProperties: Array<{
    source_url: string;
    property_id: string;
    internal_id: string | null;
    raw_title: string | null;
    raw_price: string | null;
    raw_location: string | null;
    raw_description: string | null;
    raw_property_type?: string | null;
    raw_listing_type?: string | null;
    raw_sqm?: string | null;
    raw_bedrooms?: string | null;
    raw_bathrooms?: string | null;
    raw_data?: unknown;
  }>,
): NormalizationInputRow[] {
  return sourceProperties.map((sp, i) => {
    const { specs, features } = readDetailStructured(sp.raw_data);
    return {
      index: i,
      source_url: sp.source_url,
      property_id: sp.property_id,
      internal_id: sp.internal_id,
      raw_title: sp.raw_title,
      raw_price: sp.raw_price,
      raw_location: sp.raw_location,
      raw_description: sp.raw_description
        ? sp.raw_description
            .split('')
            .filter((c) => {
              const code = c.charCodeAt(0);
              return code >= 32 && code !== 127;
            })
            .join('')
            .slice(0, 2500)
        : null,
      raw_property_type: sp.raw_property_type ?? null,
      raw_listing_type: sp.raw_listing_type ?? null,
      raw_sqm: sp.raw_sqm ?? null,
      raw_bedrooms: sp.raw_bedrooms ?? null,
      raw_bathrooms: sp.raw_bathrooms ?? null,
      detail_specs: specs,
      detail_features: features,
    };
  });
}

export function buildNormalizationDynamicPrompt(input: NormalizationInputRow[]): string {
  return `## Input listings:\n${JSON.stringify(input, null, 2)}`;
}
