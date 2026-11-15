import { useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useAppUpdateStore } from "@/stores/app-update";
import { installAppUpdate } from "../services/app-update.services";

/** The live auto-update state, pushed from the main process. */
export const useAppUpdate = () => useAppUpdateStore((s) => s.state);

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
