import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { UpdateStatuses, type UpdateState } from "@shared/ipc";

/** Mirror of the auto-updater in the main process (kept in sync by TaskStateSync). */
interface AppUpdateStore {
  state: UpdateState;
  setState(state: UpdateState): void;
}

export const initialUpdateState: UpdateState = {
  status: UpdateStatuses.IDLE,
  current_version: "",
  new_version: null,
  percent: 0,
  error: null,
};

const STORE_KEY = "app-update";

export const useAppUpdateStore = create<AppUpdateStore>()(
  devtools(
    (set) => ({
      state: initialUpdateState,
      setState: (state) => set({ state }),
    }),
    { name: STORE_KEY },
  ),
);

export const getAppUpdateStoreState = () => useAppUpdateStore.getState();
