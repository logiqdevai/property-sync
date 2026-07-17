import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../services/health.services";

export const useHealth = () => {
  return useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });
};
