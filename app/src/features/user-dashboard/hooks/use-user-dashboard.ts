import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ActivityPeriod } from "../interfaces/user-dashboard.interfaces";
import { getUserDashboard } from "../services/user-dashboard.services";

export const useUserDashboard = (period: ActivityPeriod = "week", windows?: number) => {
  return useQuery({
    queryKey: ["userDashboard", period, windows],
    queryFn: () => getUserDashboard(period, windows),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
};
