import { useEffect, useState } from "react";
import { Button, Label, Modal, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { TruncateMatchField } from "@/components/ui/truncate-match-field";
import { encodeTruncatePiece, type TruncatePieceMode } from "@/lib/truncate-pieces";

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
  const [mode, setMode] = useState<TruncatePieceMode>("text");
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    if (!state.isOpen) {
      setMode("text");
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
          text: encodeTruncatePiece(mode, trimmed),
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
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header>
              <Modal.Heading>Truncate description text</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  Text matching the rule below is found in title and description on {countLabel}.
                  Leave replacement empty to remove it, or enter text to replace it.
                </p>

                <TruncateMatchField
                  idPrefix="truncate-description"
                  mode={mode}
                  onModeChange={setMode}
                  value={text}
                  onChange={setText}
                  disabled={isPending}
                  rows={5}
                />

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
                    disabled={isPending}
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
