export const NotificationTypes = {
  BROKEN_SCRAPER: "BROKEN_SCRAPER",
  CMS_SYNC_FAILURE: "CMS_SYNC_FAILURE",
  CMS_SYNC_SUCCESS: "CMS_SYNC_SUCCESS",
  PROPERTY_REMOVAL_SPIKE: "PROPERTY_REMOVAL_SPIKE",
  LARGE_CRAWL_FAILURE: "LARGE_CRAWL_FAILURE",
  QUEUE_FAILURE: "QUEUE_FAILURE",
  WEBSITE_UNAVAILABLE: "WEBSITE_UNAVAILABLE",
  ESTATEWEB_NETWORK_ERROR: "ESTATEWEB_NETWORK_ERROR",
  ESTATEWEB_REQUEST_TIMEOUT: "ESTATEWEB_REQUEST_TIMEOUT",
  ESTATEWEB_UNAUTHORIZED: "ESTATEWEB_UNAUTHORIZED",
  ESTATEWEB_SESSION_EXPIRED: "ESTATEWEB_SESSION_EXPIRED",
  ESTATEWEB_API_ERROR: "ESTATEWEB_API_ERROR",
  ESTATEWEB_NOT_FOUND: "ESTATEWEB_NOT_FOUND",
  ESTATEWEB_RATE_LIMITED: "ESTATEWEB_RATE_LIMITED",
  ESTATEWEB_INVALID_RESPONSE: "ESTATEWEB_INVALID_RESPONSE",
  ESTATEWEB_MISSING_PROPERTY_ID: "ESTATEWEB_MISSING_PROPERTY_ID",
  ESTATEWEB_VALIDATION_FAILED: "ESTATEWEB_VALIDATION_FAILED",
  ESTATEWEB_LOGIN_FAILED: "ESTATEWEB_LOGIN_FAILED",
  ESTATEWEB_MISSING_CSRF: "ESTATEWEB_MISSING_CSRF",
  ESTATEWEB_MISSING_SESSION_COOKIE: "ESTATEWEB_MISSING_SESSION_COOKIE",
  ESTATEWEB_LOGIN_REDIRECT_FAILED: "ESTATEWEB_LOGIN_REDIRECT_FAILED",
  ESTATEWEB_MISSING_CREDENTIALS: "ESTATEWEB_MISSING_CREDENTIALS",
  ESTATEWEB_INTEGRATION_INACTIVE: "ESTATEWEB_INTEGRATION_INACTIVE",
  ESTATEWEB_INTEGRATION_NOT_FOUND: "ESTATEWEB_INTEGRATION_NOT_FOUND",
  ESTATEWEB_MISSING_TOKEN: "ESTATEWEB_MISSING_TOKEN",
  ESTATEWEB_INVALID_JSON: "ESTATEWEB_INVALID_JSON",
  ESTATEWEB_SERVER_ERROR: "ESTATEWEB_SERVER_ERROR",
  ESTATEWEB_EMPTY_IMAGE: "ESTATEWEB_EMPTY_IMAGE",
  ESTATEWEB_INVALID_PROPERTY_ID: "ESTATEWEB_INVALID_PROPERTY_ID",
  ESTATEWEB_LINK_NOT_FOUND: "ESTATEWEB_LINK_NOT_FOUND",
  ESTATEWEB_SESSION_PERSIST_FAILED: "ESTATEWEB_SESSION_PERSIST_FAILED",
  AI_NORMALIZATION_FAILURE: "AI_NORMALIZATION_FAILURE",
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
  date_from?: string;
  date_to?: string;
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

export interface DeleteNotificationsPayload {
  ids: string[];
}

export interface DeleteNotificationsResponse {
  deleted: number;
}

export interface SendTelegramTestPayload {
  message: string;
}

export interface SendTelegramTestResponse {
  sent: true;
}
