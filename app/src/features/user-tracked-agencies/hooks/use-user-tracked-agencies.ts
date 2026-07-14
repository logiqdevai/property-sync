import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  getIntegrationLink,
  getTrackableAgencies,
  linkIntegration,
  trackAgency,
  unlinkIntegration,
  untrackAgency,
  updateAgencyTracking,
} from "../services/user-tracked-agencies.services";
import type {
  AgencyListQuery,
  LinkIntegrationPayload,
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

export const useIntegrationLink = (agencyId: string, enabled = true) => {
  return useQuery({
    queryKey: ["integrationLink", agencyId],
    queryFn: () => getIntegrationLink(agencyId),
    enabled: enabled && !!agencyId,
  });
};

export const useLinkIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      agencyId,
      payload,
    }: {
      agencyId: string;
      payload: LinkIntegrationPayload;
    }) => linkIntegration(agencyId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      queryClient.invalidateQueries({
        queryKey: ["integrationLink", variables.agencyId],
      });
      toast({ title: "Integration linked", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not link integration",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUnlinkIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (agencyId: string) => unlinkIntegration(agencyId),
    onSuccess: (_data, agencyId) => {
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      queryClient.invalidateQueries({ queryKey: ["integrationLink", agencyId] });
      toast({ title: "Integration unlinked", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not unlink integration",
        description: error.message,
        variant: "error",
      });
    },
  });
};
