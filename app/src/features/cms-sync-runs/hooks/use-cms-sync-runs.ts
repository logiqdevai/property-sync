import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  cancelUserCmsSyncRuns,
  deleteAdminCmsSyncRun,
  deleteAdminCmsSyncRuns,
  getAdminCmsSyncRun,
  getAdminCmsSyncRunIntegrations,
  getAdminCmsSyncRuns,
  getUserCmsSyncRun,
  getUserCmsSyncRuns,
  resumeUserCmsSyncRuns,
  retryAdminCmsSyncRun,
  rerunAdminCmsSyncRun,
} from "../services/cms-sync-runs.services";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncRunBulkActionPayload,
  CmsSyncRunListQuery,
  DeleteCmsSyncRunsPayload,
} from "../interfaces/cms-sync-runs.interfaces";
import { CmsSyncStatuses } from "../interfaces/cms-sync-runs.interfaces";

export const useUserCmsSyncRuns = (query: CmsSyncRunListQuery) => {
  return useQuery({
    queryKey: ["cmsSyncRuns", "userList", query],
    queryFn: () => getUserCmsSyncRuns(query),
  });
};

export const useUserCmsSyncRun = (id: string) => {
  return useQuery({
    queryKey: ["cmsSyncRuns", "userDetail", id],
    queryFn: () => getUserCmsSyncRun(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === CmsSyncStatuses.PENDING || status === CmsSyncStatuses.RETRYING
        ? 2000
        : false;
    },
  });
};

export const useCancelUserCmsSyncRuns = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CmsSyncRunBulkActionPayload) => cancelUserCmsSyncRuns(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });
      toast({
        title: "Sync runs cancelled",
        description:
          result.failed.length > 0
            ? `Cancelled ${result.cancelled.length}. ${result.failed.length} could not be cancelled.`
            : `${result.cancelled.length} ${result.cancelled.length === 1 ? "run" : "runs"} cancelled.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not cancel sync runs",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useResumeUserCmsSyncRuns = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CmsSyncRunBulkActionPayload) => resumeUserCmsSyncRuns(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });
      toast({
        title: "Sync runs resumed",
        description:
          result.failed.length > 0
            ? `Resumed ${result.resumed.length}. ${result.failed.length} could not be resumed.`
            : `${result.resumed.length} ${result.resumed.length === 1 ? "run" : "runs"} queued to resume.`,
        duration: 2500,
        variant: result.failed.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not resume sync runs",
        description: error.message,
        variant: "error",
      });
    },
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

export const useRerunAdminCmsSyncRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rerunAdminCmsSyncRun(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns", "adminDetail", id] });
      toast({ title: "Sync run rerun queued", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not rerun sync run",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteAdminCmsSyncRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAdminCmsSyncRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });
      toast({ title: "Sync run deleted", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete sync run",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteAdminCmsSyncRuns = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteCmsSyncRunsPayload) => deleteAdminCmsSyncRuns(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cmsSyncRuns"] });
      toast({
        title: "Sync runs deleted",
        description: `${data.deleted} ${data.deleted === 1 ? "run" : "runs"} removed`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete sync runs",
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
