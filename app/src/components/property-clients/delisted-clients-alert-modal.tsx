import { useEffect, type FC } from "react";
import { X } from "lucide-react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import {
  useAcknowledgeDelistedAlerts,
  useDelistedAlerts,
} from "@/features/property-clients/hooks/use-property-clients";
import { DelistedAlertsList } from "./delisted-alerts-list";

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
          <Modal.Dialog className="relative max-h-[85vh] w-full max-w-lg">
            <Modal.Header>
              <Modal.Heading className="pr-10">
                {alerts.length === 1
                  ? "A property you showed to clients was removed"
                  : `${alerts.length} properties you showed to clients were removed`}
              </Modal.Heading>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label="Close and mark as seen"
                className="absolute right-3 top-3 z-10"
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
              <DelistedAlertsList alerts={alerts} onNavigate={state.close} />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
