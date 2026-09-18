import { CrawlRunStatuses } from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";
import {
  TodayCrawlStatuses,
  type TodayCrawlStatus,
} from "@/features/scrapers/interfaces/scrapers.interfaces";

export const TodayCrawlStatusFilterOptions: { id: TodayCrawlStatus | "all"; label: string }[] = [
  { id: "all", label: "Today's crawl: any" },
  { id: TodayCrawlStatuses.NOT_RUN, label: "Not run today" },
  { id: CrawlRunStatuses.QUEUED, label: "Queued" },
  { id: CrawlRunStatuses.RUNNING, label: "Running" },
  { id: CrawlRunStatuses.SUCCESS, label: "Success" },
  { id: CrawlRunStatuses.PARTIAL_SUCCESS, label: "Partial success" },
  { id: CrawlRunStatuses.FAILED, label: "Failed" },
  { id: CrawlRunStatuses.CANCELLED, label: "Cancelled" },
];
