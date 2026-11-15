import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  className?: string;
}

const toneClass: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "text-foreground",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function StatTile({ label, value, hint, tone = "default", className }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg bg-surface-secondary px-4 py-3", className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", toneClass[tone])}>{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
