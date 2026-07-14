import {
  client,
  LISTING_TYPES,
  PROPERTY_TYPES,
  NORMALIZATION_BATCH_SIZE,
  NORMALIZATION_MODEL,
} from './config.js';
import { now } from './utils.js';
import { addUsage, emptyUsage } from './cost.js';

const STATIC_INSTRUCTIONS = `You are normalizing raw property listings scraped from a Greek real estate website into a structured database schema.

Return a JSON array with one object per input listing (same order, same length).

## Accepted enum values — use ONLY these exact strings:

listing_type: ${LISTING_TYPES.join(' | ')}
property_type: ${PROPERTY_TYPES.join(' | ')}

## Output schema per property (every field required, use null if unknown):

{
  "index": <same as input index>,
  "title": string (clean title: property type + size, no agency codes or extra whitespace),
  "description": string | null (1-3 sentence property description extracted from raw_description),
  "listing_type": ListingType,
  "property_type": PropertyType,
  "price": number | null (numeric value only, no symbols — "100.000€" → 100000, "450 €/μήνα" → 450),
  "city": string | null,
  "district": string | null,
  "address": string | null,
  "square_meters": number | null,
  "bedrooms": number | null,
  "bathrooms": number | null,
  "floor": string | null,
  "construction_year": number | null,
  "features": string[] | null (notable attributes like "sea view", "parking", "garden")
}

## Notes:
- The site is Greek. Infer listing_type from labels like "ΠΩΛΕΙΤΑΙ" (SALE), "ΕΝΟΙΚΙΑΖΕΤΑΙ" (RENT), "Αγγελία Προς Πώληση" (SALE), "Αγγελία Ενοικίασης" (RENT)
- raw_location may contain "Κωδικός <code>  <city>" — extract just the city name. raw_description has Υποπεριοχή (sub-region=city) and Γειτονιά (neighborhood=district) for more precise location
- Prices use Greek thousand separators: "100.000" = 100000, not 100
- description: extract a clean 1-3 sentence property description from raw_description text (strip navigation/label noise)
- city/district: prefer values from raw_description (Υποπεριοχή/Γειτονιά) over raw_location when available
- Return ONLY the JSON array, no prose`;

async function normalizeBatch(sourceProperties, usage) {
  const input = sourceProperties.map((sp, i) => ({
    index: i,
    source_url: sp.source_url,
    external_id: sp.external_id,
    raw_title: sp.raw_title,
    raw_price: sp.raw_price,
    raw_location: sp.raw_location,
    raw_description: sp.raw_description
      ? sp.raw_description.split('').filter(c => { const code = c.charCodeAt(0); return code >= 32 && code !== 127; }).join('').slice(0, 1200)
      : null,
  }));

  const dynamicInput = `## Input listings:\n${JSON.stringify(input, null, 2)}`;

  const response = await client.messages.create({
    model: NORMALIZATION_MODEL,
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: STATIC_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicInput },
      ],
    }],
  });
  addUsage(usage, response);

  const text = response.content.find(b => b.type === 'text')?.text ?? '';

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error(`AI returned no JSON array. Response: ${text.slice(0, 300)}`);

  try {
    return JSON.parse(arrayMatch[0]);
  } catch {
    const objectMatches = arrayMatch[0].match(/\{[\s\S]*?\}(?=\s*[,\]])/g);
    if (!objectMatches) throw new Error('Could not parse AI response as JSON');
    return objectMatches.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  }
}

export function buildPropertyRecord(n, sp) {
  const now_ = now();
  const allImages = sp.raw_data?.all_images ?? [];
  return {
    title: n.title ?? sp.raw_title ?? sp.source_url,
    description: n.description ?? null,
    listing_type: n.listing_type ?? 'UNKNOWN',
    property_type: n.property_type ?? 'UNKNOWN',
    status: 'ACTIVE',
    price: n.price ?? null,
    currency: 'EUR',
    city: n.city ?? null,
    district: n.district ?? null,
    address: n.address ?? null,
    postal_code: null,
    country: 'GR',
    latitude: null,
    longitude: null,
    square_meters: n.square_meters ?? null,
    bedrooms: n.bedrooms ?? null,
    bathrooms: n.bathrooms ?? null,
    floor: n.floor ?? null,
    construction_year: n.construction_year ?? null,
    renovation_year: null,
    features: n.features ?? null,
    images: allImages.length > 0 ? allImages : null,
    normalized_data: sp.raw_data,
    duplicate_group_id: null,
    created_at: now_,
    updated_at: now_,
  };
}

/**
 * Normalizes sourceProperties via AI and returns the raw per-property AI
 * output (not the built property record) so callers can cache it — the
 * caller is responsible for calling buildPropertyRecord with fresh sp data.
 */
export async function normalizeWithAI(sourceProperties) {
  const results = new Array(sourceProperties.length);
  const usage = emptyUsage();
  let failedCount = 0;

  for (let i = 0; i < sourceProperties.length; i += NORMALIZATION_BATCH_SIZE) {
    const batch = sourceProperties.slice(i, i + NORMALIZATION_BATCH_SIZE);
    const end = Math.min(i + batch.length, sourceProperties.length);
    process.stdout.write(`  Normalizing ${i + 1}–${end} of ${sourceProperties.length}...`);

    let normalized = null;
    try {
      normalized = await normalizeBatch(batch, usage);
    } catch (batchErr) {
      process.stdout.write(` batch failed (${batchErr.message.slice(0, 80)}), retrying individually...\n`);
      for (let j = 0; j < batch.length; j++) {
        const sp = batch[j];
        try {
          const [singleResult] = await normalizeBatch([sp], usage);
          results[i + j] = singleResult;
          process.stdout.write(`    [${i + j + 1}] ok\n`);
        } catch (singleErr) {
          failedCount++;
          console.error(`    [${i + j + 1}] FAILED (${sp.source_url}): ${singleErr.message.slice(0, 120)}`);
        }
      }
      continue;
    }

    for (const n of normalized) {
      if (n == null || n.index == null) continue;
      const sp = sourceProperties[i + n.index];
      if (!sp) continue;
      results[i + n.index] = n;
    }
    process.stdout.write(' done\n');
  }

  if (failedCount > 0) {
    console.log(`  Warning: ${failedCount} properties failed normalization and will be skipped`);
  }
  return { results, usage };
}
