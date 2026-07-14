import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  getTrackableAgencies,
  trackAgency,
  untrackAgency,
  updateAgencyTracking,
} from "../services/user-tracked-agencies.services";
import type {
  AgencyListQuery,
  TrackAgencyPayload,
} from "../interfaces/user-tracked-agencies.interfaces";

export const useTrackableAgencies = (query: AgencyListQuery) => {
  return useQuery({
    queryKey: ["trackableAgencies", query],
    queryFn: () => getTrackableAgencies(query),
  });
};

export const useTrackAgency = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      agencyId,
      payload,
    }: {
      agencyId: string;
      payload: TrackAgencyPayload;
    }) => trackAgency(agencyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      toast({ title: "Agency tracked", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not track agency",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateAgencyTracking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      agencyId,
      payload,
    }: {
      agencyId: string;
      payload: TrackAgencyPayload;
    }) => updateAgencyTracking(agencyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      toast({ title: "Tracking preferences saved", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save preferences",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUntrackAgency = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (agencyId: string) => untrackAgency(agencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      toast({ title: "Agency untracked", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not untrack agency",
        description: error.message,
        variant: "error",
      });
    },
  });
};
