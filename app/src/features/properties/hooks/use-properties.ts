import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  deleteProperties,
  deleteProperty,
  dedupePropertyGroups,
  getProperties,
  getPropertiesCount,
  getProperty,
  mergeProperties,
  splitProperties,
  splitProperty,
  truncatePropertyDescriptions,
} from "../services/properties.services";
import type {
  DeletePropertiesPayload,
  DedupePropertiesPayload,
  MergePropertiesPayload,
  PropertyCountQuery,
  PropertyListQuery,
  SplitPropertiesPayload,
  TruncatePropertyDescriptionsPayload,
} from "../interfaces/properties.interfaces";

export const useProperties = (query: PropertyListQuery) => {
  return useQuery({
    queryKey: ["properties", "list", query],
    queryFn: () => getProperties(query),
  });
};

export const usePropertiesCount = (query: PropertyCountQuery) => {
  return useQuery({
    queryKey: ["properties", "count", query],
    queryFn: () => getPropertiesCount(query),
  });
};

export const useProperty = (id: string) => {
  return useQuery({
    queryKey: ["properties", "detail", id],
    queryFn: () => getProperty(id),
    enabled: !!id,
  });
};

export const useMergeProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MergePropertiesPayload) => mergeProperties(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast({ title: "Properties merged", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not merge properties",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useSplitProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => splitProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast({ title: "Property split from group", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not split property",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useSplitProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SplitPropertiesPayload) => splitProperties(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
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

export const useDeleteProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
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

export const useDeleteProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeletePropertiesPayload) => deleteProperties(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
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

export const useDedupePropertyGroups = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DedupePropertiesPayload) => dedupePropertyGroups(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
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

export const useTruncatePropertyDescriptions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TruncatePropertyDescriptionsPayload) =>
      truncatePropertyDescriptions(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
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
