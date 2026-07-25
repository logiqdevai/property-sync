import { Injectable, Logger } from '@nestjs/common';
import { GcsAdapter } from '../gcs.adapter';
import {
  UploadImageRequest,
  UploadImageResponse,
  DeleteImageRequest,
  DeleteImageResponse,
  ListImagesRequest,
  ListImagesResponse,
  DownloadImageRequest,
  DownloadImageResponse,
} from '../interfaces/gcs.interfaces';
import { withGcsRetry } from '../utils/gcs-retry.util';

@Injectable()
export class GcsService {
  private readonly logger = new Logger(GcsService.name);

  constructor(private gcsAdapter: GcsAdapter) {}

  public async uploadImage(
    request: UploadImageRequest,
  ): Promise<UploadImageResponse> {
    try {
      return await withGcsRetry(() => this.gcsAdapter.uploadImage(request), {
        onRetry: (error, attempt) => {
          this.logger.warn(
            `GCS upload retry ${attempt} for ${request.filename}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        },
      });
    } catch (error) {
      this.logger.error('Upload image error:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }
  }

  public async deleteImage(
    request: DeleteImageRequest,
  ): Promise<DeleteImageResponse> {
    try {
      return await withGcsRetry(() => this.gcsAdapter.deleteImage(request), {
        onRetry: (error, attempt) => {
          this.logger.warn(
            `GCS delete retry ${attempt} for ${request.filename}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        },
      });
    } catch (error) {
      this.logger.error('Delete image error:', error);
      throw new Error(`Failed to delete image: ${error.message}`);
    }
  }

  public async deleteImageByPath(path: string): Promise<void> {
    try {
      await withGcsRetry(
        () => this.gcsAdapter.deleteImage({ filename: path }),
        {
          onRetry: (error, attempt) => {
            this.logger.warn(
              `GCS delete retry ${attempt} for path ${path}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          },
        },
      );
    } catch (error) {
      this.logger.error(`Delete image error for path ${path}:`, error);
      throw new Error(`Failed to delete image: ${error.message}`);
    }
  }

  public async listImages(
    request?: ListImagesRequest,
  ): Promise<ListImagesResponse> {
    try {
      return await withGcsRetry(() => this.gcsAdapter.listImages(request), {
        onRetry: (error, attempt) => {
          this.logger.warn(
            `GCS list retry ${attempt}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        },
      });
    } catch (error) {
      this.logger.error('List images error:', error);
      throw new Error(`Failed to list images: ${error.message}`);
    }
  }

  public async getSignedUrl(
    filename: string,
    folder?: string,
    expiresInMinutes: number = 60,
  ): Promise<string> {
    try {
      return await withGcsRetry(
        () =>
          this.gcsAdapter.getSignedUrl(filename, folder, expiresInMinutes),
        {
          onRetry: (error, attempt) => {
            this.logger.warn(
              `GCS signed URL retry ${attempt} for ${filename}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          },
        },
      );
    } catch (error) {
      this.logger.error('Get signed URL error:', error);
      throw new Error(`Failed to get signed URL: ${error.message}`);
    }
  }

  public async getSignedUrlForPath(
    fullPath: string,
    expiresInMinutes: number = 60,
  ): Promise<string> {
    try {
      return await withGcsRetry(
        () =>
          this.gcsAdapter.getSignedUrlForPath(fullPath, expiresInMinutes),
        {
          onRetry: (error, attempt) => {
            this.logger.warn(
              `GCS signed URL retry ${attempt} for ${fullPath}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          },
        },
      );
    } catch (error) {
      this.logger.error('Get signed URL error:', error);
      throw new Error(`Failed to get signed URL: ${error.message}`);
    }
  }

  public async uploadImageFromBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string,
    folder?: string,
    isPublic: boolean = false,
  ): Promise<UploadImageResponse> {
    const request: UploadImageRequest = {
      file: buffer,
      filename,
      contentType,
      folder,
    };

    return this.uploadImage(request);
  }

  public async uploadImageFromBase64(
    base64Data: string,
    filename: string,
    contentType: string,
    folder?: string,
    isPublic: boolean = false,
  ): Promise<UploadImageResponse> {
    const buffer = Buffer.from(base64Data, 'base64');
    return this.uploadImageFromBuffer(
      buffer,
      filename,
      contentType,
      folder,
      isPublic,
    );
  }

  public async uploadMultipleImages(
    requests: UploadImageRequest[],
  ): Promise<UploadImageResponse[]> {
    try {
      const uploadPromises = requests.map((request, index) =>
        this.uploadImage(request).catch((error) => {
          this.logger.error(
            `Failed to upload image ${index + 1} (${request.filename}):`,
            error,
          );
          return null;
        }),
      );

      const results = await Promise.all(uploadPromises);

      return results;
    } catch (error) {
      this.logger.error('Upload multiple images error:', error.message);
      throw new Error(`Failed to upload multiple images: ${error.message}`);
    }
  }

  public async downloadImage(
    request: DownloadImageRequest,
  ): Promise<DownloadImageResponse> {
    try {
      return await withGcsRetry(() => this.gcsAdapter.downloadImage(request), {
        onRetry: (error, attempt) => {
          this.logger.warn(
            `GCS download retry ${attempt} for ${request.filename}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        },
      });
    } catch (error) {
      this.logger.error('Download image error:', error);
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }
}
