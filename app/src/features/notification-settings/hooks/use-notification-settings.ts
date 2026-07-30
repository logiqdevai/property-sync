import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { NotificationType } from "@/features/notifications/interfaces/notifications.interfaces";
import {
  getNotificationSettings,
  updateNotificationSetting,
} from "../services/notification-settings.services";
import type { UpdateNotificationSettingPayload } from "../interfaces/notification-settings.interfaces";

export const useNotificationSettings = () => {
  return useQuery({
    queryKey: ["notificationSettings"],
    queryFn: getNotificationSettings,
  });
};

export const useUpdateNotificationSetting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      type,
      payload,
    }: {
      type: NotificationType;
      payload: UpdateNotificationSettingPayload;
    }) => updateNotificationSetting(type, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationSettings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update notification setting",
        description: error.message,
        variant: "error",
      });
    },
  });
};
