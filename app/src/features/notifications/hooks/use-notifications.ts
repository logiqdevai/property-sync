import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  deleteNotification,
  deleteNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendTelegramTest,
} from "../services/notifications.services";
import type {
  DeleteNotificationsPayload,
  NotificationListQuery,
  SendTelegramTestPayload,
} from "../interfaces/notifications.interfaces";

export const useNotifications = (query: NotificationListQuery) => {
  return useQuery({
    queryKey: ["notifications", "list", query],
    queryFn: () => getNotifications(query),
  });
};

export const useUnreadNotificationsCount = () => {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => getNotifications({ is_read: false, limit: 1, page: 1 }),
    refetchInterval: 30_000,
    select: (data) => data.pagination.total,
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Notification marked as read", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not mark notification as read",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({
        title: "All notifications marked as read",
        description: `${result.updated} updated`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not mark all notifications as read",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Notification deleted", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete notification",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteNotifications = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteNotificationsPayload) => deleteNotifications(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({
        title: "Notifications deleted",
        description: `${result.deleted} deleted`,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete notifications",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useSendTelegramTest = () => {
  return useMutation({
    mutationFn: (payload: SendTelegramTestPayload) => sendTelegramTest(payload),
    onSuccess: () => {
      toast({ title: "Telegram test message sent", duration: 2000, variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not send Telegram test message",
        description: error.message,
        variant: "error",
      });
    },
  });
};
