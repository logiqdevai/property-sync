import { useQuery } from "@tanstack/react-query";
import {
  getAdminCmsSyncRunIntegrations,
  getAdminCmsSyncRuns,
  getUserCmsSyncRuns,
} from "../services/cms-sync-runs.services";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncRunListQuery,
} from "../interfaces/cms-sync-runs.interfaces";

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

export const useAdminCmsSyncRunIntegrations = (userId?: string) => {
  return useQuery({
    queryKey: ["cmsSyncRuns", "adminIntegrations", userId ?? "all"],
    queryFn: () =>
      getAdminCmsSyncRunIntegrations(userId ? { user_id: userId } : undefined),
  });
};
