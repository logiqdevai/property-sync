import { Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConnectionAgencyLinkForm } from "@/pages/dashboard/components/connection-agency-link-form";

type LinkConnectionToAgencyModalProps = {
  state: ReturnType<typeof useOverlayState>;
  connectionId: string | null;
  onClose: () => void;
};

export function LinkConnectionToAgencyModal({
  state,
  connectionId,
  onClose,
}: LinkConnectionToAgencyModalProps) {
  const handleClose = () => {
    onClose();
    state.close();
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container>
          <Modal.Dialog className="max-w-lg">
            <Modal.Header>
              <Modal.Heading>Link to tracked agency</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {connectionId ? (
                <ConnectionAgencyLinkForm
                  connectionId={connectionId}
                  onLinked={handleClose}
                />
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <ActionButtonWithPending variant="secondary" onPress={handleClose}>
                Skip for now
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
