import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AzureTranslateConfig } from '../config/azure-translate.config';
import { AzureTranslateException } from '../exceptions/azure-translate.exception';
import {
  mapFetchError,
  mapHttpStatusToException,
} from '../utils/azure-translate-error.util';

export interface AzureTranslateRequestOptions {
  path: string;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  apiKey: string;
}

@Injectable()
export class AzureTranslateClientService {
  private readonly logger = new Logger(AzureTranslateClientService.name);

  constructor(private readonly azureTranslateConfig: AzureTranslateConfig) {}

  async request<T = unknown>(options: AzureTranslateRequestOptions): Promise<T> {
    const method = 'POST';
    const { path } = options;

    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new AzureTranslateException(
        'Azure Translator API key is required',
        'AZURE_TRANSLATE_NOT_CONFIGURED',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const url = this.azureTranslateConfig.buildUrl(path, options.query);
    const region = this.azureTranslateConfig.getRegion();

    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json; charset=UTF-8',
    };

    if (region) {
      headers['Ocp-Apim-Subscription-Region'] = region;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(options.body),
      });
    } catch (error) {
      throw mapFetchError(error, { method, path });
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw mapHttpStatusToException(response.status, method, path, errorBody);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AzureTranslateException(
        `Azure Translator ${method} ${path} returned invalid JSON`,
        'AZURE_TRANSLATE_INVALID_RESPONSE',
        HttpStatus.BAD_GATEWAY,
        { method, path },
      );
    }
  }
}
