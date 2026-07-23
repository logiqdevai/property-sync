import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DewatermarkConfig } from '../config/dewatermark.config';
import { DewatermarkException } from '../exceptions/dewatermark.exception';
import {
  mapFetchError,
  mapHttpStatusToException,
} from '../utils/dewatermark-error.util';

export interface DewatermarkRequestOptions {
  method?: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  apiKey: string;
  expectJson?: boolean;
}

@Injectable()
export class DewatermarkClientService {
  private readonly logger = new Logger(DewatermarkClientService.name);

  constructor(private readonly dewatermarkConfig: DewatermarkConfig) {}

  async request<T = unknown>(options: DewatermarkRequestOptions): Promise<T> {
    const method = options.method ?? 'POST';
    const expectJson = options.expectJson ?? true;
    const path = options.path;
    const url = this.dewatermarkConfig.buildUrl(path);

    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new DewatermarkException(
        'Dewatermark API key is required',
        'DEWATERMARK_UNAUTHORIZED',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const headers: Record<string, string> = {
      ...(options.headers ?? {}),
      'X-API-KEY': apiKey,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body,
      });
    } catch (error) {
      throw mapFetchError(error, { method, path });
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw mapHttpStatusToException(response.status, method, path, errorBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (!expectJson) {
      const text = await response.text().catch(() => '');
      return text as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const text = await response.text().catch(() => '');
      if (!text.trim()) {
        return undefined as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new DewatermarkException(
          `Dewatermark ${method} ${path} returned non-JSON response`,
          'DEWATERMARK_INVALID_RESPONSE',
          HttpStatus.BAD_GATEWAY,
          { method, path, body: text.slice(0, 500) },
        );
      }
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new DewatermarkException(
        `Dewatermark ${method} ${path} returned invalid JSON`,
        'DEWATERMARK_INVALID_RESPONSE',
        HttpStatus.BAD_GATEWAY,
        { method, path },
      );
    }
  }
}
