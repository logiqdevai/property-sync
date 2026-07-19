import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  deleteUserProperties,
  deleteUserProperty,
  dedupeUserPropertyGroups,
  getUserProperties,
  getUserPropertiesCount,
  getUserProperty,
  pushUserPropertiesToCrm,
  pushUserPropertyToCrm,
  splitUserProperties,
  truncateUserPropertyDescriptions,
  updateUserProperty,
} from "../services/user-properties.services";
import type {
  DeleteUserPropertiesPayload,
  DedupeUserPropertiesPayload,
  PushUserPropertiesToCrmPayload,
  PushUserPropertiesToCrmResult,
  SplitUserPropertiesPayload,
  TruncateUserPropertyDescriptionsPayload,
  UpdateUserPropertyPayload,
  UserPropertyCountQuery,
  UserPropertyListQuery,
} from "../interfaces/user-properties.interfaces";

export const useUserProperties = (query: UserPropertyListQuery) => {
  return useQuery({
    queryKey: ["userProperties", "list", query],
    queryFn: () => getUserProperties(query),
  });
};

export const useUserPropertiesCount = (query: UserPropertyCountQuery) => {
  return useQuery({
    queryKey: ["userProperties", "count", query],
    queryFn: () => getUserPropertiesCount(query),
  });
};

export const useUserProperty = (id: string) => {
  return useQuery({
    queryKey: ["userProperties", "detail", id],
    queryFn: () => getUserProperty(id),
    enabled: !!id,
  });
};

export const useUpdateUserProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPropertyPayload }) =>
      updateUserProperty(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({ title: "Property saved", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save property",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const usePushUserPropertyToCrm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pushUserPropertyToCrm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });
      toast({
        title: "EstateWeb sync queued",
        description: "Property will be pushed to your linked EstateWeb CRM shortly.",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not push to CRM",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const usePushUserPropertiesToCrm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PushUserPropertiesToCrmPayload) =>
      pushUserPropertiesToCrm(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });

      if ("queued" in result) {
        const bulk = result as PushUserPropertiesToCrmResult;
        toast({
          title: "EstateWeb sync queued",
          description:
            bulk.failed.length > 0
              ? `Queued ${bulk.queued}. ${bulk.failed.length} failed.`
              : `${bulk.queued} ${bulk.queued === 1 ? "property" : "properties"} will be pushed shortly.`,
          duration: 2500,
          variant: bulk.failed.length > 0 ? "warning" : "success",
        });
        return;
      }

      toast({
        title: "EstateWeb sync queued",
        description: "Property will be pushed to your linked EstateWeb CRM shortly.",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not push to CRM",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteUserProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteUserProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({ title: "Property deleted", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete property",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteUserProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteUserPropertiesPayload) => deleteUserProperties(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({ title: "Properties deleted", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete properties",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDedupeUserPropertyGroups = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DedupeUserPropertiesPayload) =>
      dedupeUserPropertyGroups(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({
        title: "Kept one per group",
        description: `Deleted ${result.deleted} duplicate ${result.deleted === 1 ? "property" : "properties"}.`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not keep one per group",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useSplitUserProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SplitUserPropertiesPayload) =>
      splitUserProperties(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({
        title: "Split from group",
        description: `Removed ${result.split} ${result.split === 1 ? "property" : "properties"} from duplicate groups.`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not split from group",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useTruncateUserPropertyDescriptions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TruncateUserPropertyDescriptionsPayload) =>
      truncateUserPropertyDescriptions(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      queryClient.invalidateQueries({ queryKey: ["trackableAgencies"] });
      toast({
        title: "Text truncated",
        description: `Updated ${result.updated} of ${result.total} ${result.total === 1 ? "property" : "properties"}.`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not truncate text",
        description: error.message,
        variant: "error",
      });
    },
  });
};
