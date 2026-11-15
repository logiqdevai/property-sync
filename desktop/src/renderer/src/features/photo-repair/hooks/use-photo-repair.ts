import { useMutation } from "@tanstack/react-query";
import { PhotoPhases, type PhotoState, type StartPhotosRequest } from "@shared/ipc";
import { toast } from "@/hooks/use-toast";
import { usePhotoRepairStore } from "@/stores/photo-repair";
import { dismissPhotoRepair, startPhotoRepair, stopPhotoRepair } from "../services/photo-repair.services";

export const isPhotoRepairActive = (state: PhotoState) =>
  state.phase === PhotoPhases.CHECKING || state.phase === PhotoPhases.FIXING;

/** The live photo-repair state, pushed from the main process. */
export const usePhotoRepair = () => usePhotoRepairStore((s) => s.state);

export const useStartPhotoRepair = () => {
  return useMutation({
    mutationFn: (request: StartPhotosRequest) => startPhotoRepair(request),
    onSuccess: () => {
      toast({ title: "Checking photos", description: "This reads every listing in the CRM.", duration: 3000 });
    },
    onError: (error: Error) => {
      toast({ title: "Could not check photos", description: error.message, variant: "error" });
    },
  });
};

export const useStopPhotoRepair = () => {
  return useMutation({
    mutationFn: () => stopPhotoRepair(),
    onSuccess: () => {
      toast({ title: "Stopping", duration: 2500 });
    },
    onError: (error: Error) => {
      toast({ title: "Could not stop", description: error.message, variant: "error" });
    },
  });
};

export const useDismissPhotoRepair = () => {
  return useMutation({
    mutationFn: () => dismissPhotoRepair(),
    onSuccess: () => undefined,
    onError: (error: Error) => {
      toast({ title: "Something went wrong", description: error.message, variant: "error" });
    },
  });
};
