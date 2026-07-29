import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
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

export const useDeleteContentPublishingConfig = (agencyId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteContentPublishingConfig(agencyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-publishing"] });
      toast({
        title: "Content publishing removed",
        duration: 2000,
        variant: "success",
      });
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
