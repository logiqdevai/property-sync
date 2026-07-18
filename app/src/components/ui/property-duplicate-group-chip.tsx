import { Chip } from "@heroui/react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDuplicateGroupChipClasses,
  getDuplicateGroupShortLabel,
} from "@/lib/duplicate-group-color.utils";

interface PropertyDuplicateGroupChipProps {
  groupId: string;
  className?: string;
}

export function PropertyDuplicateGroupChip({
  groupId,
  className,
}: PropertyDuplicateGroupChipProps) {
  return (
    <Chip
      size="sm"
      variant="soft"
      className={cn(getDuplicateGroupChipClasses(groupId), className)}
    >
      <Chip.Label>
        <span className="inline-flex items-center gap-1">
          <Layers className="size-3" />
          {getDuplicateGroupShortLabel(groupId)}
        </span>
      </Chip.Label>
    </Chip>
  );
}
