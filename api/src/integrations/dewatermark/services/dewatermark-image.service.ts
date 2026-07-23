import { HttpStatus, Injectable } from '@nestjs/common';
import { DewatermarkConfig } from '../config/dewatermark.config';
import { DewatermarkException } from '../exceptions/dewatermark.exception';
import { DewatermarkAuthContext } from '../interfaces/dewatermark-auth.interface';
import {
  DewatermarkEraseWatermarkParams,
  DewatermarkEraseWatermarkProParams,
  DewatermarkEraseWatermarkResponse,
  DewatermarkEraseWatermarkResult,
} from '../interfaces/dewatermark-image.interface';
import {
  appendBinaryFile,
  appendTextField,
  toBinaryFile,
} from '../utils/dewatermark-form.util';
import { DewatermarkClientService } from './dewatermark-client.service';

@Injectable()
export class DewatermarkImageService {
  constructor(
    private readonly dewatermarkConfig: DewatermarkConfig,
    private readonly dewatermarkClient: DewatermarkClientService,
  ) {}

  async eraseWatermark(
    auth: DewatermarkAuthContext,
    params: DewatermarkEraseWatermarkParams,
  ): Promise<DewatermarkEraseWatermarkResult> {
    if (!params.originalPreviewImage && !params.sessionId) {
      throw new DewatermarkException(
        'Either originalPreviewImage or sessionId is required',
        'DEWATERMARK_BAD_REQUEST',
      );
    }

    const form = new FormData();
    const paths = this.dewatermarkConfig.getPaths();

    if (params.originalPreviewImage) {
      appendBinaryFile(
        form,
        'original_preview_image',
        toBinaryFile(
          params.originalPreviewImage,
          'original_preview_image.jpeg',
          'image/jpeg',
        ),
      );
    }

    appendTextField(form, 'session_id', params.sessionId);

    if (params.maskBase) {
      if (typeof params.maskBase === 'string') {
        appendBinaryFile(
          form,
          'mask_base',
          toBinaryFile(params.maskBase, 'mask_base.jpeg', 'image/jpeg'),
        );
      } else {
        appendBinaryFile(form, 'mask_base', params.maskBase);
      }
    }

    if (params.maskBrush) {
      appendBinaryFile(form, 'mask_brush', {
        ...params.maskBrush,
        contentType: params.maskBrush.contentType || 'image/png',
        filename: params.maskBrush.filename || 'mask_brush.png',
      });
    }

    if (params.removeText !== undefined) {
      appendTextField(form, 'remove_text', params.removeText ? 'true' : 'false');
    }

    appendTextField(
      form,
      'predict_mode',
      params.predictMode ?? this.dewatermarkConfig.getDefaultPredictMode(),
    );

    const response =
      await this.dewatermarkClient.request<DewatermarkEraseWatermarkResponse>({
        method: 'POST',
        path: paths.eraseWatermark,
        body: form,
        apiKey: auth.apiKey,
      });

    return this.mapEraseResult(response);
  }

  async eraseWatermarkPro(
    auth: DewatermarkAuthContext,
    params: DewatermarkEraseWatermarkProParams,
  ): Promise<DewatermarkEraseWatermarkResult> {
    const form = new FormData();
    const paths = this.dewatermarkConfig.getPaths();

    appendBinaryFile(
      form,
      'original_preview_image',
      toBinaryFile(
        params.originalPreviewImage,
        'original_preview_image.jpeg',
        'image/jpeg',
      ),
    );

    const response =
      await this.dewatermarkClient.request<DewatermarkEraseWatermarkResponse>({
        method: 'POST',
        path: paths.eraseWatermarkPro,
        body: form,
        apiKey: auth.apiKey,
      });

    return this.mapEraseResult(response);
  }

  private mapEraseResult(
    response: DewatermarkEraseWatermarkResponse,
  ): DewatermarkEraseWatermarkResult {
    const imageBase64 = response.edited_image?.image;
    if (!imageBase64) {
      throw new DewatermarkException(
        'Dewatermark erase response missing edited image',
        'DEWATERMARK_INVALID_RESPONSE',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      sessionId: response.session_id,
      eventId: response.event_id,
      imageBase64,
      imageId: response.edited_image.image_id,
      maskBase: response.edited_image.mask,
      watermarkMask: response.edited_image.watermark_mask,
    };
  }
}
