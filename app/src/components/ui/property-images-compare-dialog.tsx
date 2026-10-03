import { useState } from "react";
import {
  Button,
  Modal,
  ToggleButton,
  ToggleButtonGroup,
  useOverlayState,
} from "@heroui/react";
import { Images, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  PropertyImagesGrid,
  type PropertyImagesGridProps,
} from "@/components/ui/property-images-grid";
import { getCopyToTrackedConfirmation } from "@/components/ui/property-images-grid.utils";
import type { PropertyDisplayImage } from "@/features/integration-property/utils/resolve-property-display-images";

const COPY_MODE = {
  plain: "plain",
  removeWatermark: "remove-watermark",
} as const;

type CopyMode = (typeof COPY_MODE)[keyof typeof COPY_MODE];

interface PendingDrop {
  propertyImageIndexes: number[];
  removeWatermark: boolean;
}

export interface PropertyImagesCompareDialogProps {
  state: ReturnType<typeof useOverlayState>;
  title: string;
  userImagesGridProps: PropertyImagesGridProps;
  originalImages: PropertyDisplayImage[];
  isOriginalOnProperty: (image: PropertyDisplayImage) => boolean;
  canCopyOriginals: boolean;
  onCopyOriginals?: (
    propertyImageIndexes: number[],
    removeWatermark: boolean,
  ) => Promise<void> | void;
  isCopyingOriginals: boolean;
  imageLimit: number | null;
  trackedImageCount: number;
}

export function PropertyImagesCompareDialog({
  state,
  title,
  userImagesGridProps,
  originalImages,
  isOriginalOnProperty,
  canCopyOriginals,
  onCopyOriginals,
  isCopyingOriginals,
  imageLimit,
  trackedImageCount,
}: PropertyImagesCompareDialogProps) {
  const [copyMode, setCopyMode] = useState<CopyMode>(COPY_MODE.plain);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [draggingCount, setDraggingCount] = useState<number | null>(null);
  const dropConfirm = useOverlayState();
  const canDrop = canCopyOriginals && Boolean(onCopyOriginals);
  const isDropEnabled = canDrop && !isCopyingOriginals;
  const removeWatermarkMode = copyMode === COPY_MODE.removeWatermark;
  const slotsRemaining =
    imageLimit != null ? Math.max(0, imageLimit - trackedImageCount) : null;
  const overDropLimit =
    draggingCount != null &&
    slotsRemaining != null &&
    draggingCount > slotsRemaining;
  const dropHintTone = overDropLimit ? "error" : "default";
  const dropHint =
    draggingCount == null || slotsRemaining == null || imageLimit == null
      ? null
      : overDropLimit
        ? slotsRemaining === 0
          ? `The limit of ${imageLimit} is already reached.`
          : `Only ${slotsRemaining} more ${slotsRemaining === 1 ? "photo fits" : "photos fit"} the limit of ${imageLimit}. Dragging ${draggingCount}.`
        : `Drop to copy ${draggingCount} ${draggingCount === 1 ? "photo" : "photos"} · ${slotsRemaining} free`;

  const handleDrop = (propertyImageIndexes: number[]) => {
    if (!isDropEnabled) return;
    if (slotsRemaining != null && propertyImageIndexes.length > slotsRemaining) {
      toast({
        title: "Over the image limit",
        description: `Only ${slotsRemaining} more ${slotsRemaining === 1 ? "photo fits" : "photos fit"} under the limit of ${imageLimit}.`,
        variant: "error",
      });
      return;
    }
    setPendingDrop({
      propertyImageIndexes,
      removeWatermark: removeWatermarkMode,
    });
    dropConfirm.open();
  };

  const handleDropConfirm = async () => {
    if (!pendingDrop || !onCopyOriginals) return;
    await onCopyOriginals(
      pendingDrop.propertyImageIndexes,
      pendingDrop.removeWatermark,
    );
  };

  const pendingCopy = getCopyToTrackedConfirmation(
    pendingDrop?.propertyImageIndexes.length ?? 0,
    pendingDrop?.removeWatermark ?? false,
  );

  return (
    <>
      <Modal state={state}>
        <Modal.Backdrop isDismissable={!isCopyingOriginals}>
          <Modal.Container>
            <Modal.Dialog className="h-[92dvh] max-h-[92dvh] w-[96vw] max-w-[96vw] flex flex-col">
              <Modal.Header>
                <Modal.Heading>Compare photos</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <section
                    aria-label="Property images"
                    className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:max-h-[calc(92dvh-8rem)] lg:self-start lg:overflow-y-auto"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h3 className="text-sm font-semibold text-foreground">
                        Property images
                      </h3>
                      <p className="text-xs text-muted">
                        Photos on this property now, as synced to the CRM.
                        {canDrop ? " Drop original photos here to copy them." : ""}
                      </p>
                      {imageLimit != null ? (
                        <p
                          className={cn(
                            "w-fit rounded-lg px-2.5 py-1.5 text-base font-semibold",
                            slotsRemaining === 0
                              ? "bg-warning text-warning-foreground"
                              : "bg-surface-secondary text-foreground",
                          )}
                        >
                          {trackedImageCount} of {imageLimit} photos used (images to keep) · {slotsRemaining} free
                        </p>
                      ) : null}
                    </div>
                    <PropertyImagesGrid
                      {...userImagesGridProps}
                      showAll
                      onDropImages={isDropEnabled ? handleDrop : undefined}
                      dropHint={dropHint}
                      dropHintTone={dropHintTone}
                    />
                  </section>

                  <section
                    aria-label="Original images"
                    className="flex min-w-0 flex-col gap-3 lg:border-l lg:border-border lg:pl-6"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h3 className="text-sm font-semibold text-foreground">
                        Original images
                      </h3>
                      <p className="text-xs text-muted">
                        The agency&apos;s photos from the latest scrape, before
                        any image limit is applied.
                      </p>
                    </div>
                    {canDrop ? (
                      <div className="flex min-w-0 flex-col gap-2">
                        <ToggleButtonGroup
                          aria-label="Copy mode for dropped photos"
                          selectionMode="single"
                          disallowEmptySelection
                          size="sm"
                          selectedKeys={[copyMode]}
                          onSelectionChange={(keys) => {
                            const [next] = keys;
                            if (next == null) return;
                            setCopyMode(
                              String(next) === COPY_MODE.removeWatermark
                                ? COPY_MODE.removeWatermark
                                : COPY_MODE.plain,
                            );
                          }}
                        >
                          <ToggleButton id={COPY_MODE.plain}>
                            <Images className="size-4" />
                            Copy to CRM
                          </ToggleButton>
                          <ToggleButton id={COPY_MODE.removeWatermark}>
                            <Sparkles className="size-4" />
                            Copy to CRM (remove watermark)
                          </ToggleButton>
                        </ToggleButtonGroup>
                        <p className="text-xs text-muted">
                          {removeWatermarkMode
                            ? "Drop a photo on the left to copy it with its watermark removed. Each photo uses Dewatermark credits."
                            : "Drop a photo on the left to copy it to tracked images and the CRM."}
                        </p>
                      </div>
                    ) : null}
                    <PropertyImagesGrid
                      images={originalImages}
                      fallbackImages={[]}
                      title={`${title} (original)`}
                      showAll
                      isMarked={isOriginalOnProperty}
                      copyLimitRemaining={slotsRemaining}
                      onDragChange={setDraggingCount}
                      draggable={canDrop}
                      selectable={canDrop}
                      canCopyToTracked={canDrop}
                      onCopySelected={onCopyOriginals}
                      isCopyToTrackedPending={isCopyingOriginals}
                    />
                  </section>
                </div>
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
      {canDrop ? (
        <ConfirmationDialog
          state={dropConfirm}
          {...pendingCopy}
          confirmLabel="Copy"
          onConfirm={handleDropConfirm}
          isPending={isCopyingOriginals}
        />
      ) : null}
    </>
  );
}
