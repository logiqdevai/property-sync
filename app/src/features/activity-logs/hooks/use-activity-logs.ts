import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getActivityLog,
  getActivityLogFacets,
  getActivityLogs,
} from "../services/activity-logs.services";
import type { ActivityLogListQuery } from "../interfaces/activity-logs.interfaces";

export const useActivityLogs = (query: ActivityLogListQuery) => {
  return useQuery({
    queryKey: ["activity-logs", "list", query],
    queryFn: () => getActivityLogs(query),
    placeholderData: keepPreviousData,
  });
};

export const useActivityLog = (id: string | null) => {
  return useQuery({
    queryKey: ["activity-logs", "detail", id],
    queryFn: () => getActivityLog(id as string),
    enabled: !!id,
  });
};

export const useActivityLogFacets = () => {
  return useQuery({
    queryKey: ["activity-logs", "facets"],
    queryFn: getActivityLogFacets,
    staleTime: 60_000,
  });
};
