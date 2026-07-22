import { Chip } from "@heroui/react";
import { getNotificationTypeLabel } from "@/config/constants/dropdowns/notifications/notification-type-filter.options";
import type { NotificationType } from "@/features/notifications/interfaces/notifications.interfaces";

interface NotificationTypeChipProps {
  type: NotificationType;
}

export function NotificationTypeChip({ type }: NotificationTypeChipProps) {
  return (
    <Chip size="sm" variant="soft">
      <Chip.Label>{getNotificationTypeLabel(type)}</Chip.Label>
    </Chip>
  );
}
