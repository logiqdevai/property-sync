import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CrawlPhases, type CrawlState, type StartCrawlRequest } from "@shared/ipc";
import { toast } from "@/hooks/use-toast";
import { useCrawlSessionStore } from "@/stores/crawl-session";
import { CRAWLABLE_AGENCIES_KEY } from "@/features/desktop-crawl/hooks/use-desktop-crawl";
import {
  dismissCrawl,
  getCrawlCheckpoint,
  startCrawl,
  stopCrawl,
} from "../services/crawl-session.services";

export const CRAWL_CHECKPOINT_KEY = "crawl-checkpoint";

const ACTIVE_PHASES: CrawlState["phase"][] = [
  CrawlPhases.PREPARING,
  CrawlPhases.LISTING,
  CrawlPhases.DETAILS,
  CrawlPhases.UPLOADING,
  CrawlPhases.SAVING,
];

export const isCrawlActive = (state: CrawlState) => ACTIVE_PHASES.includes(state.phase);

/** The live crawl state, pushed from the main process. */
export const useCrawlSession = () => useCrawlSessionStore((s) => s.state);

export const useGetCrawlCheckpoint = (scraperId: string) => {
  return useQuery({
    queryKey: [CRAWL_CHECKPOINT_KEY, scraperId],
    queryFn: () => getCrawlCheckpoint(scraperId),
    enabled: !!scraperId,
  });
};

export const useStartCrawl = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: StartCrawlRequest) => startCrawl(request),
    onSuccess: (_data, request) => {
      queryClient.invalidateQueries({ queryKey: [CRAWL_CHECKPOINT_KEY] });
      toast({
        title: request.resume ? "Crawl continues" : "Crawl started",
        description: "A Chrome window opens. Leave it open until the crawl finishes.",
        duration: 4000,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not start the crawl", description: error.message, variant: "error" });
    },
  });
};

export const useStopCrawl = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stopCrawl(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRAWL_CHECKPOINT_KEY] });
      toast({ title: "Stopping", description: "What was read so far is saved.", duration: 3000 });
    },
    onError: (error: Error) => {
      toast({ title: "Could not stop the crawl", description: error.message, variant: "error" });
    },
  });
};

export const useDismissCrawl = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dismissCrawl(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRAWLABLE_AGENCIES_KEY] });
    },
    onError: (error: Error) => {
      toast({ title: "Something went wrong", description: error.message, variant: "error" });
    },
  });
};
