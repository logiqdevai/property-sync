import { Chip } from "@heroui/react";
import {
  NotificationSeverities,
  type NotificationSeverity,
} from "@/features/notifications/interfaces/notifications.interfaces";

const severityColor: Record<
  NotificationSeverity,
  "default" | "warning" | "danger"
> = {
  [NotificationSeverities.INFO]: "default",
  [NotificationSeverities.WARNING]: "warning",
  [NotificationSeverities.CRITICAL]: "danger",
};

const severityLabel: Record<NotificationSeverity, string> = {
  [NotificationSeverities.INFO]: "Info",
  [NotificationSeverities.WARNING]: "Warning",
  [NotificationSeverities.CRITICAL]: "Critical",
};

interface NotificationSeverityChipProps {
  severity: NotificationSeverity;
}

export function NotificationSeverityChip({ severity }: NotificationSeverityChipProps) {
  return (
    <Chip color={severityColor[severity]} size="sm" variant="soft">
      <Chip.Label>{severityLabel[severity]}</Chip.Label>
    </Chip>
  );
}
