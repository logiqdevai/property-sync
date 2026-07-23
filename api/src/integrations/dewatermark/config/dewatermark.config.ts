import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEWATERMARK_API_PATHS,
  DEWATERMARK_DEFAULT_BASE_URL,
  DEWATERMARK_DEFAULT_PREDICT_MODE,
} from '../constants/dewatermark.constants';
import { DewatermarkPredictMode } from '../interfaces/dewatermark-image.interface';

@Injectable()
export class DewatermarkConfig {
  private readonly logger = new Logger(DewatermarkConfig.name);
  private readonly baseUrl: string;
  private readonly defaultPredictMode: DewatermarkPredictMode;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('DEWATERMARK_BASE_URL')?.trim() ||
      DEWATERMARK_DEFAULT_BASE_URL
    ).replace(/\/+$/, '');

    const predictMode =
      this.configService.get<string>('DEWATERMARK_PREDICT_MODE')?.trim() ||
      DEWATERMARK_DEFAULT_PREDICT_MODE;
    this.defaultPredictMode = this.normalizePredictMode(predictMode);

    this.logger.debug('Dewatermark integration configured');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getDefaultPredictMode(): DewatermarkPredictMode {
    return this.defaultPredictMode;
  }

  getPaths() {
    return DEWATERMARK_API_PATHS;
  }

  buildUrl(path: string): string {
    return new URL(path, `${this.baseUrl}/`).toString();
  }

  private normalizePredictMode(value: string): DewatermarkPredictMode {
    if (value === 'old' || value === '3.0' || value === '4.0') {
      return value;
    }
    return DEWATERMARK_DEFAULT_PREDICT_MODE;
  }
}
