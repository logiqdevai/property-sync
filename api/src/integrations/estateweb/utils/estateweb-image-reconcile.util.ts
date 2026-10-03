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
