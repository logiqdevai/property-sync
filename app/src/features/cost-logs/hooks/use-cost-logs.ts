import { useQuery } from "@tanstack/react-query";
import { getCostLogs } from "../services/cost-logs.services";
import type { CostLogListQuery } from "../interfaces/cost-logs.interfaces";

export const useCostLogs = (query: CostLogListQuery) => {
  return useQuery({
    queryKey: ["costLogs", "list", query],
    queryFn: () => getCostLogs(query),
  });
};
