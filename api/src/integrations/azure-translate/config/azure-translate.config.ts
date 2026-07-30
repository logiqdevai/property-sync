import { Injectable } from '@nestjs/common';
import {
  AZURE_TRANSLATE_API_VERSION,
  AZURE_TRANSLATE_ENDPOINT,
  AZURE_TRANSLATE_REGION,
} from '../constants/azure-translate.constants';

@Injectable()
export class AzureTranslateConfig {
  getEndpoint(): string {
    return AZURE_TRANSLATE_ENDPOINT;
  }

  getRegion(): string | undefined {
    return AZURE_TRANSLATE_REGION || undefined;
  }

  buildUrl(
    path: string,
    query: Record<string, string | string[] | undefined>,
  ): string {
    const url = new URL(path, `${this.getEndpoint()}/`);
    url.searchParams.set('api-version', AZURE_TRANSLATE_API_VERSION);

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, entry));
      } else {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }
}
