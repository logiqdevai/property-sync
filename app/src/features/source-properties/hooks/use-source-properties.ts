import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  deleteSourceProperties,
  deleteSourceProperty,
  getSourceProperties,
  getSourcePropertiesCount,
  getSourceProperty,
} from "../services/source-properties.services";
import type {
  DeleteSourcePropertiesPayload,
  SourcePropertyCountQuery,
  SourcePropertyListQuery,
} from "../interfaces/source-properties.interfaces";

export const useSourceProperties = (query: SourcePropertyListQuery) => {
  return useQuery({
    queryKey: ["source-properties", "list", query],
    queryFn: () => getSourceProperties(query),
  });
};

export const useSourcePropertiesCount = (query: SourcePropertyCountQuery) => {
  return useQuery({
    queryKey: ["source-properties", "count", query],
    queryFn: () => getSourcePropertiesCount(query),
  });
};

export const useSourceProperty = (id: string) => {
  return useQuery({
    queryKey: ["source-properties", "detail", id],
    queryFn: () => getSourceProperty(id),
    enabled: !!id,
  });
};

export const useDeleteSourceProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSourceProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source-properties"] });
      toast({
        title: "Source property deleted",
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete source property",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteSourceProperties = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteSourcePropertiesPayload) =>
      deleteSourceProperties(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["source-properties"] });
      toast({
        title: "Source properties deleted",
        description: `Deleted ${result.deleted} ${result.deleted === 1 ? "source property" : "source properties"}.`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete source properties",
        description: error.message,
        variant: "error",
      });
    },
  });
};
