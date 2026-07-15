import { useQuery } from "@tanstack/react-query";
import { getUserDashboard } from "../services/user-dashboard.services";

export const useUserDashboard = () => {
  return useQuery({
    queryKey: ["userDashboard"],
    queryFn: getUserDashboard,
    refetchInterval: 60_000,
  });
};
