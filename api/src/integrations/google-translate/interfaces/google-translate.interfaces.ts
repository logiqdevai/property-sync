import { JWTInput } from 'google-auth-library';

export type GoogleTranslateFormat = 'text' | 'html';

export interface GoogleTranslateClientConfig {
  project_id: string;
  credentials?: JWTInput;
}

export interface TranslateTextRequest {
  text: string;
  target: string;
  source?: string;
  format?: GoogleTranslateFormat;
  model?: string;
}

export interface TranslateTextResult {
  text: string;
  translated_text: string;
  source?: string;
  target: string;
}

export interface TranslateManyRequest {
  texts: string[];
  target: string;
  source?: string;
  format?: GoogleTranslateFormat;
  model?: string;
}

export interface TranslateManyResult {
  translations: TranslateTextResult[];
  target: string;
  source?: string;
}

export interface DetectLanguageRequest {
  text: string;
}

export interface DetectLanguageResult {
  text: string;
  language: string;
  confidence: number;
}

export interface DetectManyRequest {
  texts: string[];
}

export interface DetectManyResult {
  detections: DetectLanguageResult[];
}

export interface SupportedLanguage {
  code: string;
  name: string;
}
