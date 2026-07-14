import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getJob, getJobs, retryJob } from "../services/jobs.services";
import type { JobLogListQuery } from "../interfaces/jobs.interfaces";

export const useJobs = (query: JobLogListQuery) => {
  return useQuery({
    queryKey: ["jobs", "list", query],
    queryFn: () => getJobs(query),
  });
};

export const useJob = (id: string) => {
  return useQuery({
    queryKey: ["jobs", "detail", id],
    queryFn: () => getJob(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "WAITING" || status === "ACTIVE" ? 2000 : false;
    },
  });
};

export const useRetryJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => retryJob(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "detail", id] });
      toast({ title: "Job retry triggered", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not retry job",
        description: error.message,
        variant: "error",
      });
    },
  });
};
