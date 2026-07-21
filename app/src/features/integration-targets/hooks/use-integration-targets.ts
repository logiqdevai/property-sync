import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  createIntegrationTarget,
  createIntegrationTargetAccount,
  deleteIntegrationTarget,
  getIntegrationTarget,
  getIntegrationTargets,
  getIntegrationTargetUserSettings,
  updateIntegrationTarget,
  updateIntegrationTargetAccount,
  updateIntegrationTargetUserSettings,
  updateIntegrationTargetVisibility,
} from "../services/integration-targets.services";
import type {
  CreateIntegrationTargetPayload,
  CreateUserIntegrationAccountPayload,
  IntegrationTargetListQuery,
  UpdateIntegrationTargetPayload,
  UpdateUserIntegrationAccountPayload,
  UpdateUserIntegrationSettingsPayload,
} from "../interfaces/integration-targets.interfaces";

export const useIntegrationTargets = (query: IntegrationTargetListQuery) => {
  return useQuery({
    queryKey: ["integrationTargets", "list", query],
    queryFn: () => getIntegrationTargets(query),
  });
};

export const useIntegrationTarget = (id: string) => {
  return useQuery({
    queryKey: ["integrationTargets", "detail", id],
    queryFn: () => getIntegrationTarget(id),
    enabled: !!id,
  });
};

export const useCreateIntegrationTarget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateIntegrationTargetPayload) => createIntegrationTarget(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationTargets"] });
      toast({ title: "Integration target created", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not create integration target",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateIntegrationTarget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateIntegrationTargetPayload }) =>
      updateIntegrationTarget(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationTargets"] });
      toast({ title: "Integration target updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update integration target",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateIntegrationTargetVisibility = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { is_visible: boolean; is_enabled?: boolean };
    }) => updateIntegrationTargetVisibility(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationTargets"] });
      toast({ title: "Visibility updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update visibility",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteIntegrationTarget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteIntegrationTarget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationTargets"] });
      toast({ title: "Integration target deleted", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete integration target",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useCreateIntegrationTargetAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      targetId,
      payload,
    }: {
      targetId: string;
      payload: CreateUserIntegrationAccountPayload;
    }) => createIntegrationTargetAccount(targetId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationTargets"] });
      toast({ title: "User connection created", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not create user connection",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useUpdateIntegrationTargetAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      targetId,
      userIntegrationId,
      payload,
    }: {
      targetId: string;
      userIntegrationId: string;
      payload: UpdateUserIntegrationAccountPayload;
    }) => updateIntegrationTargetAccount(targetId, userIntegrationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationTargets"] });
      toast({ title: "User connection updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update user connection",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useIntegrationTargetUserSettings = (
  targetId: string | undefined,
  userId: string | undefined,
) => {
  return useQuery({
    queryKey: ["integrationTargets", "userSettings", targetId, userId],
    queryFn: () => getIntegrationTargetUserSettings(targetId as string, userId as string),
    enabled: !!targetId && !!userId,
  });
};

export const useUpdateIntegrationTargetUserSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      targetId,
      userId,
      payload,
    }: {
      targetId: string;
      userId: string;
      payload: UpdateUserIntegrationSettingsPayload;
    }) => updateIntegrationTargetUserSettings(targetId, userId, payload),
    onSuccess: (_data, { targetId, userId }) => {
      queryClient.invalidateQueries({
        queryKey: ["integrationTargets", "userSettings", targetId, userId],
      });
      queryClient.invalidateQueries({ queryKey: ["integrationTargets"] });
      toast({ title: "User integration settings updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update user integration settings",
        description: error.message,
        variant: "error",
      });
    },
  });
};
