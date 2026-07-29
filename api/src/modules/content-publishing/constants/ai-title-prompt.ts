import { ContentLanguage } from 'generated/prisma';

export const AI_TITLE_SYSTEM_PROMPT = `You are a real-estate marketing copywriter.
For each requested target language, write one natural marketing property title in that language.
Translate from the source language when the target differs.
Rewrite and optimize for clarity and appeal while keeping facts (property type, place, size).
Do not invent amenities, features, or claims not present in the source.
Return ONLY valid JSON with this shape: {"titles":{"EL":"...","EN":"...",...}}
Include exactly one string per requested target language code.`;

export function buildAiTitleUserPrompt(input: {
  sourceLanguage: ContentLanguage;
  targetLanguages: ContentLanguage[];
  title: string;
  description: string | null | undefined;
  familyInstructions?: string | null;
}): string {
  const lines = [
    `Source language: ${input.sourceLanguage}`,
    `Target languages: ${input.targetLanguages.join(', ')}`,
    `Original title: ${input.title}`,
    `Original description: ${input.description?.trim() || '(none)'}`,
  ];
  if (input.familyInstructions?.trim()) {
    lines.push(`Additional instructions: ${input.familyInstructions.trim()}`);
  }
  return lines.join('\n');
}
