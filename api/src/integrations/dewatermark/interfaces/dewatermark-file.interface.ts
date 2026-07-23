export interface DewatermarkBinaryFile {
  data: Buffer;
  filename: string;
  contentType?: string;
}

export type DewatermarkImageInput = Buffer | DewatermarkBinaryFile | string;
