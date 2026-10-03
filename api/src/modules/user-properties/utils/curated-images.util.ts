// The image list a hand-edited ("curated") property should hold on the next
// crawl. The user's own selection and order always win over the source
// gallery; the tracker's max_image_count still caps it:
//  - cap unchanged since the last edit: keep the selection as is (no refill
//    of slots the user freed by deleting a photo -- they removed it on purpose)
//  - cap raised (e.g. 8 -> 12): top the selection up with the next source
//    photos the user hasn't already got or deliberately deleted
//  - cap lowered (e.g. 8 -> 5): keep the first N of the user's selection
// Photos the user deleted from the CRM (excluded) never stay or come back.
// `curatedCap` is the cap that was in effect when the selection was last
// edited or adjusted (null = keep all); the returned one is the cap now.
export function computeCuratedImages(params: {
  curated: string[];
  canonical: string[];
  excluded: string[];
  maxImageCount: number | null;
  curatedCap: number | null;
  normalize: (url: string) => string;
}): { images: string[]; curatedCap: number | null } {
  if (params.maxImageCount === 0) return { images: [], curatedCap: 0 };

  const cap = params.maxImageCount ?? Number.POSITIVE_INFINITY;
  const previousCap = params.curatedCap ?? Number.POSITIVE_INFINITY;
  const excluded = new Set(params.excluded.map(params.normalize));

  const seen = new Set<string>();
  const images: string[] = [];
  for (const url of params.curated) {
    const identity = params.normalize(url);
    if (excluded.has(identity) || seen.has(identity)) continue;
    seen.add(identity);
    images.push(url);
  }

  if (cap > previousCap) {
    for (const url of params.canonical) {
      if (images.length >= cap) break;
      if (!/^https?:\/\//i.test(url)) continue;
      const identity = params.normalize(url);
      if (excluded.has(identity) || seen.has(identity)) continue;
      seen.add(identity);
      images.push(url);
    }
  }

  return { images: images.slice(0, cap), curatedCap: params.maxImageCount };
}

// The image list for a property whose photos go back to following the source
// ("Reset photos to automatic"): the source gallery cut to the cap, reusing an
// already-paid dewatermarked copy wherever one can be matched to its photo --
// exactly (by the source hash embedded in newer GCS filenames) or, for older
// copies without one, by the slot it already occupied (the crawl's own rule).
export function computeResetImages(params: {
  existing: string[];
  canonical: string[];
  maxImageCount: number | null;
  isProcessed: (url: string) => boolean;
  embeddedHashOf: (url: string) => string | null;
  hashOfSource: (url: string) => string;
}): string[] {
  if (params.maxImageCount === 0) return [];
  const target =
    params.maxImageCount == null
      ? params.canonical
      : params.canonical.slice(0, params.maxImageCount);

  const processedByHash = new Map<string, string>();
  for (const url of params.existing) {
    if (!params.isProcessed(url)) continue;
    const hash = params.embeddedHashOf(url);
    if (hash && !processedByHash.has(hash)) processedByHash.set(hash, url);
  }

  const used = new Set<string>();
  return target.map((sourceUrl, index) => {
    const exact = processedByHash.get(params.hashOfSource(sourceUrl));
    if (exact && !used.has(exact)) {
      used.add(exact);
      return exact;
    }
    const sameSlot = params.existing[index];
    if (
      sameSlot &&
      params.isProcessed(sameSlot) &&
      !params.embeddedHashOf(sameSlot) &&
      !used.has(sameSlot)
    ) {
      used.add(sameSlot);
      return sameSlot;
    }
    return sourceUrl;
  });
}
