import { Injectable } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class AiBatchClientService {
  createClient(apiKey: string): OpenAI {
    return new OpenAI({ apiKey });
  }

  async uploadJsonl(client: OpenAI, lines: string[]): Promise<string> {
    const content = lines.join('\n');
    const file = await client.files.create({
      file: await toFile(Buffer.from(content, 'utf-8'), 'normalization.jsonl'),
      purpose: 'batch',
    });
    return file.id;
  }

  async createBatch(
    client: OpenAI,
    inputFileId: string,
    metadata: Record<string, string>,
  ): Promise<string> {
    const batch = await client.batches.create({
      input_file_id: inputFileId,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
      metadata,
    });
    return batch.id;
  }

  async retrieveBatch(client: OpenAI, batchId: string) {
    return client.batches.retrieve(batchId);
  }

  async downloadOutputFile(client: OpenAI, fileId: string): Promise<string> {
    const response = await client.files.content(fileId);
    return response.text();
  }

  async cancelBatch(client: OpenAI, batchId: string) {
    return client.batches.cancel(batchId);
  }
}
