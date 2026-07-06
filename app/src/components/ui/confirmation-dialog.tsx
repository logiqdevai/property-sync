import type { ReactNode } from "react";
import { AlertDialog, Button, useOverlayState } from "@heroui/react";
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
    <AlertDialog state={state}>
      <AlertDialog.Backdrop isDismissable={!isPending} />
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          {description ? <AlertDialog.Body>{description}</AlertDialog.Body> : null}
          <AlertDialog.Footer>
            <AlertDialog.CloseTrigger>
              <Button variant="secondary" isDisabled={isPending}>
                {cancelLabel}
              </Button>
            </AlertDialog.CloseTrigger>
            <ActionButtonWithPending
              variant="danger"
              isPending={isPending}
              isDisabled={isPending}
              onPress={handleConfirm}
            >
              {confirmLabel}
            </ActionButtonWithPending>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog>
  );
}
