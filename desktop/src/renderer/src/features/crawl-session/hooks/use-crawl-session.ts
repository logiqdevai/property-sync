import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BlockStates, CrawlPhases, type CrawlState, type StartCrawlRequest } from "@shared/ipc";
import { toast } from "@/hooks/use-toast";
import { useCrawlSessionStore } from "@/stores/crawl-session";
import { CRAWLABLE_AGENCIES_KEY } from "@/features/desktop-crawl/hooks/use-desktop-crawl";
import {
  dismissCrawl,
  getCrawlCheckpoint,
  listCrawlCheckpoints,
  startCrawl,
  startCrawls,
  stopCrawl,
} from "../services/crawl-session.services";

export const CRAWL_CHECKPOINT_KEY = "crawl-checkpoint";
const CRAWL_CHECKPOINTS_KEY = "crawl-checkpoints";

/** Above this many crawls at once, the user is warned the computer may slow down. */
export const RECOMMENDED_PARALLEL_CRAWLS = 3;

const ACTIVE_PHASES: CrawlState["phase"][] = [
  CrawlPhases.QUEUED,
  CrawlPhases.PREPARING,
  CrawlPhases.LISTING,
  CrawlPhases.DETAILS,
  CrawlPhases.UPLOADING,
  CrawlPhases.SAVING,
];

export const isCrawlActive = (state: CrawlState | null | undefined): boolean =>
  !!state && ACTIVE_PHASES.includes(state.phase);

/** Every crawl of this session, by scraper id. */
export const useCrawlSessions = () => useCrawlSessionStore((s) => s.states);

/** One agency's crawl, or null when it hasn't been crawled in this session. */
export const useCrawlSession = (scraperId: string) =>
  useCrawlSessionStore((s) => s.states[scraperId] ?? null);

/** The crawls currently running, and how many of them wait for the user (robot check). */
export const useActiveCrawls = () => {
  const states = useCrawlSessions();
  return useMemo(() => {
    const active = Object.values(states).filter(isCrawlActive);
    return { active, needsUser: active.filter((s) => s.block === BlockStates.NEEDS_USER) };
  }, [states]);
};

export const useGetCrawlCheckpoint = (scraperId: string) => {
  return useQuery({
    queryKey: [CRAWL_CHECKPOINT_KEY, scraperId],
    queryFn: () => getCrawlCheckpoint(scraperId),
    enabled: !!scraperId,
  });
};

/**
 * Saved, unfinished crawls of all agencies (for the Continue buttons on the list). Re-read whenever
 * a crawl changes step, since stopping, failing or finishing is what writes or removes them.
 */
export const useGetCrawlCheckpoints = () => {
  const states = useCrawlSessions();
  const phases = Object.values(states)
    .map((s) => `${s.scraper_id}:${s.phase}`)
    .sort()
    .join(",");
  return useQuery({
    queryKey: [CRAWL_CHECKPOINT_KEY, CRAWL_CHECKPOINTS_KEY, phases],
    queryFn: () => listCrawlCheckpoints(),
  });
};

export const useStartCrawl = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: StartCrawlRequest) => startCrawl(request),
    onSuccess: (_data, request) => {
      queryClient.invalidateQueries({ queryKey: [CRAWL_CHECKPOINT_KEY] });
      toast({
        title: request.resume ? `${request.agency_name}: crawl continues` : `${request.agency_name}: crawl started`,
        description: "It runs in its own Chrome tab. Leave Chrome open until it finishes.",
        duration: 4000,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not start the crawl", description: error.message, variant: "error" });
    },
  });
};

/** Starts several agencies at once; each continues its saved crawl when there is one. */
export const useStartCrawls = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requests: StartCrawlRequest[]; concurrency: number }) =>
      startCrawls(input.requests, input.concurrency),
    onSuccess: (failures, { requests, concurrency }) => {
      queryClient.invalidateQueries({ queryKey: [CRAWL_CHECKPOINT_KEY] });
      const started = requests.length - failures.length;
      if (started > 0) {
        const queued = started > concurrency;
        toast({
          title: `${started} crawl${started === 1 ? "" : "s"} ${queued ? "queued" : "started"}`,
          description: queued
            ? `${concurrency} run at a time; the next one starts by itself when one finishes. Leave Chrome open.`
            : "Each runs in its own Chrome tab. Leave Chrome open until they finish.",
          duration: 4000,
          variant: "success",
        });
      }
      if (failures.length > 0) {
        toast({
          title: `${failures.length} could not start`,
          description: failures.map((f) => `${f.agency_name}: ${f.reason}`).join(" · "),
          variant: "warning",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Could not start the crawls", description: error.message, variant: "error" });
    },
  });
};

export const useStopCrawl = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scraperId: string) => stopCrawl(scraperId),
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
    mutationFn: (scraperId: string) => dismissCrawl(scraperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRAWLABLE_AGENCIES_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRAWL_CHECKPOINT_KEY] });
    },
    onError: (error: Error) => {
      toast({ title: "Something went wrong", description: error.message, variant: "error" });
    },
  });
};
