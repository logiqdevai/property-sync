export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Thrown when the user pressed Stop; every loop checks for it and unwinds quietly. */
export class StoppedError extends Error {
  constructor() {
    super("Stopped by the user");
  }
}

/** Adds query params to the url a page is opened at (never to the stored source url). */
export function withQueryParams(url: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return url;
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(params)) parsed.searchParams.set(key, value);
    return parsed.href;
  } catch {
    return url;
  }
}
