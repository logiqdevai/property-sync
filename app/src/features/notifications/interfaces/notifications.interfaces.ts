export const NotificationTypes = {
  BROKEN_SCRAPER: "BROKEN_SCRAPER",
  CMS_SYNC_FAILURE: "CMS_SYNC_FAILURE",
  PROPERTY_REMOVAL_SPIKE: "PROPERTY_REMOVAL_SPIKE",
  LARGE_CRAWL_FAILURE: "LARGE_CRAWL_FAILURE",
  QUEUE_FAILURE: "QUEUE_FAILURE",
  WEBSITE_UNAVAILABLE: "WEBSITE_UNAVAILABLE",
} as const;

export type NotificationType = (typeof NotificationTypes)[keyof typeof NotificationTypes];

export const NotificationSeverities = {
  INFO: "INFO",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
} as const;

export type NotificationSeverity =
  (typeof NotificationSeverities)[keyof typeof NotificationSeverities];

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  source_agency_id: string | null;
  scraper_id: string | null;
  crawl_run_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  type?: NotificationType;
  severity?: NotificationSeverity;
  is_read?: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface MarkAllReadResponse {
  updated: number;
}
