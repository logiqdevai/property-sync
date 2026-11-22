import { useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useAppUpdateStore } from "@/stores/app-update";
import { UpdateStatuses } from "@shared/ipc";
import { checkAppUpdate, installAppUpdate } from "../services/app-update.services";

/** The live auto-update state, pushed from the main process. */
export const useAppUpdate = () => useAppUpdateStore((s) => s.state);

/** The header's "Check for updates" button; says what it found. */
export const useCheckAppUpdate = () => {
  return useMutation({
    mutationFn: () => checkAppUpdate(),
    onSuccess: () => {
      const { status, new_version, error } = useAppUpdateStore.getState().state;
      if (status === UpdateStatuses.UP_TO_DATE) {
        toast({ title: "You're up to date", duration: 3000, variant: "success" });
      } else if (status === UpdateStatuses.ERROR) {
        toast({ title: "Could not check for updates", description: error ?? undefined, variant: "warning" });
      } else {
        toast({ title: `Version ${new_version ?? ""} found`, description: "It downloads in the background.", duration: 3000 });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Could not check for updates", description: error.message, variant: "warning" });
    },
  });
};

export const useInstallAppUpdate = () => {
  return useMutation({
    mutationFn: () => installAppUpdate(),
    onSuccess: () => {
      toast({ title: "Restarting to update", duration: 3000 });
    },
    onError: (error: Error) => {
      toast({ title: "Can't update right now", description: error.message, variant: "warning" });
    },
  });
};
