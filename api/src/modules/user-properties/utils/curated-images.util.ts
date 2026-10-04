// The image list a hand-edited ("curated") property should hold on the next
// crawl. The user's own selection and order always win over the source
// gallery, but the property keeps following the agency:
//  - a photo the agency ADDS after the edit is appended at the end (while
//    there's room under the cap)
//  - a photo the agency REMOVES from its listing is dropped -- unless the
//    source looks like a crawler gap (sourceShrunk), never on a guess
//  - photos the user deleted from the CRM (excluded) never stay or come back
// The tracker's max_image_count still caps it:
//  - cap unchanged since the last edit: no refill of slots the user freed by
//    deleting a photo -- they removed it on purpose
//  - cap raised (e.g. 8 -> 12): top up with the next source photos the user
//    hasn't already got or deliberately deleted
//  - cap lowered (e.g. 8 -> 5): keep the first N of the user's selection
// `curatedCap` is the cap that was in effect when the selection was last
// edited or adjusted (null = keep all); the returned one is the cap now.
// `seenSource` is the source gallery as it was at the last edit/crawl (null =
// not recorded yet: nothing counts as added or removed this time). The
// returned `seenSource` is the gallery now, to store for next time.
// A cleaned (watermark-removed) copy stands for its source photo when
// `processedSourceHash` can tell which one (hash embedded in the filename);
// `hashOfIdentity` must produce the same hash from a normalized identity.
export function computeCuratedImages(params: {
  curated: string[];
  canonical: string[];
  excluded: string[];
  maxImageCount: number | null;
  curatedCap: number | null;
  normalize: (url: string) => string;
  seenSource?: string[] | null;
  sourceShrunk?: boolean;
  processedSourceHash?: (url: string) => string | null;
  hashOfIdentity?: (identity: string) => string;
}): { images: string[]; curatedCap: number | null; seenSource: string[] } {
  const canonical = params.canonical.filter((url) => /^https?:\/\//i.test(url));
  if (params.maxImageCount === 0) {
    return {
      images: [],
      curatedCap: 0,
      seenSource: params.seenSource ?? canonical,
    };
  }

  const cap = params.maxImageCount ?? Number.POSITIVE_INFINITY;
  const previousCap = params.curatedCap ?? Number.POSITIVE_INFINITY;
  const excluded = new Set(params.excluded.map(params.normalize));
  const canonicalIds = new Set(canonical.map(params.normalize));
  const seenIds =
    params.seenSource == null
      ? null
      : new Set(params.seenSource.map(params.normalize));

  // Identity of the source photo an entry stands for (a cleaned copy maps to
  // its original when the filename says which), or null if unknown.
  const sourceIdByHash = new Map<string, string>();
  if (params.processedSourceHash && params.hashOfIdentity) {
    for (const id of [...canonicalIds, ...(seenIds ?? [])]) {
      sourceIdByHash.set(params.hashOfIdentity(id), id);
    }
  }
  const sourceIdOf = (url: string): string | null => {
    const hash = params.processedSourceHash?.(url);
    if (hash != null) return sourceIdByHash.get(hash) ?? null;
    return params.normalize(url);
  };

  const canFollowRemovals =
    seenIds != null && !params.sourceShrunk && canonical.length > 0;

  const present = new Set<string>();
  const images: string[] = [];
  for (const url of params.curated) {
    const identity = params.normalize(url);
    const sourceId = sourceIdOf(url);
    if (excluded.has(identity) || present.has(identity)) continue;
    if (sourceId != null && sourceId !== identity) {
      if (excluded.has(sourceId) || present.has(sourceId)) continue;
    }
    // The agency took this photo down since we last looked.
    if (
      canFollowRemovals &&
      sourceId != null &&
      seenIds!.has(sourceId) &&
      !canonicalIds.has(sourceId)
    ) {
      continue;
    }
    present.add(identity);
    if (sourceId != null) present.add(sourceId);
    images.push(url);
  }

  const addFromSource = (onlyNew: boolean) => {
    for (const url of canonical) {
      if (images.length >= cap) break;
      const identity = params.normalize(url);
      if (excluded.has(identity) || present.has(identity)) continue;
      if (onlyNew && seenIds!.has(identity)) continue;
      present.add(identity);
      images.push(url);
    }
  };
  // Photos the agency added after the edit go at the end.
  if (seenIds != null) addFromSource(true);
  if (cap > previousCap) addFromSource(false);

  // A gallery that looks like a crawler gap is not the new baseline.
  const keepOldBaseline = params.sourceShrunk || canonical.length === 0;
  return {
    images: images.slice(0, cap),
    curatedCap: params.maxImageCount,
    seenSource: keepOldBaseline ? (params.seenSource ?? canonical) : canonical,
  };
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
