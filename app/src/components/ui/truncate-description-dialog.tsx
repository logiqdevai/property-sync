import { useEffect, useState } from "react";
import { Button, Label, Modal, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";

export type TruncateDescriptionDialogState = ReturnType<typeof useOverlayState>;

export type TruncateDescriptionConfirmPayload = {
  text: string;
  replacement?: string;
};

export type TruncateDescriptionDialogProps = {
  state: TruncateDescriptionDialogState;
  propertyCount: number;
  onConfirm: (payload: TruncateDescriptionConfirmPayload) => void | Promise<void>;
  isPending?: boolean;
};

export function TruncateDescriptionDialog({
  state,
  propertyCount,
  onConfirm,
  isPending = false,
}: TruncateDescriptionDialogProps) {
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    if (!state.isOpen) {
      setText("");
      setReplacement("");
    }
  }, [state.isOpen]);

  const trimmed = text.trim();
  const trimmedReplacement = replacement.trim();
  const countLabel =
    propertyCount === 1 ? "1 property" : `${propertyCount} properties`;

  const handleConfirm = async () => {
    if (!trimmed) return;
    try {
      await Promise.resolve(
        onConfirm({
          text: trimmed,
          ...(trimmedReplacement ? { replacement: trimmedReplacement } : {}),
        }),
      );
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
                  Exact text below is found in title and description on {countLabel}. Leave
                  replacement empty to remove it, or enter text to replace it.
                </p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="truncate-description-text">Text to find</Label>
                  <TextArea
                    id="truncate-description-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    fullWidth
                    placeholder="Paste the exact phrase or block to find…"
                    isDisabled={isPending}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="truncate-description-replacement">
                    Replacement text{" "}
                    <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <TextArea
                    id="truncate-description-replacement"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    rows={3}
                    fullWidth
                    placeholder="Leave empty to remove, or type replacement…"
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
