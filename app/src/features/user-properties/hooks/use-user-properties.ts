import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  deleteAdminUserProperties,
  deleteAdminUserProperty,
  deleteUserProperties,
  deleteUserProperty,
  dedupeAdminUserPropertyGroups,
  dedupeUserPropertyGroups,
  getAdminUserProperties,
  getAdminUserPropertiesCount,
  getAdminUserProperty,
  getUserProperties,
  getUserPropertiesCount,
  getUserProperty,
  pushUserPropertiesToCrm,
  pushUserPropertyToCrm,
  migrateAdminUserPropertyIntegrationImages,
  migrateUserPropertyIntegrationImages,
  deleteAdminUserPropertyIntegrationImages,
  deleteUserPropertyIntegrationImages,
  createAdminUserPropertyIntegrationImages,
  createUserPropertyIntegrationImages,
  splitAdminUserProperties,
  splitUserProperties,
  truncateAdminUserPropertyDescriptions,
  truncateUserPropertyDescriptions,
  updateUserProperty,
} from "../services/user-properties.services";
import type {
  AdminUserPropertyCountQuery,
  AdminUserPropertyListQuery,
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

export const useAdminUserProperties = (query: AdminUserPropertyListQuery) => {
  return useQuery({
    queryKey: ["adminUserProperties", "list", query],
    queryFn: () => getAdminUserProperties(query),
  });
};

export const useUserPropertiesCount = (query: UserPropertyCountQuery) => {
  return useQuery({
    queryKey: ["userProperties", "count", query],
    queryFn: () => getUserPropertiesCount(query),
  });
};

export const useAdminUserPropertiesCount = (
  query: AdminUserPropertyCountQuery,
) => {
  return useQuery({
    queryKey: ["adminUserProperties", "count", query],
    queryFn: () => getAdminUserPropertiesCount(query),
  });
};

export const useUserProperty = (id: string) => {
  return useQuery({
    queryKey: ["userProperties", "detail", id],
    queryFn: () => getUserProperty(id),
    enabled: !!id,
  });
};

export const useAdminUserProperty = (id: string) => {
  return useQuery({
    queryKey: ["adminUserProperties", "detail", id],
    queryFn: () => getAdminUserProperty(id),
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

export const useMigrateUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => migrateUserPropertyIntegrationImages(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      const count = data.integration_property?.images?.length ?? 0;
      toast({
        title: "CRM images migrated",
        description:
          count > 0
            ? `Stored ${count} ${count === 1 ? "image" : "images"} from EstateWeb.`
            : "IntegrationProperty updated (no images returned).",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not migrate CRM images",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useMigrateAdminUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => migrateAdminUserPropertyIntegrationImages(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["adminUserProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      const count = data.integration_property?.images?.length ?? 0;
      toast({
        title: "CRM images migrated",
        description:
          count > 0
            ? `Stored ${count} ${count === 1 ? "image" : "images"} from EstateWeb.`
            : "IntegrationProperty updated (no images returned).",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not migrate CRM images",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, imageIds }: { id: string; imageIds: number[] }) =>
      deleteUserPropertyIntegrationImages(id, imageIds),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      const count = variables.imageIds.length;
      toast({
        title: "CRM images deleted",
        description: `Removed ${count} ${count === 1 ? "image" : "images"} from CRM.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete CRM images",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteAdminUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, imageIds }: { id: string; imageIds: number[] }) =>
      deleteAdminUserPropertyIntegrationImages(id, imageIds),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["adminUserProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      const count = variables.imageIds.length;
      toast({
        title: "CRM images deleted",
        description: `Removed ${count} ${count === 1 ? "image" : "images"} from CRM.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete CRM images",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useCreateUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      imageIndexes,
    }: {
      id: string;
      imageIndexes: number[];
    }) => createUserPropertyIntegrationImages(id, imageIndexes),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      const count = variables.imageIndexes.length;
      toast({
        title: "Photos uploaded to CRM",
        description: `Uploaded ${count} ${count === 1 ? "photo" : "photos"}.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not upload photos",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useCreateAdminUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      imageIndexes,
    }: {
      id: string;
      imageIndexes: number[];
    }) => createAdminUserPropertyIntegrationImages(id, imageIndexes),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["adminUserProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      const count = variables.imageIndexes.length;
      toast({
        title: "Photos uploaded to CRM",
        description: `Uploaded ${count} ${count === 1 ? "photo" : "photos"}.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not upload photos",
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

export const useDeleteAdminUserProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAdminUserProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      toast({
        title: "User property deleted",
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete user property",
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

export const useDeleteAdminUserProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteUserPropertiesPayload) =>
      deleteAdminUserProperties(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      toast({
        title: "User properties deleted",
        description: `Deleted ${result.deleted} ${result.deleted === 1 ? "property" : "properties"}.`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete user properties",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useTruncateAdminUserPropertyDescriptions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TruncateUserPropertyDescriptionsPayload) =>
      truncateAdminUserPropertyDescriptions(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
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

export const useDedupeAdminUserPropertyGroups = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DedupeUserPropertiesPayload) =>
      dedupeAdminUserPropertyGroups(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
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

export const useSplitAdminUserProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SplitUserPropertiesPayload) =>
      splitAdminUserProperties(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
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
