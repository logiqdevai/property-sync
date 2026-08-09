import { Button, Modal, useOverlayState } from "@heroui/react";
import { Copy } from "lucide-react";
import { NotificationSeverityChip } from "./notification-severity-chip";
import { NotificationTypeChip } from "./notification-type-chip";
import { getNotificationTypeLabel } from "@/config/constants/dropdowns/notifications/notification-type-filter.options";
import { NotificationSeverityFilterOptions } from "@/config/constants/dropdowns/notifications/notification-severity-filter.options";
import type { Notification } from "@/features/notifications/interfaces/notifications.interfaces";
import { toast } from "@/hooks/use-toast";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";

export type NotificationDetailModalState = ReturnType<typeof useOverlayState>;

interface NotificationDetailModalProps {
  state: NotificationDetailModalState;
  notification: Notification | null;
}

function formatNotificationClipboardText(notification: Notification): string {
  const typeLabel = getNotificationTypeLabel(notification.type);
  const severityLabel = getDropdownOptionLabel(
    NotificationSeverityFilterOptions,
    notification.severity,
  );

  return [
    `Title: ${notification.title}`,
    `Type: ${typeLabel}`,
    `Severity: ${severityLabel}`,
    `Created: ${new Date(notification.created_at).toLocaleString()}`,
    "",
    notification.message,
  ].join("\n");
}

async function copyNotificationMessage(notification: Notification) {
  try {
    await navigator.clipboard.writeText(formatNotificationClipboardText(notification));
    toast({ title: "Notification copied", duration: 2000, variant: "success" });
  } catch {
    toast({ title: "Could not copy notification", duration: 2000, variant: "error" });
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
                onPress={() => copyNotificationMessage(notification)}
              >
                <Copy className="h-4 w-4" />
                Copy
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
