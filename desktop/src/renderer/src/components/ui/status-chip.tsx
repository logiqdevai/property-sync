import type { ComponentType } from "react";
import { Chip } from "@heroui/react";
import { cn } from "@/lib/utils";

export type StatusChipColor = "accent" | "danger" | "default" | "success" | "warning";

interface StatusChipProps {
  label: string;
  color?: StatusChipColor;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}

/** A soft chip with an optional icon; color is never the only signal (DESIGN.md §2.5). */
export function StatusChip({ label, color = "default", icon: Icon, className }: StatusChipProps) {
  return (
    <Chip color={color} size="sm" variant="soft" className={className}>
      <Chip.Label>
        <span className={cn("inline-flex items-center gap-1")}>
          {Icon ? <Icon className="size-3" /> : null}
          {label}
        </span>
      </Chip.Label>
    </Chip>
  );
}
