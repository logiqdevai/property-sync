import type { StartPhotosRequest } from "@shared/ipc";
import { bridgeErrorMessage } from "@/features/crawl-session/services/crawl-session.services";

export const startPhotoRepair = async (request: StartPhotosRequest): Promise<void> => {
  try {
    await window.desktop.photos.start(request);
  } catch (error) {
    throw bridgeErrorMessage(error, "Could not start checking photos. Please try again.");
  }
};

export const stopPhotoRepair = async (agencyId: string): Promise<void> => {
  await window.desktop.photos.stop(agencyId);
};

export const dismissPhotoRepair = async (agencyId: string): Promise<void> => {
  await window.desktop.photos.dismiss(agencyId);
};

/** Queues several photo checks, `concurrency` at a time; returns the ones that could not be queued. */
export const startPhotoRepairs = async (
  requests: StartPhotosRequest[],
  concurrency: number,
): Promise<Array<{ agency_name: string; reason: string }>> => {
  try {
    return await window.desktop.photos.startQueue(requests, concurrency);
  } catch (error) {
    throw bridgeErrorMessage(error, "Could not start checking photos. Please try again.");
  }
};
