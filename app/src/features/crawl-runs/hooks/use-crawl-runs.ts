import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  getCrawlRun,
  getCrawlRuns,
  getUserCrawlRuns,
  rerunCrawlRun,
} from "../services/crawl-runs.services";
import type {
  CrawlRunListQuery,
  CrawlRunStatus,
  UserCrawlRunListQuery,
} from "../interfaces/crawl-runs.interfaces";

const ACTIVE_STATUSES: CrawlRunStatus[] = ["QUEUED", "RUNNING"];

export const useCrawlRuns = (query: CrawlRunListQuery) => {
  return useQuery({
    queryKey: ["crawlRuns", "list", query],
    queryFn: () => getCrawlRuns(query),
  });
};

export const useUserCrawlRuns = (query: UserCrawlRunListQuery) => {
  return useQuery({
    queryKey: ["crawlRuns", "userList", query],
    queryFn: () => getUserCrawlRuns(query),
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
