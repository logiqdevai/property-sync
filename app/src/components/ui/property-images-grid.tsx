import { useEffect, useState, type DragEvent } from "react";
import { Button, Checkbox, Tooltip, useOverlayState } from "@heroui/react";
import {
  ArrowUpDown,
  Check,
  CloudCheck,
  Eye,
  Images,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  EstateWebImageOptionsModal,
  type EstateWebImageOptions,
} from "@/components/ui/estateweb-image-options-modal";
import { RemoveWatermarkModal } from "@/components/ui/remove-watermark-modal";
import { MigrateIntegrationImagesModal } from "@/components/ui/migrate-integration-images-modal";
import { PropertyImagesReorderGrid } from "@/components/ui/property-images-reorder-grid";
import type { TableRowAction } from "@/components/ui/table-row-actions-menu";
import type { MigrateIntegrationImagesMode } from "@/features/user-properties/interfaces/user-properties.interfaces";
import type { PropertyDisplayImage } from "@/features/integration-property/utils/resolve-property-display-images";
import { cn } from "@/lib/utils";
import {
  getCopyToTrackedConfirmation,
  hasOriginalImageDrag,
  ORIGINAL_IMAGE_DRAG_TYPE,
  parseDraggedImageIndexes,
} from "@/components/ui/property-images-grid.utils";

export function PropertyPhoto({
  src,
  fallbackSrc,
  alt,
  className,
}: {
  src: string;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  return (
    <a
      href={currentSrc}
      target="_blank"
      rel="noreferrer"
      className="block size-full"
    >
      <img
        src={currentSrc}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={className}
        onError={() => {
          if (fallbackSrc && currentSrc !== fallbackSrc) {
            setCurrentSrc(fallbackSrc);
          }
        }}
      />
    </a>
  );
}
export interface PropertyImagesGridProps {
  images: PropertyDisplayImage[];
  fallbackImages: string[];
  title: string;
  selectable?: boolean;
  canCreateFromPropertyImages?: boolean;
  canCopyToTracked?: boolean;
  canUpdateEstateWebImageOptions?: boolean;
  canRemoveWatermark?: boolean;
  canMigrateIntegrationImages?: boolean;
  canReorderIntegrationImages?: boolean;
  draggable?: boolean;
  showAll?: boolean;
  isMarked?: (image: PropertyDisplayImage) => boolean;
  copyLimitRemaining?: number | null;
  pendingRemoveIds?: number[];
  pendingAddCount?: number;
  onDragChange?: (count: number | null) => void;
  dropHint?: string | null;
  dropHintTone?: "default" | "error";
  onDeleteSelected?: (imageIds: number[]) => Promise<void> | void;
  onCreateSelected?: (imageIndexes: number[]) => Promise<void> | void;
  onCopySelected?: (
    imageIndexes: number[],
    removeWatermark: boolean,
  ) => Promise<void> | void;
  onUpdateEstateWebImageOptions?: (
    imageIds: number[],
    options: EstateWebImageOptions,
  ) => Promise<void> | void;
  onRemoveWatermark?: (
    imageIds: number[],
    replaceCrmImages: boolean,
  ) => Promise<void> | void;
  onMigrateIntegrationImages?: (
    mode: MigrateIntegrationImagesMode,
  ) => Promise<void> | void;
  onReorderIntegrationImages?: (imageIds: number[]) => Promise<void> | void;
  onDropImages?: (propertyImageIndexes: number[]) => void;
  isDeletePending?: boolean;
  isCreatePending?: boolean;
  isCopyToTrackedPending?: boolean;
  isUpdateEstateWebImageOptionsPending?: boolean;
  isRemoveWatermarkPending?: boolean;
  isMigrateIntegrationImagesPending?: boolean;
  isReorderPending?: boolean;
}

export function PropertyImagesGrid({
  images,
  fallbackImages,
  title,
  selectable = false,
  canCreateFromPropertyImages = false,
  canCopyToTracked = false,
  canUpdateEstateWebImageOptions = false,
  canRemoveWatermark = false,
  canMigrateIntegrationImages = false,
  canReorderIntegrationImages = false,
  draggable = false,
  showAll = false,
  isMarked,
  copyLimitRemaining = null,
  pendingRemoveIds = [],
  pendingAddCount = 0,
  onDragChange,
  dropHint = null,
  dropHintTone = "default",
  onDeleteSelected,
  onCreateSelected,
  onCopySelected,
  onUpdateEstateWebImageOptions,
  onRemoveWatermark,
  onMigrateIntegrationImages,
  onReorderIntegrationImages,
  onDropImages,
  isDeletePending = false,
  isCreatePending = false,
  isCopyToTrackedPending = false,
  isUpdateEstateWebImageOptionsPending = false,
  isRemoveWatermarkPending = false,
  isMigrateIntegrationImagesPending = false,
  isReorderPending = false,
}: PropertyImagesGridProps) {
  const [expanded, setExpanded] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    new Set(),
  );
  const deleteConfirm = useOverlayState();
  const createConfirm = useOverlayState();
  const copyConfirm = useOverlayState();
  const copyWithWatermarkConfirm = useOverlayState();
  const estateWebOptionsModal = useOverlayState();
  const removeWatermarkModal = useOverlayState();
  const migrateIntegrationImagesModal = useOverlayState();
  const canExpand = images.length > 2;
  const isPending =
    isDeletePending ||
    isCreatePending ||
    isCopyToTrackedPending ||
    isUpdateEstateWebImageOptionsPending ||
    isRemoveWatermarkPending ||
    isMigrateIntegrationImagesPending ||
    isReorderPending;
  // Only CRM-synced images have an id the reorder endpoint can act on; a not-yet-synced
  // (or permanently excluded duplicate) scraped photo tagging along in `images` shouldn't
  // block reordering the ones that actually are synced.
  const crmBackedImages = images.filter((image) => image.crmImageId != null);
  const canReorder =
    canReorderIntegrationImages &&
    Boolean(onReorderIntegrationImages) &&
    crmBackedImages.length > 1;
  // A CRM-synced image can be deleted/watermarked/etc; a not-yet-synced scraped
  // photo can only be picked to upload. Never show a checkbox promising an action
  // the image doesn't actually support.
  const isImageSelectable = (image: PropertyDisplayImage) => {
    if (isMarked?.(image)) return false;
    if (image.crmImageId != null && pendingRemoveIds.includes(image.crmImageId)) return false;
    if (image.crmImageId != null) {
      return (
        Boolean(onDeleteSelected) ||
        (canUpdateEstateWebImageOptions &&
          Boolean(onUpdateEstateWebImageOptions)) ||
        (canRemoveWatermark && Boolean(onRemoveWatermark))
      );
    }
    return (
      (canCreateFromPropertyImages &&
        Boolean(onCreateSelected) &&
        image.propertyImageIndex != null) ||
      (canCopyToTracked &&
        Boolean(onCopySelected) &&
        image.propertyImageIndex != null)
    );
  };
  const selectableIndexes = images
    .map((image, index) => (isImageSelectable(image) ? index : null))
    .filter((index): index is number => index != null);
  const canSelect = selectable && selectableIndexes.length > 0;
  const canMigrate =
    canMigrateIntegrationImages && Boolean(onMigrateIntegrationImages);
  const showToolbar = canSelect || canMigrate || canReorder;
  const allSelected =
    canSelect &&
    selectableIndexes.every((index) => selectedIndexes.has(index));
  const selectedCount = selectedIndexes.size;
  const selectedCrmIds = [
    ...new Set(
      [...selectedIndexes]
        .map((index) => images[index]?.crmImageId)
        .filter((id): id is number => id != null),
    ),
  ];
  const selectedCrmImages = images.filter(
    (image, index) =>
      selectedIndexes.has(index) && image.crmImageId != null,
  );
  const selectedEstateWebOptions: EstateWebImageOptions =
    selectedCrmImages.length === 0
      ? {
          show_on_site: false,
          show_on_groups: false,
          show_on_foreign_agents: false,
        }
      : {
          show_on_site: selectedCrmImages.every((image) => image.show_on_site),
          show_on_groups: selectedCrmImages.every(
            (image) => image.show_on_groups,
          ),
          show_on_foreign_agents: selectedCrmImages.every(
            (image) => image.show_on_foreign_agents,
          ),
        };
  const selectedPropertyIndexes = [
    ...new Set(
      [...selectedIndexes]
        .map((index) => images[index]?.propertyImageIndex)
        .filter((index): index is number => index != null),
    ),
  ].sort((a, b) => a - b);

  const overCopyLimit =
    copyLimitRemaining != null &&
    selectedPropertyIndexes.length > copyLimitRemaining;

  const selectAll = () => {
    setSelectedIndexes(new Set(selectableIndexes));
  };

  const deselectAll = () => {
    setSelectedIndexes(new Set());
  };

  const bulkActions: TableRowAction[] = [
    ...(canMigrate
      ? [
          {
            id: "migrate-crm-images",
            label: "Migrate CRM images",
            variant: "accent" as const,
            icon: Images,
            isDisabled: isPending,
            adminOnly: true,
          },
        ]
      : []),
    ...(canUpdateEstateWebImageOptions && onUpdateEstateWebImageOptions
      ? [
          {
            id: "estateweb-options",
            label: `EstateWeb options${selectedCrmIds.length > 0 ? ` (${selectedCrmIds.length})` : ""}`,
            variant: "accent" as const,
            icon: Eye,
            isDisabled: isPending || selectedCrmIds.length === 0,
          },
        ]
      : []),
    ...(canCreateFromPropertyImages && onCreateSelected
      ? [
          {
            id: "create-from-property",
            label: `Upload to CRM${selectedPropertyIndexes.length > 0 ? ` (${selectedPropertyIndexes.length})` : ""}`,
            variant: "accent" as const,
            icon: Images,
            isDisabled: isPending || selectedPropertyIndexes.length === 0,
            adminOnly: true,
          },
        ]
      : []),
    ...(canCopyToTracked && onCopySelected
      ? [
          {
            id: "copy-to-tracked",
            label: `Copy to CRM${selectedPropertyIndexes.length > 0 ? ` (${selectedPropertyIndexes.length})` : ""}`,
            variant: "accent" as const,
            icon: Images,
            isDisabled:
              isPending || selectedPropertyIndexes.length === 0 || overCopyLimit,
            adminOnly: true,
          },
          {
            id: "copy-to-tracked-watermark",
            label: `Copy to CRM (remove watermark)${selectedPropertyIndexes.length > 0 ? ` (${selectedPropertyIndexes.length})` : ""}`,
            variant: "accent" as const,
            icon: Sparkles,
            isDisabled:
              isPending || selectedPropertyIndexes.length === 0 || overCopyLimit,
            adminOnly: true,
          },
        ]
      : []),
    ...(canRemoveWatermark && onRemoveWatermark
      ? [
          {
            id: "remove-watermark",
            label: `Remove watermark${selectedCrmIds.length > 0 ? ` (${selectedCrmIds.length})` : ""}`,
            variant: "accent" as const,
            icon: Sparkles,
            isDisabled: isPending || selectedCrmIds.length === 0,
          },
        ]
      : []),
    ...(onDeleteSelected
      ? [
          {
            id: "delete",
            label: `Delete${selectedCrmIds.length > 0 ? ` (${selectedCrmIds.length})` : ""}`,
            variant: "danger" as const,
            icon: Trash2,
            isDisabled: isPending || selectedCrmIds.length === 0,
          },
        ]
      : []),
  ];

  const showActionsMenu =
    bulkActions.length > 0 && (canMigrate || selectedCount > 0);

  const handleDeleteConfirm = async () => {
    if (!onDeleteSelected || selectedCrmIds.length === 0) return;
    await onDeleteSelected(selectedCrmIds);
    setSelectedIndexes(new Set());
  };

  const handleCreateConfirm = async () => {
    if (!onCreateSelected || selectedPropertyIndexes.length === 0) return;
    await onCreateSelected(selectedPropertyIndexes);
    setSelectedIndexes(new Set());
  };

  const handleCopyConfirm = async () => {
    if (!onCopySelected || selectedPropertyIndexes.length === 0) return;
    await onCopySelected(selectedPropertyIndexes, false);
    setSelectedIndexes(new Set());
  };

  const handleCopyWithWatermarkConfirm = async () => {
    if (!onCopySelected || selectedPropertyIndexes.length === 0) return;
    await onCopySelected(selectedPropertyIndexes, true);
    setSelectedIndexes(new Set());
  };

  const handleEstateWebOptionsConfirm = async (
    options: EstateWebImageOptions,
  ) => {
    if (!onUpdateEstateWebImageOptions || selectedCrmIds.length === 0) return;
    await onUpdateEstateWebImageOptions(selectedCrmIds, options);
    setSelectedIndexes(new Set());
  };

  const handleRemoveWatermarkConfirm = async (replaceCrmImages: boolean) => {
    if (!onRemoveWatermark || selectedCrmIds.length === 0) return;
    await onRemoveWatermark(selectedCrmIds, replaceCrmImages);
    setSelectedIndexes(new Set());
  };

  const handleMigrateConfirm = async (mode: MigrateIntegrationImagesMode) => {
    if (!onMigrateIntegrationImages) return;
    await onMigrateIntegrationImages(mode);
  };

  const handleReorderSave = async (imageIds: number[]) => {
    if (!onReorderIntegrationImages) return;
    try {
      await onReorderIntegrationImages(imageIds);
      setIsReordering(false);
    } catch {
      // The mutation hook already surfaced the error; stay in reorder mode so the
      // user's arrangement isn't lost.
    }
  };

  if (isReordering && canReorder) {
    return (
      <PropertyImagesReorderGrid
        images={images}
        title={title}
        isPending={isReorderPending}
        onSave={handleReorderSave}
        onCancel={() => setIsReordering(false)}
      />
    );
  }

  const dropHandlers = onDropImages
    ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!hasOriginalImageDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsDropTarget(true);
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDropTarget(false);
          }
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          if (!hasOriginalImageDrag(event)) return;
          event.preventDefault();
          setIsDropTarget(false);
          const indexes = parseDraggedImageIndexes(
            event.dataTransfer.getData(ORIGINAL_IMAGE_DRAG_TYPE),
          );
          if (indexes.length > 0) onDropImages?.(indexes);
        },
      }
    : {};

  return (
    <div
      className={cn(
        "@container relative flex flex-col gap-3",
        isDropTarget && "rounded-xl ring-2 ring-accent",
      )}
      {...dropHandlers}
    >
      {isDropTarget ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl px-4 text-center text-sm font-medium backdrop-blur-[1px]",
            dropHintTone === "error"
              ? "bg-danger/10 text-danger"
              : "bg-accent/10 text-accent",
          )}
        >
          {dropHint ?? "Drop to copy to tracked images"}
        </div>
      ) : null}
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {canSelect ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={isPending || images.length === 0}
              onPress={allSelected ? deselectAll : selectAll}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          ) : null}
          {canReorder ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={isPending}
              onPress={() => {
                setSelectedIndexes(new Set());
                setIsReordering(true);
              }}
            >
              <ArrowUpDown className="size-4" />
              Reorder
            </Button>
          ) : null}
          {showActionsMenu ? (
            <BulkActionsMenu
              actions={bulkActions}
              onAction={(actionId) => {
                if (actionId === "migrate-crm-images")
                  migrateIntegrationImagesModal.open();
                if (actionId === "delete") deleteConfirm.open();
                if (actionId === "create-from-property") createConfirm.open();
                if (actionId === "copy-to-tracked") copyConfirm.open();
                if (actionId === "copy-to-tracked-watermark")
                  copyWithWatermarkConfirm.open();
                if (actionId === "estateweb-options")
                  estateWebOptionsModal.open();
                if (actionId === "remove-watermark")
                  removeWatermarkModal.open();
              }}
              isPending={isPending}
              label="Actions"
            />
          ) : null}
          {selectedCount > 0 ? (
            <span className="text-xs text-muted">{selectedCount} selected</span>
          ) : null}
          {overCopyLimit ? (
            <span className="text-xs font-medium text-danger">
              Only {copyLimitRemaining} free under the limit. Deselect{" "}
              {selectedPropertyIndexes.length - (copyLimitRemaining ?? 0)} to copy.
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3",
          showAll
            ? undefined
            : expanded
              ? "overflow-y-auto max-h-[calc(3*((100cqi-0.75rem)/2)+1.5rem)] sm:max-h-[calc(3*((100cqi-1.5rem)/3)+1.5rem)] md:max-h-[calc(3*((100cqi-2.25rem)/4)+1.5rem)]"
              : "overflow-hidden max-h-[calc((100cqi-0.75rem)/2)] sm:max-h-[calc((100cqi-1.5rem)/3)] md:max-h-[calc((100cqi-2.25rem)/4)]",
        )}
      >
        {images.map((image, index) => {
          const isSelected = selectedIndexes.has(index);
          const showCheckbox = canSelect && isImageSelectable(image);
          const isPendingRemoval =
            image.crmImageId != null && pendingRemoveIds.includes(image.crmImageId);
          const canDragTile =
            draggable &&
            image.propertyImageIndex != null &&
            !isMarked?.(image) &&
            !isPendingRemoval;

          return (
            <div
              key={image.key}
              draggable={canDragTile || undefined}
              onDragEnd={canDragTile ? () => onDragChange?.(null) : undefined}
              onDragStart={
                canDragTile
                  ? (event) => {
                      const indexes = isSelected
                        ? selectedPropertyIndexes
                        : [image.propertyImageIndex as number];
                      event.dataTransfer.setData(
                        ORIGINAL_IMAGE_DRAG_TYPE,
                        JSON.stringify(indexes),
                      );
                      event.dataTransfer.effectAllowed = "copy";
                      onDragChange?.(indexes.length);
                    }
                  : undefined
              }
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border transition-colors",
                canDragTile && "cursor-grab active:cursor-grabbing",
                isSelected
                  ? "border-accent ring-2 ring-accent/40"
                  : "border-border hover:border-accent/50",
              )}
            >
              <PropertyPhoto
                src={image.url}
                fallbackSrc={fallbackImages[index] ?? fallbackImages[0] ?? null}
                alt={`${title} photo ${index + 1}`}
                className={cn(
                  "size-full object-cover transition duration-300",
                  isPendingRemoval && "opacity-40 grayscale blur-[3px]",
                )}
              />
              {isPendingRemoval ? (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                  <Loader2
                    className="size-6 animate-spin text-foreground drop-shadow"
                    aria-label="Removing photo"
                  />
                </div>
              ) : null}
              {isMarked?.(image) ? (
                <div className="absolute bottom-2 left-2 z-10">
                  <Tooltip delay={150}>
                    <Tooltip.Trigger>
                      <span
                        tabIndex={0}
                        className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground shadow-sm"
                      >
                        <Check className="size-3" aria-hidden />
                        On property
                      </span>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="max-w-56 px-2 py-1.5 text-xs leading-snug">
                      <p className="font-medium text-foreground">
                        Already on this property
                      </p>
                      <p className="text-muted">
                        It can&apos;t be selected or dragged again.
                      </p>
                    </Tooltip.Content>
                  </Tooltip>
                </div>
              ) : null}
              {showCheckbox ? (
                <div
                  className={cn(
                    "absolute left-2 top-2 z-10 transition-opacity",
                    isSelected || selectedCount > 0
                      ? "opacity-100"
                      : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    aria-label={`Select photo ${index + 1}`}
                    isSelected={isSelected}
                    onChange={(selected) => {
                      setSelectedIndexes((current) => {
                        const next = new Set(current);
                        if (selected) next.add(index);
                        else next.delete(index);
                        return next;
                      });
                    }}
                    className="rounded-md bg-background/90 p-1 shadow-sm backdrop-blur-sm"
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Content>
                  </Checkbox>
                </div>
              ) : null}
              {image.crmImageId != null ? (
                <div
                  className="absolute right-2 top-2 z-10"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  <Tooltip delay={150}>
                    <Tooltip.Trigger>
                      <span
                        tabIndex={0}
                        className="inline-flex items-center justify-center rounded-md bg-background/90 p-1 text-accent shadow-sm backdrop-blur-sm"
                        aria-label="Synced to CRM"
                      >
                        <CloudCheck className="size-3.5" />
                      </span>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="max-w-56 px-2 py-1.5 text-xs leading-snug">
                      <p className="font-medium text-foreground">
                        Synced to CRM
                      </p>
                      <p className="text-muted">
                        CRM image #{image.crmImageId}
                      </p>
                      <p className="text-muted">
                        Visible on:{" "}
                        {[
                          image.show_on_site ? "site" : null,
                          image.show_on_groups ? "groups" : null,
                          image.show_on_foreign_agents
                            ? "foreign agents"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "nowhere"}
                      </p>
                    </Tooltip.Content>
                  </Tooltip>
                </div>
              ) : null}
            </div>
          );
        })}
        {Array.from({ length: pendingAddCount }, (_, index) => (
          <div
            key={`pending-add-${index}`}
            aria-hidden
            className="aspect-square animate-pulse rounded-lg border border-border bg-surface-secondary"
          />
        ))}
      </div>
      {canExpand && !showAll ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onPress={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
      {onDeleteSelected ? (
        <ConfirmationDialog
          state={deleteConfirm}
          title={`Delete ${selectedCrmIds.length} CRM ${selectedCrmIds.length === 1 ? "image" : "images"}?`}
          description="Selected images will be removed from the linked CRM and refreshed locally."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          isPending={isDeletePending}
        />
      ) : null}
      {canCreateFromPropertyImages && onCreateSelected ? (
        <ConfirmationDialog
          state={createConfirm}
          title={`Upload ${selectedPropertyIndexes.length} ${selectedPropertyIndexes.length === 1 ? "photo" : "photos"} to CRM?`}
          description="Selected scraped photos will be uploaded to the linked CRM."
          confirmLabel="Upload"
          onConfirm={handleCreateConfirm}
          isPending={isCreatePending}
        />
      ) : null}
      {canCopyToTracked && onCopySelected ? (
        <>
          <ConfirmationDialog
            state={copyConfirm}
            {...getCopyToTrackedConfirmation(selectedPropertyIndexes.length, false)}
            confirmLabel="Copy"
            onConfirm={handleCopyConfirm}
            isPending={isCopyToTrackedPending}
          />
          <ConfirmationDialog
            state={copyWithWatermarkConfirm}
            {...getCopyToTrackedConfirmation(selectedPropertyIndexes.length, true)}
            confirmLabel="Copy"
            onConfirm={handleCopyWithWatermarkConfirm}
            isPending={isCopyToTrackedPending}
          />
        </>
      ) : null}
      {canUpdateEstateWebImageOptions && onUpdateEstateWebImageOptions ? (
        <EstateWebImageOptionsModal
          state={estateWebOptionsModal}
          selectedCount={selectedCrmIds.length}
          initialOptions={selectedEstateWebOptions}
          onConfirm={handleEstateWebOptionsConfirm}
          isPending={isUpdateEstateWebImageOptionsPending}
        />
      ) : null}
      {canRemoveWatermark && onRemoveWatermark ? (
        <RemoveWatermarkModal
          state={removeWatermarkModal}
          selectedCount={selectedCrmIds.length}
          onConfirm={handleRemoveWatermarkConfirm}
          isPending={isRemoveWatermarkPending}
        />
      ) : null}
      {canMigrate ? (
        <MigrateIntegrationImagesModal
          state={migrateIntegrationImagesModal}
          onConfirm={handleMigrateConfirm}
          isPending={isMigrateIntegrationImagesPending}
        />
      ) : null}
    </div>
  );
}
