import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage } from 'generated/prisma';
import { GoogleTranslateService } from '@/integrations/google-translate/services/google-translate.service';
import { CONTENT_LANGUAGE_TO_GOOGLE_CODE } from '../constants/content-language.constants';

@Injectable()
export class GoogleTranslationService {
  private readonly logger = new Logger(GoogleTranslationService.name);

  constructor(
    private readonly googleTranslateService: GoogleTranslateService,
  ) {}

  isConfigured(): boolean {
    return this.googleTranslateService.isConfigured();
  }

  async translate(
    text: string,
    source: ContentLanguage,
    target: ContentLanguage,
  ): Promise<string> {
    if (!text?.trim()) return text ?? '';
    if (source === target) return text;

    if (!this.googleTranslateService.isConfigured()) {
      this.logger.warn(
        'Google Translate not configured; returning original text',
      );
      return text;
    }

    const result = await this.googleTranslateService.translateText({
      text,
      source: CONTENT_LANGUAGE_TO_GOOGLE_CODE[source],
      target: CONTENT_LANGUAGE_TO_GOOGLE_CODE[target],
      format: 'text',
    });

    return result.translated_text;
  }
}
