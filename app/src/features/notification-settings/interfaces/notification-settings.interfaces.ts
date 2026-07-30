import type {
  NotificationSeverity,
  NotificationType,
} from "@/features/notifications/interfaces/notifications.interfaces";

export interface NotificationSetting {
  type: NotificationType;
  enabled: boolean;
  min_severity: NotificationSeverity;
  updated_at: string | null;
}

export interface UpdateNotificationSettingPayload {
  enabled?: boolean;
  min_severity?: NotificationSeverity;
}
