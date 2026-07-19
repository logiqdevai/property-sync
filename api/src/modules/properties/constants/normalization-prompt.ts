import { buildEstateWebAiPropertyTypeCatalog } from '@/integrations/estateweb/constants/estateweb-ai-catalog.constants';
import { readDetailStructured } from '@/integrations/crawler/utils/crawler.utils';
import {
  DEFAULT_AI_RAW_DESCRIPTION_MAX_CHARS,
  LISTING_TYPES,
  PROPERTY_TYPES,
} from './normalization.constants';

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
  "title": string (preserve raw_title; only collapse extra whitespace and strip obvious agency codes/boilerplate — never invent a short type+size summary, never use description as title),
  "listing_type": ListingType,
  "property_type": PropertyType,
  "price": number | null (CURRENT asking/sale price only — numeric, no symbols: "100.000€" → 100000, "450 €/μήνα" → 450),
  "price_start": number | null (original list price BEFORE discount; must be >= price when both set; null if no prior/list price shown),
  "price_web": number | null (price shown on the public website; if not separately labeled, set equal to price — never leave null when price is known),
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
  "road": string | null (road access type exactly as shown, e.g. "Άσφαλτος", "Χωματόδρομος", "Πλακόστρωτο", "Όχι"),
  "heating": string | null (heating description as shown, e.g. "Ατομική - Φυσικό αέριο"),
  "video_url": string | null,
  "distance_airport": string | null,
  "distance_port": string | null,
  "distance_beach": string | null,
  "estateweb_type_id": number | null (leaf type id from the EstateWeb catalog above),
  "estateweb_location_id": number | null (leave null unless an EstateWeb numeric location id is explicitly present in raw data — the backend resolves it deterministically from city/district, so never guess),
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
- Discounted listings often show TWO prices (strikethrough old + current), e.g. "270.000 € 250.000 €", or "Τιμή: 250.000 €" in the description while raw_price still has the old figure. Rules:
  - price = the LOWER / current asking price (what the buyer pays now)
  - price_start = the HIGHER / original list price
  - price_web = the website display price (= price when only one public figure)
  - Never set price_start below price; if unsure which is current, prefer the value next to "Τιμή:" in raw_description / detail text over a lone higher raw_price
- Do NOT return a description field. The listing description is stored separately from the scrape; use raw_description only as a signal for other fields (city, district, features, price, etc.)
- title MUST come from raw_title (lightly cleaned). Never replace it with a generated "Διαμέρισμα 80 τ.μ." style summary, and never copy raw_description into title
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
  - "Δρόμος" → road
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

export function sanitizeRawDescription(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0);
      return (code >= 32 && code !== 127) || code === 10 || code === 9;
    })
    .join('')
    .replace(/\t/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}

function rawDescriptionForAi(
  text: string | null | undefined,
  maxChars: number,
): string | null {
  const cleaned = sanitizeRawDescription(text);
  if (!cleaned) return null;
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}…`;
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
  options?: { aiRawDescriptionMaxChars?: number },
): NormalizationInputRow[] {
  const maxChars =
    options?.aiRawDescriptionMaxChars ?? DEFAULT_AI_RAW_DESCRIPTION_MAX_CHARS;

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
      raw_description: rawDescriptionForAi(sp.raw_description, maxChars),
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

export function buildNormalizationDynamicPrompt(
  input: NormalizationInputRow[],
): string {
  return `## Input listings:\n${JSON.stringify(input, null, 2)}`;
}
