import { useState, type FC } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@heroui/react";
import { GripVertical } from "lucide-react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import type { PropertyDisplayImage } from "@/features/integration-property/utils/resolve-property-display-images";
import { cn } from "@/lib/utils";

interface SortableImageTileProps {
  id: string;
  image: PropertyDisplayImage;
  position: number;
  alt: string;
  isDisabled: boolean;
}

const SortableImageTile: FC<SortableImageTileProps> = ({
  id,
  image,
  position,
  alt,
  isDisabled,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isDisabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative aspect-square touch-manipulation select-none overflow-hidden rounded-lg border border-border bg-surface",
        isDisabled ? "cursor-progress opacity-70" : "cursor-grab",
        isDragging &&
          "z-20 cursor-grabbing border-accent opacity-90 shadow-lg ring-2 ring-accent/40",
      )}
      {...attributes}
      {...listeners}
    >
      <img
        src={image.url}
        alt={alt}
        draggable={false}
        referrerPolicy="no-referrer"
        className="pointer-events-none size-full object-cover"
      />
      <span
        className={cn(
          "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums shadow-sm backdrop-blur-sm",
          position === 1
            ? "bg-accent text-accent-foreground"
            : "bg-background/90 text-foreground",
        )}
      >
        {position === 1 ? "Cover" : position}
      </span>
      <span className="absolute right-2 top-2 rounded-md bg-background/90 p-1 text-muted shadow-sm backdrop-blur-sm">
        <GripVertical className="size-4" aria-hidden />
      </span>
    </div>
  );
};

interface PropertyImagesReorderGridProps {
  images: PropertyDisplayImage[];
  title: string;
  isPending?: boolean;
  onSave: (imageIds: number[]) => Promise<void> | void;
  onCancel: () => void;
}

export const PropertyImagesReorderGrid: FC<PropertyImagesReorderGridProps> = ({
  images,
  title,
  isPending = false,
  onSave,
  onCancel,
}) => {
  const [items, setItems] = useState<PropertyDisplayImage[]>(images);

  // Long-press on touch so vertical scrolling the page still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const idOf = (image: PropertyDisplayImage) => String(image.crmImageId);
  const isDirty = items.some((item, index) => item.key !== images[index]?.key);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((current) => {
      const from = current.findIndex((item) => idOf(item) === active.id);
      const to = current.findIndex((item) => idOf(item) === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  const handleSave = async () => {
    const ids = items
      .map((item) => item.crmImageId)
      .filter((id): id is number => id != null);
    await onSave(ids);
  };

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButtonWithPending
          type="button"
          variant="primary"
          size="sm"
          isPending={isPending}
          isDisabled={!isDirty || isPending}
          onPress={handleSave}
        >
          Save order
        </ActionButtonWithPending>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isDisabled={isPending}
          onPress={onCancel}
        >
          Cancel
        </Button>
        <span className="text-xs text-muted">
          Drag photos to reorder. The first photo is the cover.
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(idOf)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((image, index) => (
              <SortableImageTile
                key={image.key}
                id={idOf(image)}
                image={image}
                position={index + 1}
                alt={`${title} photo ${index + 1}`}
                isDisabled={isPending}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
