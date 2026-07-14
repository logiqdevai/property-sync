import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  getProperties,
  getProperty,
  mergeProperties,
  splitProperty,
} from "../services/properties.services";
import type { PropertyListQuery, MergePropertiesPayload } from "../interfaces/properties.interfaces";

export const useProperties = (query: PropertyListQuery) => {
  return useQuery({
    queryKey: ["properties", "list", query],
    queryFn: () => getProperties(query),
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
