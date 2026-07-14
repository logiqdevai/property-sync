import { Chip } from "@heroui/react";
import { NotificationTypes, type NotificationType } from "../interfaces/notifications.interfaces";

const typeLabel: Record<NotificationType, string> = {
  [NotificationTypes.BROKEN_SCRAPER]: "Broken scraper",
  [NotificationTypes.CMS_SYNC_FAILURE]: "CMS sync failure",
  [NotificationTypes.PROPERTY_REMOVAL_SPIKE]: "Removal spike",
  [NotificationTypes.LARGE_CRAWL_FAILURE]: "Crawl failure",
  [NotificationTypes.QUEUE_FAILURE]: "Queue failure",
  [NotificationTypes.WEBSITE_UNAVAILABLE]: "Website unavailable",
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
