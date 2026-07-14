import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  getUserProperties,
  getUserProperty,
  resyncUserProperty,
  updateUserProperty,
} from "../services/user-properties.services";
import type {
  UpdateUserPropertyPayload,
  UserPropertyListQuery,
} from "../interfaces/user-properties.interfaces";

export const useUserProperties = (query: UserPropertyListQuery) => {
  return useQuery({
    queryKey: ["userProperties", "list", query],
    queryFn: () => getUserProperties(query),
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

export const useResyncUserProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resyncUserProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProperties"] });
      toast({ title: "Property resynced from source", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not resync property",
        description: error.message,
        variant: "error",
      });
    },
  });
};
