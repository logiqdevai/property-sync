const TRANSIENT_MESSAGE_PATTERNS = [
  /premature close/i,
  /econnreset/i,
  /etimedout/i,
  /econnrefused/i,
  /socket hang up/i,
  /fetch failed/i,
  /network error/i,
  /networkrequest/i,
  /unavailable/i,
  /deadline exceeded/i,
  /EAI_AGAIN/i,
  /TLS/i,
  /socket disconnected/i,
];

const TRANSIENT_CODES = new Set([
  429,
  500,
  502,
  503,
  504,
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

export function isTransientGcsError(error: unknown): boolean {
  const code = (error as { code?: string | number } | null)?.code;
  if (code !== undefined && TRANSIENT_CODES.has(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export async function withGcsRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < attempts && isTransientGcsError(error);
      if (!canRetry) {
        throw error;
      }
      options.onRetry?.(error, attempt);
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)),
      );
    }
  }

  throw lastError;
}
