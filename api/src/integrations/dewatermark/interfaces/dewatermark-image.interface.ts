import { DewatermarkBinaryFile, DewatermarkImageInput } from './dewatermark-file.interface';

export type DewatermarkPredictMode = 'old' | '3.0' | '4.0';

export interface DewatermarkEraseWatermarkParams {
  originalPreviewImage?: DewatermarkImageInput;
  sessionId?: string;
  maskBase?: string | DewatermarkBinaryFile;
  maskBrush?: DewatermarkBinaryFile;
  removeText?: boolean;
  predictMode?: DewatermarkPredictMode;
}

export interface DewatermarkEraseWatermarkProParams {
  originalPreviewImage: DewatermarkImageInput;
}

export interface DewatermarkEditedImage {
  image: string;
  image_id?: string;
  mask?: string;
  watermark_mask?: string;
}

export interface DewatermarkEraseWatermarkResponse {
  edited_image: DewatermarkEditedImage;
  event_id?: string;
  session_id: string;
}

export interface DewatermarkEraseWatermarkResult {
  sessionId: string;
  eventId?: string;
  imageBase64: string;
  imageId?: string;
  maskBase?: string;
  watermarkMask?: string;
}
