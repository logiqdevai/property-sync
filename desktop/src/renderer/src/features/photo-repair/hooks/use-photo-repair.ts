import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { BlockStates, PhotoPhases, type PhotoState, type StartPhotosRequest } from "@shared/ipc";
import { toast } from "@/hooks/use-toast";
import { usePhotoRepairStore } from "@/stores/photo-repair";
import { dismissPhotoRepair, startPhotoRepair, startPhotoRepairs, stopPhotoRepair } from "../services/photo-repair.services";

export const isPhotoRepairActive = (state: PhotoState | null | undefined): boolean =>
  !!state &&
  (state.phase === PhotoPhases.QUEUED ||
    state.phase === PhotoPhases.CHECKING ||
    state.phase === PhotoPhases.FIXING);

/** Every photo check of this session, by agency id. */
export const usePhotoRepairs = () => usePhotoRepairStore((s) => s.states);

/** One agency's photo check, or null when it hasn't been checked in this session. */
export const usePhotoRepair = (agencyId: string) => usePhotoRepairStore((s) => s.states[agencyId] ?? null);

/** The photo checks currently running, and how many of them wait for the user (robot check). */
export const useActivePhotoRepairs = () => {
  const states = usePhotoRepairs();
  return useMemo(() => {
    const active = Object.values(states).filter(isPhotoRepairActive);
    return { active, needsUser: active.filter((s) => s.block === BlockStates.NEEDS_USER) };
  }, [states]);
};

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

/** Starts the photo check of several agencies at once (each in its own Chrome tab). */
export const useStartPhotoRepairs = () => {
  return useMutation({
    mutationFn: (input: { requests: StartPhotosRequest[]; concurrency: number }) =>
      startPhotoRepairs(input.requests, input.concurrency),
    onSuccess: (failures, { requests, concurrency }) => {
      const started = requests.length - failures.length;
      if (started > 0) {
        const queued = started > concurrency;
        toast({
          title: `Checking photos of ${started} agenc${started === 1 ? "y" : "ies"}`,
          description: queued
            ? `${concurrency} at a time; the next one starts by itself when one finishes. Leave Chrome open.`
            : "Each runs in its own Chrome tab. Leave Chrome open until they finish.",
          duration: 4000,
          variant: "success",
        });
      }
      if (failures.length > 0) {
        toast({
          title: `${failures.length} could not start`,
          description: failures.map((f) => `${f.agency_name}: ${f.reason}`).join(" · "),
          variant: "warning",
        });
      }
    },
  });
};

export const useStopPhotoRepair = () => {
  return useMutation({
    mutationFn: (agencyId: string) => stopPhotoRepair(agencyId),
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
    mutationFn: (agencyId: string) => dismissPhotoRepair(agencyId),
    onSuccess: () => undefined,
    onError: (error: Error) => {
      toast({ title: "Something went wrong", description: error.message, variant: "error" });
    },
  });
};
