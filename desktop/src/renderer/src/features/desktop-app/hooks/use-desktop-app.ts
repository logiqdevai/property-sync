import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { checkBrowser, getAppInfo, openExternal } from "../services/desktop-app.services";

export const useGetAppInfo = () => {
  return useQuery({
    queryKey: ["app-info"],
    queryFn: () => getAppInfo(),
    staleTime: Infinity,
  });
};

export const useGetBrowserCheck = () => {
  return useQuery({
    queryKey: ["browser-check"],
    queryFn: () => checkBrowser(),
    staleTime: 60_000,
  });
};

export const useOpenExternal = () => {
  return useMutation({
    mutationFn: (url: string) => openExternal(url),
    onSuccess: () => undefined,
    onError: (error: Error) => {
      toast({ title: "Could not open the page", description: error.message, variant: "error" });
    },
  });
};
