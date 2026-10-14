import { useEffect, type FC } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { formatDate } from "@/lib/date";
import {
  useAcknowledgeDelistedAlerts,
  useDelistedAlerts,
} from "@/features/property-clients/hooks/use-property-clients";

/**
 * Shown on dashboard load while any property that has clients was delisted from the agency site and
 * the user has not dismissed the alert. Only the X closes it (and marks it as seen, server-side), so it
 * keeps coming back at every login until someone presses it.
 */
export const DelistedClientsAlertModal: FC = () => {
  const state = useOverlayState();
  const { data: alerts = [] } = useDelistedAlerts();
  const acknowledge = useAcknowledgeDelistedAlerts();

  useEffect(() => {
    if (alerts.length > 0 && !state.isOpen) state.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.length]);

  const dismiss = async () => {
    try {
      await acknowledge.mutateAsync(alerts.map((a) => a.user_property_id));
      state.close();
    } catch {
      return;
    }
  };

  if (alerts.length === 0) return null;

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false}>
        <Modal.Container>
          <Modal.Dialog className="max-h-[85vh] w-full max-w-lg">
            <Modal.Header className="flex items-start justify-between gap-3">
              <Modal.Heading>
                {alerts.length === 1
                  ? "A property you showed to clients was removed"
                  : `${alerts.length} properties you showed to clients were removed`}
              </Modal.Heading>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label="Close and mark as seen"
                className="shrink-0"
                isPending={acknowledge.isPending}
                isDisabled={acknowledge.isPending}
                onPress={() => void dismiss()}
              >
                <X className="size-4" />
              </Button>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3 overflow-y-auto">
              <p className="text-sm text-muted">
                These listings are no longer on the agency website. Open one to see who you showed
                it to.
              </p>
              <ul className="flex flex-col gap-2">
                {alerts.map((alert) => (
                  <li key={alert.user_property_id} className="rounded-lg border border-border p-3">
                    <Link
                      to={`/properties/${alert.user_property_id}`}
                      onClick={state.close}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      {alert.internal_id ? `${alert.internal_id} · ` : ""}
                      {alert.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted">
                      {alert.clients
                        .map((c) => `${c.name} (${formatDate(c.shown_at)})`)
                        .join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
