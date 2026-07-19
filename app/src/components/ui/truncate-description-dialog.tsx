import { useEffect, useState } from "react";
import { Button, Label, Modal, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";

export type TruncateDescriptionDialogState = ReturnType<typeof useOverlayState>;

export type TruncateDescriptionDialogProps = {
  state: TruncateDescriptionDialogState;
  propertyCount: number;
  onConfirm: (text: string) => void | Promise<void>;
  isPending?: boolean;
};

export function TruncateDescriptionDialog({
  state,
  propertyCount,
  onConfirm,
  isPending = false,
}: TruncateDescriptionDialogProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!state.isOpen) {
      setText("");
    }
  }, [state.isOpen]);

  const trimmed = text.trim();
  const countLabel =
    propertyCount === 1 ? "1 property" : `${propertyCount} properties`;

  const handleConfirm = async () => {
    if (!trimmed) return;
    try {
      await Promise.resolve(onConfirm(trimmed));
      state.close();
    } catch {
      return;
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-lg">
            <Modal.Header>
              <Modal.Heading>Truncate description text</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  Exact text below is removed from title and description on{" "}
                  {countLabel}.
                </p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="truncate-description-text">Text to remove</Label>
                  <TextArea
                    id="truncate-description-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={6}
                    fullWidth
                    placeholder="Paste the exact phrase or block to strip…"
                    isDisabled={isPending}
                  />
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={isPending} onPress={state.close}>
                Cancel
              </Button>
              <ActionButtonWithPending
                variant="primary"
                isPending={isPending}
                isDisabled={isPending || !trimmed}
                onPress={handleConfirm}
              >
                Apply
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
