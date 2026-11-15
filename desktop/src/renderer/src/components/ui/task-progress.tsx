import { ProgressBar } from "@heroui/react";
import type { StatusChipColor } from "@/components/ui/status-chip";

interface TaskProgressProps {
  label: string;
  value: number;
  max: number;
  /** Shown on the right, e.g. "120 of 340". Defaults to the count. */
  valueLabel?: string;
  isIndeterminate?: boolean;
  color?: StatusChipColor;
}

export function TaskProgress({
  label,
  value,
  max,
  valueLabel,
  isIndeterminate = false,
  color = "accent",
}: TaskProgressProps) {
  const safeMax = Math.max(max, 1);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        {!isIndeterminate ? (
          <span className="tabular-nums text-muted">{valueLabel ?? `${value} of ${max}`}</span>
        ) : null}
      </div>
      <ProgressBar.Root
        aria-label={label}
        value={Math.min(value, safeMax)}
        minValue={0}
        maxValue={safeMax}
        isIndeterminate={isIndeterminate}
        color={color}
        size="md"
      >
        <ProgressBar.Track className="relative overflow-hidden">
          <ProgressBar.Fill className="transition-[width] duration-500 ease-out" />
        </ProgressBar.Track>
      </ProgressBar.Root>
    </div>
  );
}
