import type { ReactNode } from "react";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";

export type ConfirmationDialogState = ReturnType<typeof useOverlayState>;

export type ConfirmationDialogProps = {
  state: ConfirmationDialogState;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  isPending?: boolean;
};

export function ConfirmationDialog({
  state,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  isPending = false,
}: ConfirmationDialogProps) {
  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm());
      state.close();
    } catch {
      return;
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            {description ? <Modal.Body>{description}</Modal.Body> : null}
            <Modal.Footer>
              <Button variant="secondary" isDisabled={isPending} onPress={state.close}>
                {cancelLabel}
              </Button>
              <ActionButtonWithPending
                variant="danger"
                isPending={isPending}
                isDisabled={isPending}
                onPress={handleConfirm}
              >
                {confirmLabel}
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
