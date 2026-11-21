import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { PhotoStates } from "@shared/ipc";

/**
 * Mirror of every photo check in the Electron main process, by agency id (kept in sync by
 * TaskStateSync). Not persisted: the main process is the source of truth and re-sends it.
 */
interface PhotoRepairStore {
  states: PhotoStates;
  setStates(states: PhotoStates): void;
}

const STORE_KEY = "photo-repair";

export const usePhotoRepairStore = create<PhotoRepairStore>()(
  devtools(
    (set) => ({
      states: {},
      setStates: (states) => set({ states }),
    }),
    { name: STORE_KEY },
  ),
);

export const getPhotoRepairStoreState = () => usePhotoRepairStore.getState();
