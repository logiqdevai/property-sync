import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { NotificationType } from "@/features/notifications/interfaces/notifications.interfaces";
import type {
  NotificationSetting,
  UpdateNotificationSettingPayload,
} from "../interfaces/notification-settings.interfaces";

export const getNotificationSettings = async (): Promise<NotificationSetting[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.notificationSettings.list);
    return response.data;
  } catch {
    throw new Error("Failed to fetch notification settings. Please try again.");
  }
};

export const updateNotificationSetting = async (
  type: NotificationType,
  payload: UpdateNotificationSettingPayload,
): Promise<NotificationSetting> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.admin.notificationSettings.detail(type),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update notification setting. Please try again.",
    );
  }
};
