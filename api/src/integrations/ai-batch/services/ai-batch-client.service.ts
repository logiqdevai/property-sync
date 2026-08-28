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

  // Newly uploaded files can stay invisible to batches.create for tens of
  // seconds on OpenAI's side even after files.create resolves; observed
  // consistently (not a one-off) with "Cannot find file ... or organization
  // does not have access to it" and request_counts all zero. Poll the file
  // itself until it reports processed before referencing it in a batch.
  private async waitForFileProcessed(
    client: OpenAI,
    fileId: string,
    timeoutMs = 90_000,
  ): Promise<void> {
    const start = Date.now();
    let delayMs = 1000;
    while (Date.now() - start < timeoutMs) {
      const file = await client.files.retrieve(fileId);
      if (file.status === 'processed') return;
      if (file.status === 'error') {
        throw new Error(`OpenAI file ${fileId} failed processing`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 1.5, 5000);
    }
  }

  async createBatch(
    client: OpenAI,
    inputFileId: string,
    metadata: Record<string, string>,
  ): Promise<string> {
    await this.waitForFileProcessed(client, inputFileId);

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const batch = await client.batches.create({
          input_file_id: inputFileId,
          endpoint: '/v1/chat/completions',
          completion_window: '24h',
          metadata,
        });
        return batch.id;
      } catch (error) {
        const isFilePropagationRace =
          error instanceof OpenAI.APIError &&
          error.status === 400 &&
          /cannot find file/i.test(error.message ?? '');
        if (!isFilePropagationRace || attempt === maxAttempts) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * attempt),
        );
      }
    }
    throw new Error('unreachable');
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
