import { useQuery } from "@tanstack/react-query";
import { getEstateWebLocationCatalog } from "../services/estateweb.services";

export const useEstateWebLocationCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "locations"],
    queryFn: getEstateWebLocationCatalog,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
};
