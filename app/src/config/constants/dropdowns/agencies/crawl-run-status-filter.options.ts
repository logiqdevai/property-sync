import {
  CrawlRunStatuses,
  type CrawlRunStatus,
} from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";

export const CrawlRunStatusFilterOptions: { id: CrawlRunStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: CrawlRunStatuses.QUEUED, label: "Queued" },
  { id: CrawlRunStatuses.RUNNING, label: "Running" },
  { id: CrawlRunStatuses.SUCCESS, label: "Success" },
  { id: CrawlRunStatuses.PARTIAL_SUCCESS, label: "Partial success" },
  { id: CrawlRunStatuses.FAILED, label: "Failed" },
  { id: CrawlRunStatuses.CANCELLED, label: "Cancelled" },
];
