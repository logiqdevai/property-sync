import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getPlatformConfig, updatePlatformConfig } from "../services/platform-config.services";
import type { UpdatePlatformConfigPayload } from "../interfaces/platform-config.interfaces";

export const usePlatformConfig = () => {
  return useQuery({
    queryKey: ["platformConfig"],
    queryFn: getPlatformConfig,
  });
};

export const useUpdatePlatformConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdatePlatformConfigPayload) => updatePlatformConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformConfig"] });
      toast({ title: "Platform config updated", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update platform config",
        description: error.message,
        variant: "error",
      });
    },
  });
};
