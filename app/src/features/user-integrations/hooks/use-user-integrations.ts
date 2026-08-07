import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  createUserIntegrationConnection,
  deleteUserIntegrationConnection,
  getIntegrationTargetsForUser,
  getUserIntegrationConnections,
  getUserIntegrationSettings,
  revealUserIntegrationSecrets,
  updateUserIntegrationConnection,
  updateUserIntegrationConnectionDefault,
  updateUserIntegrationConnectionStatus,
  updateUserIntegrationSettings,
} from "../services/user-integrations.services";
import type {
  CreateConnectionPayload,
  UpdateConnectionPayload,
  UpdateSettingsPayload,
} from "../interfaces/user-integrations.interfaces";

export const useAvailableIntegrationTargets = () => {
  return useQuery({
    queryKey: ["userIntegrations", "targets"],
    queryFn: getIntegrationTargetsForUser,
  });
};

export const useUserIntegrationConnections = () => {
  return useQuery({
    queryKey: ["userIntegrationsConnections"],
    queryFn: getUserIntegrationConnections,
  });
};

export const useConnectIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateConnectionPayload) => createUserIntegrationConnection(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIntegrationsConnections"] });
      queryClient.invalidateQueries({ queryKey: ["userIntegrations"] });
      toast({ title: "Integration connected", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not connect integration",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateUserIntegrationConnection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateConnectionPayload }) =>
      updateUserIntegrationConnection(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIntegrationsConnections"] });
      toast({ title: "Integration updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update integration",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateUserIntegrationConnectionStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateUserIntegrationConnectionStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIntegrationsConnections"] });
      toast({ title: "Integration status updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update integration status",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateUserIntegrationConnectionDefault = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isDefault }: { id: string; isDefault: boolean }) =>
      updateUserIntegrationConnectionDefault(id, isDefault),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIntegrationsConnections"] });
      toast({ title: "Default integration updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update default integration",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUserIntegrationSettings = (targetId: string | undefined) => {
  return useQuery({
    queryKey: ["userIntegrationSettings", targetId],
    queryFn: () => getUserIntegrationSettings(targetId as string),
    enabled: !!targetId,
  });
};

export const useUpdateUserIntegrationSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetId, payload }: { targetId: string; payload: UpdateSettingsPayload }) =>
      updateUserIntegrationSettings(targetId, payload),
    onSuccess: (_data, { targetId }) => {
      queryClient.invalidateQueries({ queryKey: ["userIntegrationSettings", targetId] });
      queryClient.invalidateQueries({ queryKey: ["userIntegrationsConnections"] });
      toast({ title: "Integration settings updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update integration settings",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDisconnectIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteUserIntegrationConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIntegrationsConnections"] });
      queryClient.invalidateQueries({ queryKey: ["userIntegrations"] });
      toast({ title: "Integration disconnected", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not disconnect integration",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useRevealUserIntegrationSecrets = () => {
  return useMutation({
    mutationFn: (id: string) => revealUserIntegrationSecrets(id),
    onError: (error: Error) => {
      toast({
        title: "Could not reveal secrets",
        description: error.message,
        variant: "error",
      });
    },
  });
};
