// Detects "fallback graphics" a site renders in a photo-less listing's image slot -- the
// agency's own logo, a "no photo available" banner -- when the URL gives no textual hint
// (unlike "logo.png"). A genuine property photo essentially never repeats across unrelated
// listings *as its only photo*, so an image that is the sole photo of several listings is a
// placeholder. (Repetition inside a multi-photo gallery is NOT enough: agencies legitimately
// reuse a building or project photo across several listings.)
//
// Two identities are compared, because exact-URL matching alone misses the common case of
// WordPress-style sites re-uploading the same file into each month's folder
// (`/2019/09/teliko60.jpg`, `/2022/07/teliko60.jpg`, `/2025/12/teliko60.jpg`):
//   1. the exact URL minus query string and size-variant suffix, and
//   2. the file name alone, but only when the name is distinctive enough that two unrelated
//      listings sharing it can't be coincidence (not `1.jpg`, `150-1.jpg`, `image.jpg`, `IMG_0042.jpg`).

import { SHARED_PLACEHOLDER_IMAGE_MIN_OCCURRENCES } from '../constants/crawler.constants';

const SIZE_VARIANT_RE = /[_-]\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i;
// Names like "1", "02", "image", "photo-3", "IMG_0042", "DSC01234", "P1010023": camera/CMS
// defaults that unrelated listings legitimately share.
const GENERIC_STEM_RE =
  /^(?:img|image|images|photo|foto|pic|picture|dsc|dscn|dscf|p|property|house|slide|thumb|thumbnail|default|no[-_]?image|placeholder)?[-_ ]?\d*$/i;
// A name must carry real words, not just numbering ("150-1", "01", "2026-03-16"): sites
// that name photos per unit/sequence reuse such names across unrelated listings.
const MIN_LETTERS_IN_STEM = 4;

function stripQueryAndFragment(url: string): string {
  return url.split('#')[0].split('?')[0];
}

/// Exact-URL identity: origin + path with size suffix and query removed.
export function imageUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `url:${parsed.origin}${parsed.pathname.replace(SIZE_VARIANT_RE, '')}`;
  } catch {
    return `url:${stripQueryAndFragment(url).replace(SIZE_VARIANT_RE, '')}`;
  }
}

/// File-name identity, or null when the name is too generic to trust.
export function imageFileNameKey(url: string): string | null {
  const path = stripQueryAndFragment(url).replace(SIZE_VARIANT_RE, '');
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  const stem = name.slice(0, dot);
  if ((stem.match(/\p{L}/gu) ?? []).length < MIN_LETTERS_IN_STEM) return null;
  if (GENERIC_STEM_RE.test(stem)) return null;
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // keep the raw name
  }
  return `name:${decoded.toLowerCase()}`;
}

function keysFor(url: string): string[] {
  const nameKey = imageFileNameKey(url);
  return nameKey ? [imageUrlKey(url), nameKey] : [imageUrlKey(url)];
}

/// Returns the identity keys that are the ONLY photo of at least `minOccurrences` listings.
/// Each element of `imageListsPerItem` is ONE listing's image URLs; size variants and
/// repeats of the same photo inside a listing collapse to one.
export function findSharedPlaceholderKeys(
  imageListsPerItem: string[][],
  minOccurrences = SHARED_PLACEHOLDER_IMAGE_MIN_OCCURRENCES,
): Set<string> {
  const counts = new Map<string, number>();
  for (const urls of imageListsPerItem) {
    const valid = urls.filter((u) => typeof u === 'string' && u);
    if (new Set(valid.map(imageUrlKey)).size !== 1) continue;
    for (const key of keysFor(valid[0]))
      counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= minOccurrences)
      .map(([key]) => key),
  );
}

export function isSharedPlaceholderImage(
  url: unknown,
  placeholderKeys: Set<string>,
): boolean {
  if (typeof url !== 'string' || !url || placeholderKeys.size === 0) {
    return false;
  }
  return keysFor(url).some((key) => placeholderKeys.has(key));
}

interface ImageBearingItem {
  raw: Record<string, unknown>;
}

/// Strips shared-placeholder images from every item's `raw.image` / `raw._all_images` in
/// place. Returns the placeholder keys found and how many items were touched.
export function stripSharedPlaceholdersFromItems(items: ImageBearingItem[]): {
  placeholderKeys: string[];
  affectedItems: number;
} {
  const lists = items.map((item) => {
    const all = Array.isArray(item.raw._all_images)
      ? (item.raw._all_images as unknown[]).filter(
          (u): u is string => typeof u === 'string',
        )
      : [];
    return typeof item.raw.image === 'string' && item.raw.image
      ? [item.raw.image, ...all]
      : all;
  });
  const keys = findSharedPlaceholderKeys(lists);
  if (keys.size === 0) return { placeholderKeys: [], affectedItems: 0 };

  let affectedItems = 0;
  for (const item of items) {
    let affected = false;
    if (isSharedPlaceholderImage(item.raw.image, keys)) {
      item.raw.image = null;
      affected = true;
    }
    if (Array.isArray(item.raw._all_images)) {
      const before = item.raw._all_images as unknown[];
      const after = before.filter((u) => !isSharedPlaceholderImage(u, keys));
      if (after.length !== before.length) {
        item.raw._all_images = after;
        affected = true;
      }
    }
    if (affected) affectedItems++;
  }
  return { placeholderKeys: [...keys], affectedItems };
}
