import { CrawlPhases, type CrawlState } from "@shared/ipc";

/** One short line describing where a running crawl is. */
export function describeRunningCrawl(state: CrawlState): string {
  switch (state.phase) {
    case CrawlPhases.QUEUED:
      return "Waiting for its turn";
    case CrawlPhases.PREPARING:
      return "Opening the website";
    case CrawlPhases.LISTING:
      return `Finding listings · ${state.listings_found} found`;
    case CrawlPhases.DETAILS:
      return `Reading listings · ${state.details_done} of ${state.details_total}`;
    case CrawlPhases.UPLOADING:
      return "Sending to Property Sync";
    case CrawlPhases.SAVING:
      return "Preparing the listings for review";
    default:
      return "";
  }
}

/** 0-100 for the card's progress bar, or null when the step has no measurable progress. */
export function crawlPercent(state: CrawlState): number | null {
  if (state.phase !== CrawlPhases.DETAILS || state.details_total === 0) return null;
  return Math.round((state.details_done / state.details_total) * 100);
}
