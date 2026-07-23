import { Injectable } from '@nestjs/common';
import {
  DEWATERMARK_API_PATHS,
  DEWATERMARK_BASE_URL,
  DEWATERMARK_PREDICT_MODE,
} from '../constants/dewatermark.constants';
import { DewatermarkPredictMode } from '../interfaces/dewatermark-image.interface';

@Injectable()
export class DewatermarkConfig {
  getBaseUrl(): string {
    return DEWATERMARK_BASE_URL;
  }

  getDefaultPredictMode(): DewatermarkPredictMode {
    return DEWATERMARK_PREDICT_MODE;
  }

  getPaths() {
    return DEWATERMARK_API_PATHS;
  }

  buildUrl(path: string): string {
    return new URL(path, `${DEWATERMARK_BASE_URL}/`).toString();
  }
}
