import { Button, Modal, useOverlayState } from "@heroui/react";
import { Copy } from "lucide-react";
import { NotificationSeverityChip } from "./notification-severity-chip";
import { NotificationTypeChip } from "./notification-type-chip";
import type { Notification } from "@/features/notifications/interfaces/notifications.interfaces";
import { toast } from "@/hooks/use-toast";

export type NotificationDetailModalState = ReturnType<typeof useOverlayState>;

interface NotificationDetailModalProps {
  state: NotificationDetailModalState;
  notification: Notification | null;
}

async function copyNotificationMessage(message: string) {
  try {
    await navigator.clipboard.writeText(message);
    toast({ title: "Message copied", duration: 2000, variant: "success" });
  } catch {
    toast({ title: "Could not copy message", duration: 2000, variant: "error" });
  }
}

export function NotificationDetailModal({ state, notification }: NotificationDetailModalProps) {
  if (!notification) return null;

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header>
              <Modal.Heading>{notification.title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <NotificationTypeChip type={notification.type} />
                  <NotificationSeverityChip severity={notification.severity} />
                  <span className="text-xs text-muted">
                    {new Date(notification.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {notification.message}
                </p>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onPress={() => copyNotificationMessage(notification.message)}
              >
                <Copy className="h-4 w-4" />
                Copy message
              </Button>
              <Button variant="secondary" onPress={state.close}>
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export { copyNotificationMessage };
