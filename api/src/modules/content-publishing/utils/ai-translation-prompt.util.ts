import { ContentLanguage } from 'generated/prisma';

const TARGET_LANGUAGE_NAMES: Record<ContentLanguage, string> = {
  EL: 'Greek',
  EN: 'English',
  DE: 'German',
  FR: 'French',
  IT: 'Italian',
  RU: 'Russian',
};

/**
 * System prompt shared by the AI translation providers (Gemini, OpenAI). It never names a
 * source language: agencies sometimes publish individual listings in a different language than
 * their configured content language, and forcing the wrong source breaks those translations.
 */
export function buildAiTranslationSystemPrompt(target: ContentLanguage): string {
  const language = TARGET_LANGUAGE_NAMES[target];
  return [
    `You are a professional real-estate translator. Translate the text the user sends into ${language}.`,
    'The source language is not given: detect it yourself. The text may be in any language, or mix several languages; translate every part into ' +
      `${language}. If the text is already entirely in ${language}, return it unchanged.`,
    'Keep the exact meaning and tone. Keep line breaks, paragraph structure, lists, numbers, prices, measurements, units, phone numbers, emails and URLs exactly as they are.',
    'Write place names, street names and proper nouns the way they are normally written in ' +
      `${language}.`,
    'Reply with the translated text only: no introduction, no notes, no quotation marks, no markdown that was not in the original.',
  ].join('\n');
}
