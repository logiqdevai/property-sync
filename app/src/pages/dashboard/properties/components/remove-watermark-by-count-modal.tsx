import { useEffect, useState, type FC } from "react";
import { Button, Checkbox, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { cn } from "@/lib/utils";

export type RemoveWatermarkByCountModalState = ReturnType<typeof useOverlayState>;

type RemoveWatermarkByCountModalProps = {
  state: RemoveWatermarkByCountModalState;
  propertyCount: number;
  defaultImageCount?: number;
  onConfirm: (payload: {
    imageCount: number;
    replaceCrmImages: boolean;
  }) => void | Promise<void>;
  isPending?: boolean;
};

export const RemoveWatermarkByCountModal: FC<RemoveWatermarkByCountModalProps> = ({
  state,
  propertyCount,
  defaultImageCount = 1,
  onConfirm,
  isPending = false,
}) => {
  const [imageCount, setImageCount] = useState(defaultImageCount);
  const [replaceCrmImages, setReplaceCrmImages] = useState(true);

  useEffect(() => {
    if (!state.isOpen) return;
    setImageCount(defaultImageCount);
    setReplaceCrmImages(true);
  }, [state.isOpen, defaultImageCount]);

  const handleConfirm = async () => {
    const parsed = Number.isFinite(imageCount) && imageCount >= 1 ? imageCount : 1;
    try {
      await Promise.resolve(
        onConfirm({ imageCount: parsed, replaceCrmImages }),
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
          <Modal.Dialog className="max-w-md w-full">
            <Modal.Header>
              <Modal.Heading>
                Remove watermarks
                {propertyCount > 1 ? ` (${propertyCount})` : ""}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Removes watermarks from the first N CRM images
                {propertyCount > 1 ? " on each selected property" : ""}. Jobs run
                in the background — you can keep using the app.
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-foreground">Images from start of list</span>
                <input
                  type="number"
                  min={1}
                  aria-label="Number of images to dewatermark from the start"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  value={imageCount}
                  disabled={isPending}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    setImageCount(
                      Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
                    );
                  }}
                />
              </label>
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
