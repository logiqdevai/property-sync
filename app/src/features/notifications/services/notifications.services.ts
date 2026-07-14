import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  MarkAllReadResponse,
  Notification,
  NotificationListQuery,
  PaginatedResponse,
} from "../interfaces/notifications.interfaces";

export const getNotifications = async (
  query?: NotificationListQuery,
): Promise<PaginatedResponse<Notification>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.notifications.list, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch notifications. Please try again.");
  }
};

export const markNotificationRead = async (id: string): Promise<Notification> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.admin.notifications.markRead(id));
    return response.data;
  } catch {
    throw new Error("Failed to mark notification as read. Please try again.");
  }
};

export const markAllNotificationsRead = async (): Promise<MarkAllReadResponse> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.admin.notifications.markAllRead);
    return response.data;
  } catch {
    throw new Error("Failed to mark all notifications as read. Please try again.");
  }
};
