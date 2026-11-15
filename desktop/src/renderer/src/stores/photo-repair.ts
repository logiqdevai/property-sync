import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { BlockStates, PhotoPhases, type PhotoState } from "@shared/ipc";

/** Mirror of the photo repair running in the Electron main process (see TaskStateSync). */
interface PhotoRepairStore {
  state: PhotoState;
  setState(state: PhotoState): void;
}

export const initialPhotoState: PhotoState = {
  agency_id: null,
  agency_name: null,
  phase: PhotoPhases.IDLE,
  block: BlockStates.NONE,
  total: 0,
  checked: 0,
  missing: 0,
  fixed: 0,
  still_missing: [],
  check_errors: 0,
  error: null,
  log: [],
};

const STORE_KEY = "photo-repair";

export const usePhotoRepairStore = create<PhotoRepairStore>()(
  devtools(
    (set) => ({
      state: initialPhotoState,
      setState: (state) => set({ state }),
    }),
    { name: STORE_KEY },
  ),
);

export const getPhotoRepairStoreState = () => usePhotoRepairStore.getState();
