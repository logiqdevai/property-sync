import { useQuery } from "@tanstack/react-query";
import { getCostLogs, getUserCostLogs } from "../services/cost-logs.services";
import type { CostLogListQuery } from "../interfaces/cost-logs.interfaces";

export const useCostLogs = (query: CostLogListQuery) => {
  return useQuery({
    queryKey: ["costLogs", "list", query],
    queryFn: () => getCostLogs(query),
  });
};

export const useUserCostLogs = (query: Omit<CostLogListQuery, "user_id">) => {
  return useQuery({
    queryKey: ["costLogs", "user-list", query],
    queryFn: () => getUserCostLogs(query),
  });
};
