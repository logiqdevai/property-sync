import { useQuery } from "@tanstack/react-query";
import { getDiagnosticsPackage, getDiagnosticsPackages } from "../services/diagnostics.services";
import type { DiagnosticsListQuery } from "../interfaces/diagnostics.interfaces";

export const useDiagnosticsPackages = (query: DiagnosticsListQuery) => {
  return useQuery({
    queryKey: ["diagnostics", "list", query],
    queryFn: () => getDiagnosticsPackages(query),
  });
};

export const useDiagnosticsPackage = (id: string) => {
  return useQuery({
    queryKey: ["diagnostics", "detail", id],
    queryFn: () => getDiagnosticsPackage(id),
    enabled: !!id,
  });
};
