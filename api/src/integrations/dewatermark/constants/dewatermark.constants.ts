export const DEWATERMARK_DEFAULT_BASE_URL =
  'https://platform.dewatermark.ai';

export const DEWATERMARK_API_PATHS = {
  eraseWatermark: '/api/object_removal/v3/erase_watermark',
  eraseWatermarkPro: '/api/object_removal/v1/erase_watermark_pro',
} as const;

export const DEWATERMARK_DEFAULT_PREDICT_MODE = '4.0' as const;
