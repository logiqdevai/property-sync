// A source gallery that lost half or more of its photos (e.g. cretahouses
// 54 -> 3 when the origin served truncated pages) is far more likely a
// crawler gap than the agency deleting photos; syncing the CRM to it would
// delete real photos. Small drops are normal -- e.g. nikiestate galleries
// going 8 -> 7 when a duplicate size variant of one photo collapsed -- and
// must still sync. `peakCount` is the largest the gallery has ever been.
export function isSourceGalleryShrunk(
  currentCount: number,
  peakCount: number | undefined,
  maxImageCount: number | null,
): boolean {
  if (peakCount == null) return false;
  const lostHalf = currentCount * 2 <= peakCount;
  if (maxImageCount == null) return lostHalf && peakCount >= currentCount + 5;
  return peakCount >= maxImageCount && currentCount < maxImageCount && lostHalf;
}

export interface ImageReconcilePlan {
  desired: string[];
  keptIdByIdentity: Map<string, number>;
  toDelete: number[];
  toUpload: string[];
  orderWrong: boolean;
}

// Decides how to turn a CRM gallery into exactly `desiredImages` (each once,
// in order, nothing else). A CRM image is kept only if its recorded
// source_image identity is one of the desired photos and no earlier CRM image
// already claimed that photo; everything else (duplicates, raw originals left
// next to their cleaned copy, photos beyond the cap, images we have no
// record of) is deleted. Excluded photos are neither kept nor re-uploaded.
export function planImageReconcile(params: {
  crmImageIds: number[];
  sourceById: Map<number, string>;
  desiredImages: string[];
  excludedImages: string[];
  isUploadBlocked: (url: string) => boolean;
  normalize: (url: string) => string;
}): ImageReconcilePlan {
  const excluded = new Set(params.excludedImages.map(params.normalize));
  const desired: string[] = [];
  const desiredIdentities = new Set<string>();
  for (const url of params.desiredImages) {
    // A scraped image without a host (e.g. creta-invest's trailing
    // "/appFol/.../img_2.jpg") can never be downloaded, so it's not a photo
    // the CRM can hold.
    if (!/^https?:\/\//i.test(url)) continue;
    const identity = params.normalize(url);
    if (excluded.has(identity) || desiredIdentities.has(identity)) continue;
    desiredIdentities.add(identity);
    desired.push(url);
  }

  const keptIdByIdentity = new Map<string, number>();
  const toDelete: number[] = [];
  for (const id of params.crmImageIds) {
    const source = params.sourceById.get(id);
    const identity = source ? params.normalize(source) : null;
    if (identity && desiredIdentities.has(identity) && !keptIdByIdentity.has(identity)) {
      keptIdByIdentity.set(identity, id);
    } else {
      toDelete.push(id);
    }
  }

  const toUpload = desired.filter(
    (url) =>
      !keptIdByIdentity.has(params.normalize(url)) && !params.isUploadBlocked(url),
  );

  const deleted = new Set(toDelete);
  const currentOrder = params.crmImageIds.filter((id) => !deleted.has(id));
  const desiredOrder = desired
    .map((url) => keptIdByIdentity.get(params.normalize(url)))
    .filter((id): id is number => id != null);

  return {
    desired,
    keptIdByIdentity,
    toDelete,
    toUpload,
    orderWrong: currentOrder.join(',') !== desiredOrder.join(','),
  };
}
