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

export const AI_TITLE_SYSTEM_PROMPT = `You are a real-estate marketing copywriter.
You receive an original property listing, structured facts, a writing language, and a list of numbered slots.
Return exactly one distinct marketing title per numbered slot.
JSON keys are INTEGERS (1, 2, 3 ...). They are NOT language codes.
Write EVERY title value in the WRITING LANGUAGE specified in the user message.
Each title must be meaningfully different from the others (different angle / phrasing).
Every title MUST include all provided facts that are not "(none)": district, city, listing_type, square_meters, property_type.
Rewrite and optimize for clarity and appeal while keeping those facts accurate.
Do not invent amenities, features, or claims not present in the source.
Return ONLY valid JSON with this shape: {"titles":{"1":"...","2":"...",...}}`;

export const AI_TITLE_MULTI_PROPERTY_SYSTEM_PROMPT = `You are a real-estate marketing copywriter.
You receive multiple property listings and a writing language.
For each property id, produce one distinct marketing title per numbered slot.
JSON outer keys are property ids. Inner keys are INTEGERS (1, 2, 3 ...). They are NOT language codes.
Write EVERY title value in the WRITING LANGUAGE specified in the user message.
Titles for different slots on the same property must be meaningfully different (different angle / phrasing).
Every title MUST include all provided facts that are not "(none)": district, city, listing_type, square_meters, property_type.
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
  const lines = [
    `WRITING LANGUAGE: ${input.writingLanguage} = ${label}`,
    `Write ALL title values in ${label}. Do not use any other language.`,
    `Slots: ${slots.join(', ')} (produce exactly ${slots.length} different ${label} titles)`,
    `Source language of original listing: ${input.sourceLanguage}`,
    `Original title: ${input.title}`,
    `Original description: ${input.description?.trim() || '(none)'}`,
    'Property facts (include all non-(none) values in every title):',
    ...formatAiTitlePropertyFacts(input.facts).map((line) => `  ${line}`),
  ];
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
