import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  bulkSetAiBatch,
  deleteContentPublishingConfig,
  getContentPublishingConfig,
  upsertContentPublishingConfig,
} from "../services/content-publishing.services";
import type { UpsertContentPublishingConfigPayload } from "../interfaces/content-publishing.interfaces";

export const useContentPublishingConfig = (
  agencyId: string,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["content-publishing", agencyId],
    queryFn: () => getContentPublishingConfig(agencyId),
    enabled: enabled && !!agencyId,
  });
};

export const useLoadContentPublishingConfig = () => {
  return useMutation({
    mutationFn: (agencyId: string) => getContentPublishingConfig(agencyId),
  });
};

export const useUpsertContentPublishingConfig = (agencyId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertContentPublishingConfigPayload) =>
      upsertContentPublishingConfig(agencyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-publishing"] });
      toast({
        title: "Content publishing saved",
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save content publishing",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useBulkSetAiBatch = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (useAiBatch: boolean) => bulkSetAiBatch(useAiBatch),
    onSuccess: (result, useAiBatch) => {
      queryClient.invalidateQueries({ queryKey: ["content-publishing"] });
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      toast({
        title: `AI batch ${useAiBatch ? "enabled" : "disabled"} for ${result.updated} ${result.updated === 1 ? "agency" : "agencies"}`,
        duration: 3000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update AI batch setting",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteContentPublishingConfig = (agencyId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteContentPublishingConfig(agencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-publishing"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not remove content publishing",
        description: error.message,
        variant: "error",
      });
    },
  });
};
