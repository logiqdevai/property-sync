import { createHash } from 'crypto';
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
  return (
    typeof url === 'string' && url.includes(`/${GcsFolders.propertyImages}/`)
  );
}

// A short, filename-safe fingerprint of a normalized source identity. Not a
// security hash -- just compact enough to embed in a GCS filename and
// collision-resistant enough that an accidental match is effectively
// impossible for this dataset's size.
export function hashSourceIdentity(identity: string): string {
  return createHash('sha256').update(identity).digest('hex').slice(0, 16);
}

const SOURCE_IDENTITY_HASH_PATTERN = /-src-([0-9a-f]{16})\.[a-zA-Z0-9]+$/;

// The watermark pipeline embeds the exact source identity it processed
// directly in the GCS filename (see WatermarkRemovalService), so detection
// never has to guess "what did this replace" from current (possibly
// since-drifted) canonical/source state -- it can verify it exactly. Returns
// null for a GCS url produced before this embedding existed; callers must
// treat that as "unverifiable," never fall back to guessing, since canonical
// image order/content can change after a GCS entry was created while the
// UserProperty.images slot stays pinned to the old processed image
// (mergeImagesPreservingProcessed), silently invalidating any later
// position-based guess.
export function extractEmbeddedSourceIdentityHash(
  gcsUrl: string,
): string | null {
  const match = gcsUrl.match(SOURCE_IDENTITY_HASH_PATTERN);
  return match ? match[1] : null;
}
