import {
  MAX_DOCUMENT_BYTES,
  MAX_STRING_LENGTH,
} from '../constants/activity-log.constants';

export const REDACTED = '[REDACTED]';

const MAX_DEPTH = 12;

/**
 * Any object key containing one of these fragments (case-insensitive) is treated as a secret.
 * Deliberately broad -- over-redacting an audit log is safe, leaking a credential into it is not.
 */
const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|api_?key|webhook_?key|authorization|cookie|session|credential/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export interface SanitizeOptions {
  /** Extra exact key names (case-insensitive) to redact besides the built-in pattern. */
  extraSensitiveKeys?: readonly string[];
}

/**
 * Converts a value into a JSON-safe, redacted, size-bounded copy: sensitive keys become
 * "[REDACTED]", strings are truncated, Dates/Decimals/BigInts are stringified, circular
 * references and over-deep structures are cut, and a document above MAX_DOCUMENT_BYTES is
 * replaced by a small preview. Never throws.
 */
export function sanitizeForLog(
  input: unknown,
  options: SanitizeOptions = {},
): unknown {
  try {
    const extra = new Set(
      (options.extraSensitiveKeys ?? []).map((key) => key.toLowerCase()),
    );
    const sanitized = walk(input, extra, new WeakSet<object>(), 0);
    return capDocument(sanitized);
  } catch {
    return { _unserializable: true };
  }
}

function walk(
  value: unknown,
  extra: Set<string>,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (value === null || value === undefined) return null;

  switch (typeof value) {
    case 'string':
      return truncateString(value);
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
    case 'symbol':
      return null;
  }

  const obj = value as object;

  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  }
  if (Buffer.isBuffer(obj)) return `[binary ${obj.length} bytes]`;
  if (depth >= MAX_DEPTH) return '[max depth]';
  if (seen.has(obj)) return '[circular]';
  seen.add(obj);

  try {
    if (Array.isArray(obj)) {
      return obj.map((item) => walk(item, extra, seen, depth + 1));
    }

    // Prisma.Decimal and similar value objects serialize themselves.
    const withToJson = obj as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === 'function') {
      return walk(withToJson.toJSON(), extra, seen, depth + 1);
    }

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      out[key] =
        isSensitiveKey(key) || extra.has(key.toLowerCase())
          ? REDACTED
          : walk(child, extra, seen, depth + 1);
    }
    return out;
  } finally {
    seen.delete(obj);
  }
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated ${
    value.length - MAX_STRING_LENGTH
  } chars]`;
}

function capDocument(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || serialized.length <= MAX_DOCUMENT_BYTES) {
    return value;
  }
  return {
    _truncated: true,
    _original_bytes: serialized.length,
    preview: serialized.slice(0, MAX_STRING_LENGTH),
  };
}
