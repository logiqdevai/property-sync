import type { StartPhotosRequest } from "@shared/ipc";
import { bridgeErrorMessage } from "@/features/crawl-session/services/crawl-session.services";

export const startPhotoRepair = async (request: StartPhotosRequest): Promise<void> => {
  try {
    await window.desktop.photos.start(request);
  } catch (error) {
    throw bridgeErrorMessage(error, "Could not start checking photos. Please try again.");
  }
};

export const stopPhotoRepair = async (): Promise<void> => {
  await window.desktop.photos.stop();
};

export const dismissPhotoRepair = async (): Promise<void> => {
  await window.desktop.photos.dismiss();
};
