import { Chip } from "@heroui/react";
import { NotificationTypes, type NotificationType } from "../interfaces/notifications.interfaces";

const typeLabel: Record<NotificationType, string> = {
  [NotificationTypes.BROKEN_SCRAPER]: "Broken scraper",
  [NotificationTypes.CMS_SYNC_FAILURE]: "CMS sync failure",
  [NotificationTypes.PROPERTY_REMOVAL_SPIKE]: "Removal spike",
  [NotificationTypes.LARGE_CRAWL_FAILURE]: "Crawl failure",
  [NotificationTypes.QUEUE_FAILURE]: "Queue failure",
  [NotificationTypes.WEBSITE_UNAVAILABLE]: "Website unavailable",
  [NotificationTypes.ESTATEWEB_NETWORK_ERROR]: "network error",
  [NotificationTypes.ESTATEWEB_REQUEST_TIMEOUT]: "request timeout",
  [NotificationTypes.ESTATEWEB_UNAUTHORIZED]: "unauthorized",
  [NotificationTypes.ESTATEWEB_SESSION_EXPIRED]: "session expired",
  [NotificationTypes.ESTATEWEB_API_ERROR]: "api error",
  [NotificationTypes.ESTATEWEB_NOT_FOUND]: "not found",
  [NotificationTypes.ESTATEWEB_RATE_LIMITED]: "rate limited",
  [NotificationTypes.ESTATEWEB_INVALID_RESPONSE]: "invalid response",
  [NotificationTypes.ESTATEWEB_MISSING_PROPERTY_ID]: "missing property id",
  [NotificationTypes.ESTATEWEB_VALIDATION_FAILED]: "validation failed",
  [NotificationTypes.ESTATEWEB_LOGIN_FAILED]: "login failed",
  [NotificationTypes.ESTATEWEB_MISSING_CSRF]: "missing csrf",
  [NotificationTypes.ESTATEWEB_MISSING_SESSION_COOKIE]: "missing session cookie",
  [NotificationTypes.ESTATEWEB_LOGIN_REDIRECT_FAILED]: "login redirect failed",
  [NotificationTypes.ESTATEWEB_MISSING_CREDENTIALS]: "missing credentials",
  [NotificationTypes.ESTATEWEB_INTEGRATION_INACTIVE]: "integration inactive",
  [NotificationTypes.ESTATEWEB_INTEGRATION_NOT_FOUND]: "integration not found",
  [NotificationTypes.ESTATEWEB_MISSING_TOKEN]: "missing token",
  [NotificationTypes.ESTATEWEB_INVALID_JSON]: "invalid json",
  [NotificationTypes.ESTATEWEB_SERVER_ERROR]: "server error",
  [NotificationTypes.ESTATEWEB_EMPTY_IMAGE]: "empty image",
  [NotificationTypes.ESTATEWEB_INVALID_PROPERTY_ID]: "invalid property id",
  [NotificationTypes.ESTATEWEB_LINK_NOT_FOUND]: "link not found",
  [NotificationTypes.ESTATEWEB_SESSION_PERSIST_FAILED]: "session persist failed",
};

interface NotificationTypeChipProps {
  type: NotificationType;
}

export function NotificationTypeChip({ type }: NotificationTypeChipProps) {
  return (
    <Chip size="sm" variant="soft">
      <Chip.Label>{typeLabel[type]}</Chip.Label>
    </Chip>
  );
}
