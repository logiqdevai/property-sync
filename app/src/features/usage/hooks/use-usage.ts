import { useQuery } from "@tanstack/react-query";
import { getUsage } from "../services/usage.services";
import type { UsageQuery } from "../interfaces/usage.interfaces";

export const useUsage = (query: UsageQuery) => {
  return useQuery({
    queryKey: ["usage", "crawlRuns", query],
    queryFn: () => getUsage(query),
  });
};
