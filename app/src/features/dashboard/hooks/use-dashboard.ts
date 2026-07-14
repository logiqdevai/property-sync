import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "../services/dashboard.services";

export const useDashboard = () => {
  return useQuery({
    queryKey: ["adminDashboard"],
    queryFn: getDashboard,
    refetchInterval: 60_000,
  });
};
