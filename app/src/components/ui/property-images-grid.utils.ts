import type { DragEvent } from "react";

export const ORIGINAL_IMAGE_DRAG_TYPE = "application/x-original-image-indexes";

export function getCopyToTrackedConfirmation(count: number, removeWatermark: boolean) {
  const noun = count === 1 ? "photo" : "photos";
  return removeWatermark
    ? {
        title: `Copy ${count} ${noun} to tracked images (remove watermark)?`,
        description:
          "Each selected photo will be run through Dewatermark, then the clean result will be added to this property's tracked images and uploaded to the linked CRM.",
      }
    : {
        title: `Copy ${count} ${noun} to tracked images?`,
        description:
          "Selected normalized photos will be added to this property's tracked images and uploaded to the linked CRM.",
      };
}

export function parseDraggedImageIndexes(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is number => Number.isInteger(value) && value >= 0,
    );
  } catch {
    return [];
  }
}

export function hasOriginalImageDrag(event: DragEvent<HTMLDivElement>) {
  return Array.from(event.dataTransfer.types).includes(ORIGINAL_IMAGE_DRAG_TYPE);
}
