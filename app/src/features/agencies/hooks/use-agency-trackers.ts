import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { CreateConnectionPayload } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import {
  connectEstateWebForTracker,
  getAgencyTrackers,
  setCrmClientForTracker,
  trackAgencyUsers,
} from "../services/agencies.services";

export const useAgencyTrackers = (agencyId: string, enabled = true) => {
  return useQuery({
    queryKey: ["agencies", "trackers", agencyId],
    queryFn: () => getAgencyTrackers(agencyId),
    enabled: enabled && !!agencyId,
  });
};

export const useTrackAgencyUsers = (agencyId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userIds: string[]) => trackAgencyUsers(agencyId, userIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["agencies", "trackers", agencyId] });
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      const failed = data.results.filter((result) => !result.ok);
      toast({
        title:
          failed.length === 0
            ? "Agency tracked for selected users"
            : `Tracked for ${data.results.length - failed.length} of ${data.results.length} users`,
        description:
          failed.map((result) => `${result.email ?? result.user_id}: ${result.error}`).join("\n") ||
          undefined,
        duration: failed.length === 0 ? 2000 : 6000,
        variant: failed.length === 0 ? "success" : "error",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not track agency", description: error.message, variant: "error" });
    },
  });
};

export const useConnectEstateWebForTracker = (agencyId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: CreateConnectionPayload }) =>
      connectEstateWebForTracker(agencyId, userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies", "trackers", agencyId] });
      toast({ title: "EstateWeb account connected", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not connect EstateWeb", description: error.message, variant: "error" });
    },
  });
};

export const useSetCrmClientForTracker = (agencyId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, clientId }: { userId: string; clientId: number | null }) =>
      setCrmClientForTracker(agencyId, userId, clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies", "trackers", agencyId] });
      toast({ title: "CRM client saved", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not save CRM client", description: error.message, variant: "error" });
    },
  });
};
