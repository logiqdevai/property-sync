import { createHash } from 'crypto';

export function crawlTimestamp(): string {
  return new Date().toISOString();
}

export function contentHash(obj: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex')
    .slice(0, 16);
}
