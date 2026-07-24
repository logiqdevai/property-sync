import { useEffect, useState, type FC } from "react";
import { Button, Checkbox, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { cn } from "@/lib/utils";

export type RemoveWatermarkModalState = ReturnType<typeof useOverlayState>;

type RemoveWatermarkModalProps = {
  state: RemoveWatermarkModalState;
  selectedCount: number;
  onConfirm: (replaceCrmImages: boolean) => void | Promise<void>;
  isPending?: boolean;
};

export const RemoveWatermarkModal: FC<RemoveWatermarkModalProps> = ({
  state,
  selectedCount,
  onConfirm,
  isPending = false,
}) => {
  const [replaceCrmImages, setReplaceCrmImages] = useState(false);

  useEffect(() => {
    if (!state.isOpen) return;
    setReplaceCrmImages(false);
  }, [state.isOpen]);

  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm(replaceCrmImages));
      state.close();
    } catch {
      return;
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-md w-full">
            <Modal.Header>
              <Modal.Heading>
                Remove watermark
                {selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                The watermark removal process will run in the background and
                may take a few minutes. You can continue using the application
                while the process completes.
              </p>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors",
                  replaceCrmImages
                    ? "border-accent/50 bg-accent/10"
                    : "hover:bg-surface-secondary",
                  isPending && "opacity-60 pointer-events-none",
                )}
              >
                <Checkbox
                  aria-label="Replace CRM images after watermark removal"
                  isSelected={replaceCrmImages}
                  onChange={setReplaceCrmImages}
                  isDisabled={isPending}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    Replace CRM images after watermark removal
                  </span>
                  <span className="text-xs text-muted">
                    {replaceCrmImages
                      ? "Uploads the clean photo to EstateWeb and deletes the old watermarked CRM photo."
                      : "Uploads a new clean photo to EstateWeb and updates our copy. Original CRM photos stay."}
                  </span>
                </span>
              </label>
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={isPending}
              >
                Cancel
              </Button>
              <ActionButtonWithPending
                variant="primary"
                onPress={handleConfirm}
                isPending={isPending}
              >
                Start removal
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
