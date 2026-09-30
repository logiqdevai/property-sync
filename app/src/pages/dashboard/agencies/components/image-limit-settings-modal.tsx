import { useEffect, useState } from "react";
import type { TrackAgencyPayload } from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { X } from "lucide-react";

type ImageLimitSettingsModalProps = {
  state: ReturnType<typeof useOverlayState>;
  agencyId: string;
  agencyName: string;
  disabled?: boolean;
  isPending?: boolean;
  maxImageCount: number | null | undefined;
  onSave: (payload: TrackAgencyPayload) => void | Promise<unknown>;
};

export function ImageLimitSettingsModal({
  state,
  agencyId,
  agencyName,
  disabled = false,
  isPending = false,
  maxImageCount,
  onSave,
}: ImageLimitSettingsModalProps) {
  const [value, setValue] = useState(() => maxImageCount?.toString() ?? "");
  const isInteractionDisabled = disabled || isPending;

  useEffect(() => {
    if (!state.isOpen) return;
    setValue(maxImageCount?.toString() ?? "");
  }, [state.isOpen, agencyId, maxImageCount]);

  const trimmed = value.trim();
  const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
  const isValid = parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  const isUnchanged = parsed === (maxImageCount ?? null);

  const handleSave = async () => {
    if (!isValid || isUnchanged || isInteractionDisabled) return;
    try {
      await onSave({ max_image_count: parsed });
      state.close();
    } catch {
      // Error toast is shown by the mutation itself; keep the modal open so
      // the user can see what happened and retry without re-entering the value.
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isInteractionDisabled}>
        <Modal.Container>
          <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-lg">
            <Modal.Header>
              <Modal.Heading>Image limit settings</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-xs text-muted">
                Cap how many images from {agencyName} are kept and pushed to
                the CMS, counted from the first image found. Remaining images
                are discarded. Use 0 to discard all images. Leave empty to
                keep all images.
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-foreground">Images to keep</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 pr-9"
                    value={value}
                    disabled={isInteractionDisabled}
                    placeholder="Unlimited"
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                    }}
                  />
                  {value.length > 0 && !isInteractionDisabled ? (
                    <button
                      type="button"
                      aria-label="Clear (unlimited)"
                      onClick={() => setValue("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm text-muted transition-colors hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
                {!isValid ? (
                  <span className="text-xs text-danger">
                    Enter a number of 0 or more, or leave empty for
                    unlimited.
                  </span>
                ) : null}
              </label>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                isDisabled={isInteractionDisabled}
                onPress={state.close}
              >
                Close
              </Button>
              <ActionButtonWithPending
                variant="primary"
                isPending={isPending}
                isDisabled={isInteractionDisabled || !isValid || isUnchanged}
                onPress={handleSave}
              >
                Save
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
