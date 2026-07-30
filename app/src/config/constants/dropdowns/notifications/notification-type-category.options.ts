import {
  NotificationTypes,
  type NotificationType,
} from "@/features/notifications/interfaces/notifications.interfaces";

export const NotificationCategories = {
  CRAWLER: "CRAWLER",
  CMS_SYNC: "CMS_SYNC",
  ESTATEWEB: "ESTATEWEB",
} as const;

export type NotificationCategory = (typeof NotificationCategories)[keyof typeof NotificationCategories];

export const NotificationCategoryLabels: Record<NotificationCategory, string> = {
  [NotificationCategories.CRAWLER]: "Crawler & Scraper",
  [NotificationCategories.CMS_SYNC]: "CMS Sync",
  [NotificationCategories.ESTATEWEB]: "EstateWeb Integration",
};

export const NotificationCategoryOrder: NotificationCategory[] = [
  NotificationCategories.CRAWLER,
  NotificationCategories.CMS_SYNC,
  NotificationCategories.ESTATEWEB,
];

export const NotificationTypeCategory: Record<NotificationType, NotificationCategory> = {
  [NotificationTypes.BROKEN_SCRAPER]: NotificationCategories.CRAWLER,
  [NotificationTypes.PROPERTY_REMOVAL_SPIKE]: NotificationCategories.CRAWLER,
  [NotificationTypes.LARGE_CRAWL_FAILURE]: NotificationCategories.CRAWLER,
  [NotificationTypes.QUEUE_FAILURE]: NotificationCategories.CRAWLER,
  [NotificationTypes.WEBSITE_UNAVAILABLE]: NotificationCategories.CRAWLER,
  [NotificationTypes.AI_NORMALIZATION_FAILURE]: NotificationCategories.CRAWLER,
  [NotificationTypes.CMS_SYNC_FAILURE]: NotificationCategories.CMS_SYNC,
  [NotificationTypes.CMS_SYNC_SUCCESS]: NotificationCategories.CMS_SYNC,
  [NotificationTypes.ESTATEWEB_NETWORK_ERROR]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_REQUEST_TIMEOUT]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_UNAUTHORIZED]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_SESSION_EXPIRED]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_API_ERROR]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_NOT_FOUND]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_RATE_LIMITED]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_INVALID_RESPONSE]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_MISSING_PROPERTY_ID]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_VALIDATION_FAILED]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_LOGIN_FAILED]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_MISSING_CSRF]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_MISSING_SESSION_COOKIE]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_LOGIN_REDIRECT_FAILED]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_MISSING_CREDENTIALS]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_INTEGRATION_INACTIVE]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_INTEGRATION_NOT_FOUND]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_MISSING_TOKEN]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_INVALID_JSON]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_SERVER_ERROR]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_EMPTY_IMAGE]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_INVALID_PROPERTY_ID]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_LINK_NOT_FOUND]: NotificationCategories.ESTATEWEB,
  [NotificationTypes.ESTATEWEB_SESSION_PERSIST_FAILED]: NotificationCategories.ESTATEWEB,
};
