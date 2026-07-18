import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  cancelCrawlRun,
  deleteCrawlRun,
  deleteCrawlRuns,
  getCrawlRun,
  getCrawlRuns,
  rerunCrawlRun,
} from "../services/crawl-runs.services";
import type {
  CrawlRunListQuery,
  CrawlRunStatus,
  DeleteCrawlRunsPayload,
} from "../interfaces/crawl-runs.interfaces";

const ACTIVE_STATUSES: CrawlRunStatus[] = ["QUEUED", "RUNNING"];

export const useCrawlRuns = (query: CrawlRunListQuery) => {
  return useQuery({
    queryKey: ["crawlRuns", "list", query],
    queryFn: () => getCrawlRuns(query),
  });
};

export const useCrawlRun = (id: string) => {
  return useQuery({
    queryKey: ["crawlRuns", "detail", id],
    queryFn: () => getCrawlRun(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ACTIVE_STATUSES.includes(status) ? 2000 : false;
    },
  });
};

export const useRerunCrawlRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rerunCrawlRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crawlRuns"] });
      toast({ title: "Crawl run triggered", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not rerun crawl",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useCancelCrawlRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelCrawlRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crawlRuns"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Crawl run stopped", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not stop crawl",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteCrawlRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCrawlRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crawlRuns"] });
      toast({ title: "Crawl run deleted", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not delete crawl run",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteCrawlRuns = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteCrawlRunsPayload) => deleteCrawlRuns(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crawlRuns"] });
      toast({ title: "Crawl runs deleted", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not delete crawl runs",
        description: error.message,
        variant: "error",
      });
    },
  });
};
