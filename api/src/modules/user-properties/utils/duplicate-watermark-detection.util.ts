import { GcsFolders } from '@/shared/config/gcs-folders';

// Mirrors EstateWebCmsSyncAdapter.normalizeSourceImageIdentity(): the same
// scraped photo is often re-served at a different size or with a different
// cache-busting query string across crawls, so comparing raw URLs would treat
// it as a different photo. Strips the query string and a trailing
// "_WIDTHxHEIGHT" resize suffix before comparing.
export function normalizeSourceImageIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(
      /[_-]\d{2,5}x\d{2,5}(?=\.[a-zA-Z0-9]+$)/i,
      '',
    );
    return `${parsed.host}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// Mirrors WatermarkRemovalService.isPropertyImagesGcsUrl(): identifies a URL
// as one of our own already-processed (e.g. watermark-removed) uploads.
export function isPropertyImagesGcsUrl(url: unknown): url is string {
  return typeof url === 'string' && url.includes(`/${GcsFolders.propertyImages}/`);
}
