export interface AzureTranslateOptions {
  text: string | string[];
  to: string | string[];
  from?: string;
}

export interface AzureTranslationItem {
  to: string;
  text: string;
}

export interface AzureTranslateDetectedLanguage {
  language: string;
  score: number;
}

export interface AzureTranslateResult {
  detectedLanguage?: AzureTranslateDetectedLanguage;
  translations: AzureTranslationItem[];
}
