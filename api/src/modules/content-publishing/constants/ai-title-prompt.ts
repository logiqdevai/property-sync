import { ContentLanguage } from 'generated/prisma';

export type AiTitlePropertyFacts = {
  district?: string | null;
  city?: string | null;
  listing_type?: string | null;
  square_meters?: string | number | null;
  property_type?: string | null;
};

const LANGUAGE_LABEL: Record<ContentLanguage, string> = {
  EL: 'Greek',
  EN: 'English',
  DE: 'German',
  FR: 'French',
  IT: 'Italian',
  RU: 'Russian',
};

const SQUARE_METERS_UNIT: Record<ContentLanguage, string> = {
  EL: 'τ.μ.',
  EN: 'sq.m.',
  DE: 'm²',
  FR: 'm²',
  IT: 'sq.m.',
  RU: 'м²',
};

export const AI_TITLE_SYSTEM_PROMPT = `You are a real-estate marketing copywriter.
You receive an original property listing, structured facts, a writing language, and a list of numbered slots.
Return exactly one distinct marketing title per numbered slot.
JSON keys are INTEGERS (1, 2, 3 ...). They are NOT language codes.
Write EVERY title value in the WRITING LANGUAGE specified in the user message.
Each title must be meaningfully different from the others (different angle / phrasing).
HARD RULE: Every title for EVERY slot must include the exact square_meters number when it is not "(none)" (e.g. "100 sq.m." / "100 τ.μ."). Do not omit size from any slot.
Every title MUST also include all other provided facts that are not "(none)": district, city, listing_type, property_type.
Rewrite and optimize for clarity and appeal while keeping those facts accurate.
Do not invent amenities, features, or claims not present in the source.
Return ONLY valid JSON with this shape: {"titles":{"1":"...","2":"...",...}}`;

export const AI_TITLE_MULTI_PROPERTY_SYSTEM_PROMPT = `You are a real-estate marketing copywriter.
You receive multiple property listings and a writing language.
For each property id, produce one distinct marketing title per numbered slot.
JSON outer keys are property ids. Inner keys are INTEGERS (1, 2, 3 ...). They are NOT language codes.
Write EVERY title value in the WRITING LANGUAGE specified in the user message.
Titles for different slots on the same property must be meaningfully different (different angle / phrasing).
HARD RULE: Every title for EVERY slot must include the exact square_meters number when it is not "(none)" (e.g. "100 sq.m." / "100 τ.μ."). Do not omit size from any slot.
Every title MUST also include all other provided facts that are not "(none)": district, city, listing_type, property_type.
Rewrite and optimize for clarity and appeal while keeping those facts accurate.
Do not invent amenities, features, or claims not present in the source.
Return ONLY valid JSON with this shape:
{"properties":{"<propertyId>":{"1":"...","2":"..."},"<propertyId2>":{"1":"...","2":"..."}}}`;

export const AI_TITLE_MULTI_PROPERTY_CHUNK_SIZE = 10;

function formatFactValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '(none)';
  const text = String(value).trim();
  return text || '(none)';
}

export function formatAiTitlePropertyFacts(
  facts: AiTitlePropertyFacts,
): string[] {
  return [
    `district: ${formatFactValue(facts.district)}`,
    `city: ${formatFactValue(facts.city)}`,
    `listing_type: ${formatFactValue(facts.listing_type)}`,
    `square_meters: ${formatFactValue(facts.square_meters)}`,
    `property_type: ${formatFactValue(facts.property_type)}`,
  ];
}

export function extractSquareMetersInteger(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '(none)') return null;
  const match = text.replace(',', '.').match(/\d+/);
  return match?.[0] ?? null;
}

export function titleIncludesSquareMeters(
  title: string,
  squareMeters: string | number | null | undefined,
): boolean {
  const size = extractSquareMetersInteger(squareMeters);
  if (!size) return true;
  return new RegExp(`(?<!\\d)${size}(?:[.,]\\d+)?(?!\\d)`).test(title);
}

export function ensureTitleIncludesSquareMeters(
  title: string,
  facts: AiTitlePropertyFacts,
  writingLanguage: ContentLanguage,
): string {
  const size = extractSquareMetersInteger(facts.square_meters);
  if (!size || titleIncludesSquareMeters(title, facts.square_meters)) {
    return title;
  }
  const unit = SQUARE_METERS_UNIT[writingLanguage];
  const trimmed = title.replace(/[.!?\s]+$/u, '').trim();
  return `${trimmed} ${size} ${unit}`;
}

export function ensureTitlesIncludeSquareMeters(
  titles: Partial<Record<ContentLanguage, string>>,
  facts: AiTitlePropertyFacts,
  writingLanguage: ContentLanguage,
): Partial<Record<ContentLanguage, string>> {
  const out: Partial<Record<ContentLanguage, string>> = {};
  for (const [lang, title] of Object.entries(titles)) {
    if (!title?.trim()) continue;
    out[lang as ContentLanguage] = ensureTitleIncludesSquareMeters(
      title,
      facts,
      writingLanguage,
    );
  }
  return out;
}

export function buildAiTitleUserPrompt(input: {
  sourceLanguage: ContentLanguage;
  targetLanguages: ContentLanguage[];
  writingLanguage: ContentLanguage;
  title: string;
  description: string | null | undefined;
  facts: AiTitlePropertyFacts;
  familyInstructions?: string | null;
}): string {
  const label = LANGUAGE_LABEL[input.writingLanguage];
  const slots = input.targetLanguages.map((_, i) => String(i + 1));
  const size = extractSquareMetersInteger(input.facts.square_meters);
  const lines = [
    `WRITING LANGUAGE: ${input.writingLanguage} = ${label}`,
    `Write ALL title values in ${label}. Do not use any other language.`,
    `Slots: ${slots.join(', ')} (produce exactly ${slots.length} different ${label} titles)`,
    `Source language of original listing: ${input.sourceLanguage}`,
    `Original title: ${input.title}`,
    `Original description: ${input.description?.trim() || '(none)'}`,
    'Property facts (include all non-(none) values in EVERY title / EVERY slot):',
    ...formatAiTitlePropertyFacts(input.facts).map((line) => `  ${line}`),
  ];
  if (size) {
    lines.push(
      `MANDATORY: every slot title must contain the size number ${size} (with a unit such as ${SQUARE_METERS_UNIT[input.writingLanguage]}).`,
    );
  }
  if (input.familyInstructions?.trim()) {
    lines.push(`Additional instructions: ${input.familyInstructions.trim()}`);
  }
  return lines.join('\n');
}

export function buildAiTitleMultiPropertyUserPrompt(input: {
  sourceLanguage: ContentLanguage;
  targetLanguages: ContentLanguage[];
  writingLanguage: ContentLanguage;
  items: Array<{
    userPropertyId: string;
    title: string;
    description: string | null | undefined;
    facts: AiTitlePropertyFacts;
  }>;
  familyInstructions?: string | null;
}): string {
  const label = LANGUAGE_LABEL[input.writingLanguage];
  const slots = input.targetLanguages.map((_, i) => String(i + 1));
  const lines = [
    `WRITING LANGUAGE: ${input.writingLanguage} = ${label}`,
    `Write ALL title values in ${label}. Do not use any other language.`,
    `Slots: ${slots.join(', ')} (produce exactly ${slots.length} different ${label} titles per property)`,
    `MANDATORY: for every property and every slot, include that property's square_meters number in the title when it is not (none).`,
    `Source language of original listings: ${input.sourceLanguage}`,
    `Property count: ${input.items.length}`,
    'Properties:',
  ];

  for (const item of input.items) {
    lines.push(
      `- id=${item.userPropertyId}`,
      `  title: ${item.title}`,
      `  description: ${item.description?.trim() || '(none)'}`,
      `  facts:`,
      ...formatAiTitlePropertyFacts(item.facts).map((line) => `    ${line}`),
    );
  }

  if (input.familyInstructions?.trim()) {
    lines.push(`Additional instructions: ${input.familyInstructions.trim()}`);
  }
  return lines.join('\n');
}
