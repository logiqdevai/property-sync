import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  deleteJob,
  deleteJobs,
  getJob,
  getJobs,
  retryJob,
  stopJob,
} from "../services/jobs.services";
import type { DeleteJobsPayload, JobLogListQuery } from "../interfaces/jobs.interfaces";

export const useJobs = (query: JobLogListQuery) => {
  return useQuery({
    queryKey: ["jobs", "list", query],
    queryFn: () => getJobs(query),
    refetchInterval: (queryResult) => {
      const rows = queryResult.state.data?.data ?? [];
      const hasActive = rows.some(
        (row) =>
          row.status === "WAITING" ||
          row.status === "ACTIVE" ||
          row.status === "DELAYED" ||
          row.status === "PAUSED",
      );
      return hasActive ? 2000 : false;
    },
  });
};

export const useJob = (id: string) => {
  return useQuery({
    queryKey: ["jobs", "detail", id],
    queryFn: () => getJob(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "WAITING" ||
        status === "ACTIVE" ||
        status === "DELAYED" ||
        status === "PAUSED"
        ? 2000
        : false;
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

export const useStopJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => stopJob(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "detail", id] });
      toast({ title: "Job stopped", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not stop job",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Job deleted", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not delete job",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteJobs = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteJobsPayload) => deleteJobs(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Jobs deleted", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not delete jobs",
        description: error.message,
        variant: "error",
      });
    },
  });
};
