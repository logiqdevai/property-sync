import { Chip } from "@heroui/react";
import { NotificationSeverityFilterOptions } from "@/config/constants/dropdowns/notifications/notification-severity-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
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

interface NotificationSeverityChipProps {
  severity: NotificationSeverity;
}

export function NotificationSeverityChip({ severity }: NotificationSeverityChipProps) {
  return (
    <Chip color={severityColor[severity]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(NotificationSeverityFilterOptions, severity)}</Chip.Label>
    </Chip>
  );
}
