import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { v2 } from '@google-cloud/translate';
import {
  GOOGLE_TRANSLATE_DEFAULT_FORMAT,
  GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST,
} from '../constants/google-translate.constants';
import { GoogleTranslateConfig } from '../config/google-translate.config';
import {
  DetectLanguageRequest,
  DetectLanguageResult,
  DetectManyRequest,
  DetectManyResult,
  SupportedLanguage,
  TranslateManyRequest,
  TranslateManyResult,
  TranslateTextRequest,
  TranslateTextResult,
} from '../interfaces/google-translate.interfaces';
import {
  chunkArray,
  mapGoogleTranslateError,
} from '../utils/google-translate-error.util';
import { GoogleTranslateException } from '../exceptions/google-translate.exception';

@Injectable()
export class GoogleTranslateService {
  private readonly logger = new Logger(GoogleTranslateService.name);

  constructor(private readonly googleTranslateConfig: GoogleTranslateConfig) {}

  isConfigured(): boolean {
    return this.googleTranslateConfig.isConfigured();
  }

  async translateText(
    request: TranslateTextRequest,
  ): Promise<TranslateTextResult> {
    this.assertNonEmptyText(request.text);

    try {
      const client = this.googleTranslateConfig.getClient();
      const options = this.buildTranslateOptions(request);
      const [translated] = await client.translate(request.text, options);

      return {
        text: request.text,
        translated_text: translated,
        source: request.source,
        target: request.target,
      };
    } catch (error) {
      throw this.handleError(error, {
        operation: 'translateText',
        target: request.target,
      });
    }
  }

  async translateMany(
    request: TranslateManyRequest,
  ): Promise<TranslateManyResult> {
    if (!request.texts?.length) {
      return {
        translations: [],
        target: request.target,
        source: request.source,
      };
    }

    const texts = request.texts.map((text) => {
      this.assertNonEmptyText(text);
      return text;
    });

    try {
      const client = this.googleTranslateConfig.getClient();
      const options = this.buildTranslateOptions(request);
      const chunks = chunkArray(
        texts,
        GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST,
      );
      const translations: TranslateTextResult[] = [];

      for (const chunk of chunks) {
        const [translated] = await client.translate(chunk, options);
        const translatedList = Array.isArray(translated)
          ? translated
          : [translated];

        for (let i = 0; i < chunk.length; i++) {
          translations.push({
            text: chunk[i],
            translated_text: translatedList[i] ?? '',
            source: request.source,
            target: request.target,
          });
        }
      }

      return {
        translations,
        target: request.target,
        source: request.source,
      };
    } catch (error) {
      throw this.handleError(error, {
        operation: 'translateMany',
        target: request.target,
        count: texts.length,
      });
    }
  }

  async detectLanguage(
    request: DetectLanguageRequest,
  ): Promise<DetectLanguageResult> {
    this.assertNonEmptyText(request.text);

    try {
      const client = this.googleTranslateConfig.getClient();
      const [detection] = await client.detect(request.text);

      return {
        text: request.text,
        language: detection.language,
        confidence: detection.confidence,
      };
    } catch (error) {
      throw this.handleError(error, { operation: 'detectLanguage' });
    }
  }

  async detectMany(request: DetectManyRequest): Promise<DetectManyResult> {
    if (!request.texts?.length) {
      return { detections: [] };
    }

    const texts = request.texts.map((text) => {
      this.assertNonEmptyText(text);
      return text;
    });

    try {
      const client = this.googleTranslateConfig.getClient();
      const chunks = chunkArray(
        texts,
        GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST,
      );
      const detections: DetectLanguageResult[] = [];

      for (const chunk of chunks) {
        const [chunkDetections] = await client.detect(chunk);
        const detectionList = Array.isArray(chunkDetections)
          ? chunkDetections
          : [chunkDetections];

        for (let i = 0; i < chunk.length; i++) {
          detections.push({
            text: chunk[i],
            language: detectionList[i]?.language ?? '',
            confidence: detectionList[i]?.confidence ?? 0,
          });
        }
      }

      return { detections };
    } catch (error) {
      throw this.handleError(error, {
        operation: 'detectMany',
        count: texts.length,
      });
    }
  }

  async getLanguages(target?: string): Promise<SupportedLanguage[]> {
    try {
      const client = this.googleTranslateConfig.getClient();
      const [languages] = await client.getLanguages(target);

      return languages.map((language) => ({
        code: language.code,
        name: language.name,
      }));
    } catch (error) {
      throw this.handleError(error, {
        operation: 'getLanguages',
        target,
      });
    }
  }

  private buildTranslateOptions(
    request: Pick<
      TranslateTextRequest,
      'target' | 'source' | 'format' | 'model'
    >,
  ): v2.TranslateRequest {
    this.assertLanguageCode(request.target, 'target');

    if (request.source) {
      this.assertLanguageCode(request.source, 'source');
    }

    return {
      to: request.target,
      from: request.source,
      format: request.format ?? GOOGLE_TRANSLATE_DEFAULT_FORMAT,
      model: request.model,
    };
  }

  private assertNonEmptyText(text: string): void {
    if (typeof text !== 'string' || !text.trim()) {
      throw new GoogleTranslateException(
        'Text to translate must be a non-empty string',
        'GOOGLE_TRANSLATE_BAD_REQUEST',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertLanguageCode(code: string, field: string): void {
    if (typeof code !== 'string' || !code.trim()) {
      throw new GoogleTranslateException(
        `${field} language code is required`,
        'GOOGLE_TRANSLATE_BAD_REQUEST',
        HttpStatus.BAD_REQUEST,
        { field },
      );
    }
  }

  private handleError(
    error: unknown,
    context: Record<string, unknown>,
  ): GoogleTranslateException {
    const mapped = mapGoogleTranslateError(error, context);
    this.logger.error(
      `Google Translate ${String(context.operation)} failed: ${mapped.message}`,
      error instanceof Error ? error.stack : undefined,
    );
    return mapped;
  }
}
