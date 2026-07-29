import { ContentLanguage } from 'generated/prisma';

export const AI_TITLE_SYSTEM_PROMPT = `You are a real-estate marketing copywriter.
You receive original property title/description and a list of EstateWeb slot codes.
Return exactly one distinct marketing title per slot code.
JSON keys are slot codes only (EL, EN, DE, FR, IT, RU) — they are NOT always the language you must write in.
Write each title in the language required by Additional instructions (e.g. all Greek, or all English).
When instructions say write in Greek, every title value must be Greek even if the key is DE/FR/RU.
When instructions say write in English, every title value must be English even if the key is IT.
Each title for a family must be meaningfully different from the others (paraphrase/angle), not copies.
Rewrite and optimize for clarity and appeal while keeping facts (property type, place, size).
Do not invent amenities, features, or claims not present in the source.
Return ONLY valid JSON with this shape: {"titles":{"EL":"...","EN":"...",...}}
Include exactly one string per requested slot code.`;

export function buildAiTitleUserPrompt(input: {
  sourceLanguage: ContentLanguage;
  targetLanguages: ContentLanguage[];
  title: string;
  description: string | null | undefined;
  familyInstructions?: string | null;
}): string {
  const lines = [
    `Source language: ${input.sourceLanguage}`,
    `EstateWeb slot codes: ${input.targetLanguages.join(', ')}`,
    `Original title: ${input.title}`,
    `Original description: ${input.description?.trim() || '(none)'}`,
  ];
  if (input.familyInstructions?.trim()) {
    lines.push(`Additional instructions: ${input.familyInstructions.trim()}`);
  }
  return lines.join('\n');
}
