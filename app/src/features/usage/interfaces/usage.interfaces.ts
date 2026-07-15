import type {
  CrawlRun,
  CrawlRunListQuery,
  PaginationMeta,
} from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";

export interface UsageCrawlRun extends CrawlRun {
  user_tracked_agency?: {
    user: { email: string };
  } | null;
}

export interface UsageQuery extends CrawlRunListQuery {
  user_id?: string;
}

export interface UsageResponse {
  data: UsageCrawlRun[];
  pagination: PaginationMeta;
  total_cost: string | null;
}
