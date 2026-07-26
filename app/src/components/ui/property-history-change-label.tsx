import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatPropertyHistoryDetail,
  formatPropertyHistoryLabel,
  formatPropertyHistorySummary,
  shouldCollapsePropertyHistoryDetail,
} from "@/features/properties/utils/format-property-history";
import type { PropertyHistoryEntry } from "@/features/properties/interfaces/properties.interfaces";

type PropertyHistoryChangeLabelProps = {
  entry: Pick<
    PropertyHistoryEntry,
    "event_type" | "field" | "old_value" | "new_value"
  >;
  className?: string;
};

export function PropertyHistoryChangeLabel({
  entry,
  className,
}: PropertyHistoryChangeLabelProps) {
  const [open, setOpen] = useState(false);
  const collapse = shouldCollapsePropertyHistoryDetail(entry);
  const detail = formatPropertyHistoryDetail(entry);

  if (!collapse || !detail) {
    return (
      <span className={cn("break-words", className)}>
        {formatPropertyHistoryLabel(entry)}
      </span>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span>{formatPropertyHistorySummary(entry)}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
        aria-expanded={open}
      >
        {open ? "Hide changes" : "Show changes"}
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-surface-secondary p-2.5 text-xs text-muted whitespace-pre-wrap break-words font-mono leading-relaxed">
          {formatPropertyHistoryDetail(entry, true)}
        </pre>
      ) : null}
    </div>
  );
}
