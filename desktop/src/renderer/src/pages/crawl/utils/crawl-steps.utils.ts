import { CrawlPhases, type CrawlPhase, type CrawlState } from "@shared/ipc";
import type { Step, StepStatus } from "@/components/ui/step-list";

const ORDER: CrawlPhase[] = [
  CrawlPhases.PREPARING,
  CrawlPhases.LISTING,
  CrawlPhases.DETAILS,
  CrawlPhases.UPLOADING,
  CrawlPhases.SAVING,
];

/** Which step the crawl stopped or failed in, from what it had already done. */
function reachedPhase(state: CrawlState): CrawlPhase {
  if (ORDER.includes(state.phase)) return state.phase;
  if (state.phase === CrawlPhases.DONE) return CrawlPhases.DONE;
  if (state.result) return CrawlPhases.SAVING;
  if (state.details_done > 0) return CrawlPhases.DETAILS;
  if (state.listings_found > 0) return CrawlPhases.LISTING;
  return CrawlPhases.PREPARING;
}

export function buildCrawlSteps(state: CrawlState): Step[] {
  const reached = reachedPhase(state);
  const reachedIndex = reached === CrawlPhases.DONE ? ORDER.length : ORDER.indexOf(reached);
  const failed = state.phase === CrawlPhases.FAILED || state.phase === CrawlPhases.STOPPED;

  const status = (phase: CrawlPhase): StepStatus => {
    const index = ORDER.indexOf(phase);
    if (index < reachedIndex) return "done";
    if (index > reachedIndex) return "pending";
    return failed ? "failed" : "active";
  };

  return [
    {
      key: CrawlPhases.PREPARING,
      title: "Open the agency's website",
      description: "Chrome opens in its own window.",
      status: status(CrawlPhases.PREPARING),
    },
    {
      key: CrawlPhases.LISTING,
      title: "Find all listings",
      description: `${state.listings_found} listings on ${state.listing_pages} pages`,
      status: status(CrawlPhases.LISTING),
    },
    {
      key: CrawlPhases.DETAILS,
      title: "Read each listing",
      description: `${state.details_done} of ${state.details_total}`,
      status: status(CrawlPhases.DETAILS),
    },
    {
      key: CrawlPhases.UPLOADING,
      title: "Send to Property Sync",
      status: status(CrawlPhases.UPLOADING),
    },
    {
      key: CrawlPhases.SAVING,
      title: "Prepare the listings for review",
      description: "Property Sync is translating and sorting the listings. This can take a few minutes.",
      status: status(CrawlPhases.SAVING),
    },
  ];
}

export const canStopCrawl = (phase: CrawlPhase) =>
  phase === CrawlPhases.QUEUED || phase === CrawlPhases.PREPARING || phase === CrawlPhases.LISTING || phase === CrawlPhases.DETAILS;
