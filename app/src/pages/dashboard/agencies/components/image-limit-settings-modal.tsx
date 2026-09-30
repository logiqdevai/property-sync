import type { TrackAgencyPayload } from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { Button, Modal, useOverlayState } from "@heroui/react";

type ImageLimitSettingsModalProps = {
  state: ReturnType<typeof useOverlayState>;
  agencyId: string;
  agencyName: string;
  disabled?: boolean;
  maxImageCount: number | null | undefined;
  onSave: (payload: TrackAgencyPayload) => void;
};

export function ImageLimitSettingsModal({
  state,
  agencyId,
  agencyName,
  disabled = false,
  maxImageCount,
  onSave,
}: ImageLimitSettingsModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!disabled}>
        <Modal.Container>
          <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-lg">
            <Modal.Header>
              <Modal.Heading>Image limit settings</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-xs text-muted">
                Cap how many images from {agencyName} are kept and pushed to
                the CMS, counted from the first image found. Remaining images
                are discarded. Leave empty to keep all images.
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-foreground">Images to keep</span>
                <input
                  type="number"
                  min={1}
                  className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"
                  defaultValue={maxImageCount ?? ""}
                  key={`image-limit-${agencyId}-${maxImageCount ?? "unlimited"}`}
                  disabled={disabled}
                  placeholder="Unlimited"
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") {
                      if (maxImageCount != null) {
                        onSave({ max_image_count: null });
                      }
                      return;
                    }
                    const value = Number.parseInt(raw, 10);
                    if (
                      Number.isFinite(value) &&
                      value >= 1 &&
                      value !== maxImageCount
                    ) {
                      onSave({ max_image_count: value });
                    }
                  }}
                />
              </label>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={state.close}>
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
