import {
  NotificationSeverities,
  type NotificationSeverity,
} from "@/features/notifications/interfaces/notifications.interfaces";

export const NotificationSeverityFilterOptions: { id: NotificationSeverity | "all"; label: string }[] = [
  { id: "all", label: "All severities" },
  { id: NotificationSeverities.INFO, label: "Info" },
  { id: NotificationSeverities.WARNING, label: "Warning" },
  { id: NotificationSeverities.CRITICAL, label: "Critical" },
];
