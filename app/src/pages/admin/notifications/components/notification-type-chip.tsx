import { Chip } from "@heroui/react";
import { NotificationTypeLabels } from "@/config/constants/dropdowns/notification-type-filter.options";
import type { NotificationType } from "@/features/notifications/interfaces/notifications.interfaces";

interface NotificationTypeChipProps {
  type: NotificationType;
}

export function NotificationTypeChip({ type }: NotificationTypeChipProps) {
  return (
    <Chip size="sm" variant="soft">
      <Chip.Label>{NotificationTypeLabels[type]}</Chip.Label>
    </Chip>
  );
}
