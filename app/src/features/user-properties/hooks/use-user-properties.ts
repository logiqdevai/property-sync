import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { QueryClient } from "@tanstack/react-query";
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
  getUserPropertiesMap,
  getUserProperty,
  pushUserPropertiesToCrm,
  pushUserPropertyToCrm,
  pushUserPropertiesImagesToCrm,
  pushUserPropertyImagesToCrm,
  migrateAdminUserPropertyIntegrationImages,
  migrateUserPropertyIntegrationImages,
  deleteAdminUserPropertyIntegrationImages,
  deleteUserPropertyIntegrationImages,
  getAdminUserPropertyImageJob,
  getUserPropertyImageJob,
  createAdminUserPropertyIntegrationImages,
  createUserPropertyIntegrationImages,
  copyUserPropertyNormalizedImages,
  updateAdminUserPropertyIntegrationImages,
  reorderUserPropertyIntegrationImages,
  resetUserPropertyImages,
  updateUserPropertyIntegrationImages,
  removeAdminUserPropertyWatermarkImages,
  removeUserPropertyWatermarkImages,
  removeUserPropertiesWatermarkImages,
  produceUserPropertyContent,
  renormalizeUserProperties,
  geocodeMissingCoordinates,
  getUserPropertiesMissingCoordinatesCount,
  resolveEstateWebLocations,
  bulkDeleteUserPropertyIntegrationImages,
  bulkMigrateUserPropertyIntegrationImages,
  splitAdminUserProperties,
  splitUserProperties,
  truncateAdminUserPropertyDescriptions,
  truncateUserPropertyDescriptions,
  updateUserProperty,
  updateUserPropertyEstateWebSites,
  updateUserPropertySalesPrices,
  updateUserPropertyStatus,
  syncUserPropertyCrmClientNotes,
  checkEstateWebRemoval,
  fixEstateWebRemoval,
  getAgencyWatermarkSettings,
  previewCrmImageSync,
  runCrmImageSync,
} from "../services/user-properties.services";
import type {
  AdminUserPropertyCountQuery,
  AdminUserPropertyListQuery,
  DeleteUserPropertiesPayload,
  DedupeUserPropertiesPayload,
  CrmImageSyncPayload,
  PushUserPropertiesToCrmPayload,
  PushUserPropertiesToCrmResult,
  PushUserPropertiesImagesToCrmPayload,
  PushUserPropertiesImagesToCrmResult,
  UpdateEstateWebSitesPayload,
  UpdateSalesPricesPayload,
  SyncCrmClientNotesPayload,
  CheckEstateWebRemovalPayload,
  FixEstateWebRemovalPayload,
  RenormalizeUserPropertiesPayload,
  BulkDeleteIntegrationImagesPayload,
  PendingImageOp,
  BulkMigrateIntegrationImagesPayload,
  SplitUserPropertiesPayload,
  TruncateUserPropertyDescriptionsPayload,
  ReorderIntegrationImagesPayload,
  UpdateIntegrationImagesPayload,
  MigrateIntegrationImagesPayload,
  RemoveWatermarkImagesPayload,
  BulkRemoveWatermarkImagesPayload,
  BulkRemoveWatermarkImagesResponse,
  ProduceUserPropertyContentPayload,
  ProduceUserPropertyContentResponse,
  UpdateUserPropertyPayload,
  UpdateUserPropertyStatusPayload,
  UpdateUserPropertyStatusResult,
  UserPropertyCountQuery,
  UserPropertyListQuery,
  UserPropertyMapQuery,
} from "../interfaces/user-properties.interfaces";

export const useUserProperties = (query: UserPropertyListQuery) => {
  return useQuery({
    queryKey: ["userProperties", "list", query],
    queryFn: () => getUserProperties(query),
  });
};

export const useUserPropertiesMap = (
  query: UserPropertyMapQuery,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["userProperties", "map", query],
    queryFn: () => getUserPropertiesMap(query),
    enabled: options?.enabled ?? true,
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
        description: "Property will be pushed to your linked EstateWeb CMS shortly.",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not push to CMS",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const usePushUserPropertyImagesToCrm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pushUserPropertyImagesToCrm(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({
        title: "Images pushed to CRM",
        description: "Scraped photos were uploaded to the linked EstateWeb CMS.",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not push images to CMS",
        description: error.message,
        variant: "error",
      });
    },
  });
};

const IMAGE_JOB_POLL_INTERVAL_MS = 3000;
const IMAGE_JOB_POLL_TIMEOUT_MS = 15 * 60 * 1000;

const pendingImageOpsKey = (propertyId: string) => ["imageOps", propertyId];

function getPendingImageOps(queryClient: QueryClient, propertyId: string) {
  return queryClient.getQueryData<PendingImageOp[]>(pendingImageOpsKey(propertyId)) ?? [];
}

function addPendingImageOp(queryClient: QueryClient, propertyId: string, op: PendingImageOp) {
  queryClient.setQueryData(pendingImageOpsKey(propertyId), [...getPendingImageOps(queryClient, propertyId), op]);
}

function replacePendingImageOpId(queryClient: QueryClient, propertyId: string, tempId: string, jobLogId: string) {
  queryClient.setQueryData(
    pendingImageOpsKey(propertyId),
    getPendingImageOps(queryClient, propertyId).map((op) => (op.id === tempId ? { ...op, id: jobLogId } : op)),
  );
}

function removePendingImageOp(queryClient: QueryClient, propertyId: string, opId: string) {
  queryClient.setQueryData(
    pendingImageOpsKey(propertyId),
    getPendingImageOps(queryClient, propertyId).filter((op) => op.id !== opId),
  );
}

// Adds and removals show on the property's photos until their work settles (inline or queued).
export const usePendingImageOps = (propertyId: string): PendingImageOp[] => {
  const { data } = useQuery({
    queryKey: pendingImageOpsKey(propertyId),
    queryFn: () => [] as PendingImageOp[],
    enabled: false,
    initialData: [] as PendingImageOp[],
    staleTime: Infinity,
  });
  return data;
};

// The first N CRM photos are what a by-count watermark removal works on.
function firstCrmImageIds(queryClient: QueryClient, propertyId: string, count: number): number[] {
  const detail = queryClient.getQueryData<{
    integration_property?: { images?: Array<{ id?: unknown }> | null } | null;
  }>(["userProperties", "detail", propertyId]);
  return (detail?.integration_property?.images ?? [])
    .slice(0, count)
    .map((image) => image.id)
    .filter((id): id is number => typeof id === "number");
}

// Users can't read job logs, so the property's photos are refetched once the queued job settles.
function trackQueuedImageJob(
  queryClient: QueryClient,
  {
    jobLogId,
    propertyId,
    admin,
    label,
  }: { jobLogId: string; propertyId: string; admin: boolean; label: string },
) {
  const queryKey = [admin ? "adminUserProperties" : "userProperties"];
  const startedAt = Date.now();
  const check = async () => {
    try {
      const job = admin
        ? await getAdminUserPropertyImageJob(propertyId, jobLogId)
        : await getUserPropertyImageJob(propertyId, jobLogId);
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        await queryClient.invalidateQueries({ queryKey });
        removePendingImageOp(queryClient, propertyId, jobLogId);
        if (job.status === "COMPLETED") {
          toast({ title: `${label} finished`, duration: 3000, variant: "success" });
        } else {
          toast({
            title: `${label} failed`,
            description: job.error_message ?? undefined,
            variant: "error",
          });
        }
        return;
      }
    } catch {
      // A failed status read is retried on the next tick.
    }
    if (Date.now() - startedAt < IMAGE_JOB_POLL_TIMEOUT_MS) {
      setTimeout(check, IMAGE_JOB_POLL_INTERVAL_MS);
    } else {
      removePendingImageOp(queryClient, propertyId, jobLogId);
    }
  };
  setTimeout(check, IMAGE_JOB_POLL_INTERVAL_MS);
}

export const useMigrateUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      mode,
    }: { id: string } & MigrateIntegrationImagesPayload) =>
      migrateUserPropertyIntegrationImages(id, { mode }),
    onSuccess: (data) => {
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      const count = data.integration_property?.images?.length ?? 0;
      toast({
        title: "CMS images migrated",
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
        title: "Could not migrate CMS images",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useMigrateAdminUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      mode,
    }: { id: string } & MigrateIntegrationImagesPayload) =>
      migrateAdminUserPropertyIntegrationImages(id, { mode }),
    onSuccess: (data) => {
      queryClient.setQueryData(["adminUserProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      const count = data.integration_property?.images?.length ?? 0;
      toast({
        title: "CMS images migrated",
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
        title: "Could not migrate CMS images",
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
    onMutate: ({ id, imageIds }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, { id: tempId, kind: "remove", crmImageIds: imageIds });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      replacePendingImageOpId(queryClient, variables.id, context.tempId, data.job_log_id);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      trackQueuedImageJob(queryClient, {
        jobLogId: data.job_log_id,
        propertyId: variables.id,
        admin: false,
        label: "CMS image delete",
      });
      toast({
        title: "CMS image delete started",
        description: data.message,
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not delete CMS images",
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
    onMutate: ({ id, imageIds }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, { id: tempId, kind: "remove", crmImageIds: imageIds });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      replacePendingImageOpId(queryClient, variables.id, context.tempId, data.job_log_id);
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      trackQueuedImageJob(queryClient, {
        jobLogId: data.job_log_id,
        propertyId: variables.id,
        admin: true,
        label: "CMS image delete",
      });
      toast({
        title: "CMS image delete started",
        description: data.message,
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not delete CMS images",
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
    onMutate: ({ id, imageIndexes }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, { id: tempId, kind: "add", count: imageIndexes.length });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context.tempId);
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      const count = variables.imageIndexes.length;
      toast({
        title: "Photos uploaded to CMS",
        description: `Uploaded ${count} ${count === 1 ? "photo" : "photos"}.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not upload photos",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useCopyUserPropertyNormalizedImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      imageIndexes,
      removeWatermark,
    }: {
      id: string;
      imageIndexes: number[];
      removeWatermark?: boolean;
    }) => copyUserPropertyNormalizedImages(id, imageIndexes, removeWatermark),
    onMutate: ({ id, imageIndexes }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, { id: tempId, kind: "add", count: imageIndexes.length });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      replacePendingImageOpId(queryClient, variables.id, context.tempId, data.job_log_id);
      trackQueuedImageJob(queryClient, {
        jobLogId: data.job_log_id,
        propertyId: variables.id,
        admin: false,
        label: "Copy to CRM",
      });
      toast({
        title: "Copy to tracked images started",
        description: data.message,
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not copy photos",
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
    onMutate: ({ id, imageIndexes }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, { id: tempId, kind: "add", count: imageIndexes.length });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context.tempId);
      queryClient.setQueryData(["adminUserProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      const count = variables.imageIndexes.length;
      toast({
        title: "Photos uploaded to CMS",
        description: `Uploaded ${count} ${count === 1 ? "photo" : "photos"}.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not upload photos",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useResetUserPropertyImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resetUserPropertyImages(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({
        title: "Photos reset",
        description:
          "This property follows the agency's photos again, and the CRM was updated to match.",
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not reset the photos",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useReorderUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & ReorderIntegrationImagesPayload) =>
      reorderUserPropertyIntegrationImages(id, payload),
    onMutate: ({ id, image_ids }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, { id: tempId, kind: "reorder", imageIds: image_ids });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      replacePendingImageOpId(queryClient, variables.id, context.tempId, data.job_log_id);
      trackQueuedImageJob(queryClient, {
        jobLogId: data.job_log_id,
        propertyId: variables.id,
        admin: false,
        label: "Image reorder",
      });
      toast({
        title: "Image reorder started",
        description: data.message,
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not reorder images",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & UpdateIntegrationImagesPayload) =>
      updateUserPropertyIntegrationImages(id, payload),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["userProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      const count = variables.image_ids.length;
      toast({
        title: "CMS image options updated",
        description: `Updated ${count} ${count === 1 ? "image" : "images"}.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update CMS image options",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useRemoveUserPropertyWatermarkImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & RemoveWatermarkImagesPayload) =>
      removeUserPropertyWatermarkImages(id, payload),
    onMutate: ({ id, image_ids }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, {
        id: tempId,
        kind: "remove",
        crmImageIds: (image_ids ?? []).map(Number),
      });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      replacePendingImageOpId(queryClient, variables.id, context.tempId, data.job_log_id);
      trackQueuedImageJob(queryClient, {
        jobLogId: data.job_log_id,
        propertyId: variables.id,
        admin: false,
        label: "Watermark removal",
      });
      toast({
        title: "Watermark removal started",
        description: data.message,
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not start watermark removal",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useRemoveUserPropertiesWatermarkImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BulkRemoveWatermarkImagesPayload) =>
      removeUserPropertiesWatermarkImages(payload),
    onMutate: (payload) => {
      if (payload.ids.length !== 1) return { tempId: null as string | null };
      const [id] = payload.ids;
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, {
        id: tempId,
        kind: "remove",
        crmImageIds: firstCrmImageIds(queryClient, id, payload.image_count),
      });
      return { tempId };
    },
    onSuccess: (data, payload, context) => {
      if (payload.ids.length === 1 && context?.tempId) {
        const [id] = payload.ids;
        const jobLogId = (data as { job_log_id?: string }).job_log_id;
        if (jobLogId) {
          replacePendingImageOpId(queryClient, id, context.tempId, jobLogId);
          trackQueuedImageJob(queryClient, {
            jobLogId,
            propertyId: id,
            admin: false,
            label: "Watermark removal",
          });
        } else {
          removePendingImageOp(queryClient, id, context.tempId);
        }
      }
      const bulk = data as BulkRemoveWatermarkImagesResponse;
      const failedCount = Array.isArray(bulk.failed) ? bulk.failed.length : 0;
      toast({
        title: "Watermark removal started",
        description:
          failedCount > 0
            ? `${data.message} ${failedCount} failed.`
            : data.message,
        duration: 4000,
        variant: failedCount > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error, payload, context) => {
      if (context?.tempId) removePendingImageOp(queryClient, payload.ids[0], context.tempId);
      toast({
        title: "Could not start watermark removal",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useProduceUserPropertyContent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProduceUserPropertyContentPayload) =>
      produceUserPropertyContent(payload),
    onSuccess: (data: ProduceUserPropertyContentResponse) => {
      void queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      const skipped = data.skipped?.length ?? 0;
      toast({
        title: "Content production started",
        description:
          skipped > 0
            ? `${data.message} ${skipped} skipped.`
            : data.message,
        duration: 6000,
        variant: skipped > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not start content production",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useRemoveAdminUserPropertyWatermarkImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & RemoveWatermarkImagesPayload) =>
      removeAdminUserPropertyWatermarkImages(id, payload),
    onMutate: ({ id, image_ids }) => {
      const tempId = `temp-${Date.now()}`;
      addPendingImageOp(queryClient, id, {
        id: tempId,
        kind: "remove",
        crmImageIds: (image_ids ?? []).map(Number),
      });
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      replacePendingImageOpId(queryClient, variables.id, context.tempId, data.job_log_id);
      trackQueuedImageJob(queryClient, {
        jobLogId: data.job_log_id,
        propertyId: variables.id,
        admin: true,
        label: "Watermark removal",
      });
      toast({
        title: "Watermark removal started",
        description: data.message,
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error, variables, context) => {
      removePendingImageOp(queryClient, variables.id, context?.tempId ?? "");
      toast({
        title: "Could not start watermark removal",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateAdminUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & UpdateIntegrationImagesPayload) =>
      updateAdminUserPropertyIntegrationImages(id, payload),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["adminUserProperties", "detail", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["adminUserProperties"] });
      const count = variables.image_ids.length;
      toast({
        title: "CMS image options updated",
        description: `Updated ${count} ${count === 1 ? "image" : "images"}.`,
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update CMS image options",
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

      if ("job_log_id" in result) {
        const bulk = result as PushUserPropertiesToCrmResult;
        toast({
          title: "EstateWeb sync queued",
          description:
            bulk.failed.length > 0
              ? `Queued ${bulk.enqueued}. ${bulk.failed.length} failed.`
              : `${bulk.enqueued} ${bulk.enqueued === 1 ? "property" : "properties"} will be pushed in the background.`,
          duration: 2500,
          variant: bulk.failed.length > 0 ? "warning" : "success",
        });
        return;
      }

      toast({
        title: "EstateWeb sync queued",
        description: "Property will be pushed to your linked EstateWeb CMS shortly.",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not push to CMS",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const usePushUserPropertiesImagesToCrm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PushUserPropertiesImagesToCrmPayload) =>
      pushUserPropertiesImagesToCrm(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      if ("job_log_id" in result) {
        const bulk = result as PushUserPropertiesImagesToCrmResult;
        toast({
          title: "Image push to CRM queued",
          description:
            bulk.failed.length > 0
              ? `Queued ${bulk.enqueued}. ${bulk.failed.length} failed.`
              : `${bulk.enqueued} ${bulk.enqueued === 1 ? "property" : "properties"} will have their images pushed in the background.`,
          duration: 2500,
          variant: bulk.failed.length > 0 ? "warning" : "success",
        });
        return;
      }

      toast({
        title: "Images pushed to CRM",
        description: "Scraped photos were uploaded to the linked EstateWeb CMS.",
        duration: 2500,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not push images to CMS",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateUserPropertyEstateWebSites = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateEstateWebSitesPayload) =>
      updateUserPropertyEstateWebSites(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      toast({
        title: "EstateWeb sites update started",
        description:
          result.failed.length > 0
            ? `Enqueued ${result.enqueued}. ${result.failed.length} could not be enqueued.`
            : `Updating sites for ${result.enqueued} ${result.enqueued === 1 ? "property" : "properties"} on EstateWeb in the background.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update EstateWeb sites",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateUserPropertySalesPrices = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateSalesPricesPayload) =>
      updateUserPropertySalesPrices(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      toast({
        title: "Sales price update started",
        description:
          result.failed.length > 0
            ? `Enqueued ${result.enqueued}. ${result.failed.length} could not be enqueued.`
            : `Updating prices for ${result.enqueued} ${result.enqueued === 1 ? "property" : "properties"} on CRM in the background.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update sales prices",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useSyncUserPropertyCrmClientNotes = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SyncCrmClientNotesPayload) =>
      syncUserPropertyCrmClientNotes(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      toast({
        title: "CRM client notes sync started",
        description:
          result.failed.length > 0
            ? `Enqueued ${result.enqueued}. ${result.failed.length} could not be enqueued.`
            : `Syncing notes for ${result.enqueued} ${result.enqueued === 1 ? "property" : "properties"} in the background. Track progress in Job queue.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not sync CRM client notes",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useCheckEstateWebRemoval = () => {
  return useMutation({
    mutationFn: (payload: CheckEstateWebRemovalPayload) =>
      checkEstateWebRemoval(payload),
    onError: (error: Error) => {
      toast({
        title: "Could not check EstateWeb removal sync",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useFixEstateWebRemoval = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: FixEstateWebRemovalPayload) =>
      fixEstateWebRemoval(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      toast({
        title: "EstateWeb removal fix started",
        description:
          result.skipped.length > 0
            ? `Enqueued ${result.enqueued}. ${result.skipped.length} skipped.`
            : `Unlinking ${result.enqueued} ${result.enqueued === 1 ? "property" : "properties"} from EstateWeb sites in the background. Track progress in Job queue.`,
        duration: 2500,
        variant: result.skipped.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not fix EstateWeb removal sync",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useRenormalizeUserProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RenormalizeUserPropertiesPayload) =>
      renormalizeUserProperties(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      toast({
        title: "Renormalization started",
        description:
          result.failed.length > 0
            ? `Enqueued ${result.enqueued}. ${result.failed.length} could not be enqueued.`
            : `Renormalizing ${result.enqueued} ${result.enqueued === 1 ? "property" : "properties"} in the background.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not start renormalization",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useGeocodeMissingCoordinates = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => geocodeMissingCoordinates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not start geocoding",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUserPropertiesMissingCoordinatesCount = (enabled: boolean) => {
  return useQuery({
    queryKey: ["userProperties", "missing-coordinates-count"],
    queryFn: () => getUserPropertiesMissingCoordinatesCount(),
    enabled,
  });
};

export const useResolveEstateWebLocations = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => resolveEstateWebLocations(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not start EstateWeb location resolution",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateUserPropertyStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateUserPropertyStatusPayload) =>
      updateUserPropertyStatus(payload),
    onSuccess: (result: UpdateUserPropertyStatusResult) => {
      void queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({
        title: "Status updated",
        description: `Updated ${result.updated} ${
          result.updated === 1 ? "property" : "properties"
        }.`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update status",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useBulkDeleteUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BulkDeleteIntegrationImagesPayload) =>
      bulkDeleteUserPropertyIntegrationImages(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      toast({
        title: "CMS image delete started",
        description:
          result.failed.length > 0
            ? `Enqueued ${result.enqueued}. ${result.failed.length} could not be enqueued.`
            : `Deleting CMS images for ${result.enqueued} ${result.enqueued === 1 ? "property" : "properties"} in the background. Track progress in Job queue.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete CMS images",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useBulkMigrateUserPropertyIntegrationImages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BulkMigrateIntegrationImagesPayload) =>
      bulkMigrateUserPropertyIntegrationImages(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });

      toast({
        title: "CMS image migrate started",
        description:
          result.failed.length > 0
            ? `Enqueued ${result.enqueued}. ${result.failed.length} could not be enqueued.`
            : `Migrating CMS images for ${result.enqueued} ${result.enqueued === 1 ? "property" : "properties"} in the background. Track progress in Job queue.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not migrate CMS images",
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



export const useAgencyWatermarkSettings = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ["adminUserProperties", "agencyWatermarkSettings"],
    queryFn: () => getAgencyWatermarkSettings(),
    enabled: options?.enabled ?? true,
  });
};





export const usePreviewCrmImageSync = () => {
  return useMutation({
    mutationFn: (payload: CrmImageSyncPayload) => previewCrmImageSync(payload),
    onError: (error: Error) => {
      toast({
        title: "Could not preview the CRM image sync",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useRunCrmImageSync = () => {
  return useMutation({
    mutationFn: (payload: CrmImageSyncPayload) => runCrmImageSync(payload),
    onError: (error: Error) => {
      toast({
        title: "Could not start the CRM image sync",
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
        description: `Updated ${result.updated} of ${result.total} ${result.total === 1 ? "property" : "properties"}.${
          result.queued
            ? " Pushing to EstateWeb in the background."
            : ""
        }`,
        duration: 3000,
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
