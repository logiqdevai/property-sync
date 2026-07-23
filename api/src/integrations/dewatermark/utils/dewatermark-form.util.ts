import { DewatermarkBinaryFile, DewatermarkImageInput } from '../interfaces/dewatermark-file.interface';
import { DewatermarkException } from '../exceptions/dewatermark.exception';

export function toBinaryFile(
  input: DewatermarkImageInput,
  fallbackFilename: string,
  fallbackContentType = 'image/jpeg',
): DewatermarkBinaryFile {
  if (Buffer.isBuffer(input)) {
    return {
      data: input,
      filename: fallbackFilename,
      contentType: fallbackContentType,
    };
  }

  if (typeof input === 'string') {
    const base64 = input.includes(',') ? input.split(',').pop()! : input;
    return {
      data: Buffer.from(base64, 'base64'),
      filename: fallbackFilename,
      contentType: fallbackContentType,
    };
  }

  if (!input?.data?.length) {
    throw new DewatermarkException(
      'Dewatermark binary file data is required',
      'DEWATERMARK_BAD_REQUEST',
    );
  }

  return {
    data: input.data,
    filename: input.filename || fallbackFilename,
    contentType: input.contentType || fallbackContentType,
  };
}

export function appendBinaryFile(
  form: FormData,
  fieldName: string,
  file: DewatermarkBinaryFile,
): void {
  const contentType = file.contentType || 'application/octet-stream';
  form.append(
    fieldName,
    new Blob([new Uint8Array(file.data)], { type: contentType }),
    file.filename,
  );
}

export function appendTextField(
  form: FormData,
  fieldName: string,
  value: string | boolean | number | undefined,
): void {
  if (value === undefined) {
    return;
  }
  form.append(fieldName, String(value));
}
