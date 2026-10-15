import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  acknowledgeDelistedAlerts,
  createPropertyClient,
  deletePropertyClient,
  getDelistedAlerts,
  getKnownClients,
  getPropertyClients,
  updatePropertyClient,
} from "../services/property-clients.services";
import type { PropertyClientPayload } from "../interfaces/property-clients.interfaces";

const KEY = "propertyClients";

export const usePropertyClients = (userPropertyId: string | undefined) =>
  useQuery({
    queryKey: [KEY, "list", userPropertyId],
    queryFn: () => getPropertyClients(userPropertyId as string),
    enabled: !!userPropertyId,
  });

export const useKnownClients = (enabled: boolean) =>
  useQuery({
    queryKey: [KEY, "known"],
    queryFn: getKnownClients,
    enabled,
  });

export const useDelistedAlerts = (includeAcknowledged = false) =>
  useQuery({
    queryKey: [KEY, "delisted-alerts", includeAcknowledged],
    queryFn: () => getDelistedAlerts(includeAcknowledged),
    staleTime: 60_000,
  });

const useInvalidate = () => {
  const queryClient = useQueryClient();
  // The properties list shows a "Shown to N" badge derived from these rows, so refresh it too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [KEY] }),
      queryClient.invalidateQueries({ queryKey: ["userProperties"] }),
    ]);
};

export const useCreatePropertyClient = (userPropertyId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: PropertyClientPayload) =>
      createPropertyClient(userPropertyId, payload),
    onSuccess: () => {
      invalidate();
      toast({ title: "Client added", duration: 2000, variant: "success" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not add client",
        description: error.message,
        variant: "error",
      }),
  });
};

export const useUpdatePropertyClient = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<PropertyClientPayload>;
    }) => updatePropertyClient(id, payload),
    onSuccess: () => {
      invalidate();
      toast({ title: "Client updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not update client",
        description: error.message,
        variant: "error",
      }),
  });
};

export const useDeletePropertyClient = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deletePropertyClient(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Client removed", duration: 2000, variant: "success" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not remove client",
        description: error.message,
        variant: "error",
      }),
  });
};

export const useAcknowledgeDelistedAlerts = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (userPropertyIds: string[]) =>
      acknowledgeDelistedAlerts(userPropertyIds),
    onSuccess: () => {
      invalidate();
    },
    onError: (error: Error) =>
      toast({
        title: "Could not dismiss alert",
        description: error.message,
        variant: "error",
      }),
  });
};
