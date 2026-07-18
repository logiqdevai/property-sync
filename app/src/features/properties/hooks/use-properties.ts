import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  deleteProperties,
  deleteProperty,
  getProperties,
  getPropertiesCount,
  getProperty,
  mergeProperties,
  splitProperty,
} from "../services/properties.services";
import type {
  DeletePropertiesPayload,
  MergePropertiesPayload,
  PropertyCountQuery,
  PropertyListQuery,
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
