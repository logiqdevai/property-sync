import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  getAdminCmsSyncRun,
  getAdminCmsSyncRunIntegrations,
  getAdminCmsSyncRuns,
  getUserCmsSyncRuns,
  retryAdminCmsSyncRun,
} from "../services/cms-sync-runs.services";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncRunListQuery,
} from "../interfaces/cms-sync-runs.interfaces";
import { CmsSyncStatuses } from "../interfaces/cms-sync-runs.interfaces";

export const useUserCmsSyncRuns = (query: CmsSyncRunListQuery) => {
  return useQuery({
    queryKey: ["cmsSyncRuns", "userList", query],
    queryFn: () => getUserCmsSyncRuns(query),
  });
};

export const useAdminCmsSyncRuns = (query: AdminCmsSyncRunListQuery) => {
  return useQuery({
    queryKey: ["cmsSyncRuns", "adminList", query],
    queryFn: () => getAdminCmsSyncRuns(query),
  });
};

export const useAdminCmsSyncRun = (id: string) => {
  return useQuery({
    queryKey: ["cmsSyncRuns", "adminDetail", id],
    queryFn: () => getAdminCmsSyncRun(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === CmsSyncStatuses.PENDING || status === CmsSyncStatuses.RETRYING
        ? 2000
        : false;
    },
  });
};

export const useRetryAdminCmsSyncRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => retryAdminCmsSyncRun(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns", "adminDetail", id] });
      toast({ title: "Sync run retry triggered", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not retry sync run",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useAdminCmsSyncRunIntegrations = (userId?: string) => {
  return useQuery({
    queryKey: ["cmsSyncRuns", "adminIntegrations", userId ?? "all"],
    queryFn: () =>
      getAdminCmsSyncRunIntegrations(userId ? { user_id: userId } : undefined),
  });
};
