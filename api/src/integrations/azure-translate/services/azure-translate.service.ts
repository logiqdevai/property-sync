import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AZURE_TRANSLATE_API_PATHS } from '../constants/azure-translate.constants';
import { AzureTranslateException } from '../exceptions/azure-translate.exception';
import { AzureTranslateAuthContext } from '../interfaces/azure-translate-auth.interface';
import {
  AzureTranslateOptions,
  AzureTranslateResult,
} from '../interfaces/azure-translate.interface';
import { AzureTranslateClientService } from './azure-translate-client.service';

@Injectable()
export class AzureTranslateService {
  private readonly logger = new Logger(AzureTranslateService.name);

  constructor(private readonly azureTranslateClient: AzureTranslateClientService) {}

  async translate(
    auth: AzureTranslateAuthContext,
    options: AzureTranslateOptions,
  ): Promise<AzureTranslateResult[]> {
    const texts = Array.isArray(options.text) ? options.text : [options.text];

    if (!texts.length || texts.every((text) => !text?.trim())) {
      throw new AzureTranslateException(
        'At least one non-empty text is required for translation',
        'AZURE_TRANSLATE_BAD_REQUEST',
        HttpStatus.BAD_REQUEST,
      );
    }

    const body = texts.map((text) => ({ Text: text }));

    try {
      return await this.azureTranslateClient.request<AzureTranslateResult[]>({
        path: AZURE_TRANSLATE_API_PATHS.translate,
        query: { to: options.to, from: options.from },
        body,
        apiKey: auth.apiKey,
      });
    } catch (error) {
      this.logger.error(`Error translating text: ${error.message}`);
      throw error;
    }
  }

  async translateText(
    auth: AzureTranslateAuthContext,
    text: string,
    to: string,
    from?: string,
  ): Promise<string> {
    const [result] = await this.translate(auth, { text, to, from });
    return result?.translations?.[0]?.text ?? '';
  }
}
