import {
  formatPropertyHistoryLabel,
  formatPropertyHistoryValue,
} from "@/features/properties/utils/format-property-history";
import type { PropertyHistoryEntry } from "@/features/properties/interfaces/properties.interfaces";

export function PropertyHistorySummary({
  history,
}: {
  history?: PropertyHistoryEntry[] | null;
}) {
  if (!history || history.length === 0) {
    return <span className="text-sm text-muted">—</span>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {history.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5 text-sm">
          <span className="text-foreground">{formatPropertyHistoryLabel(entry)}</span>
          {entry.field ? (
            <span className="text-xs text-muted break-words">
              {entry.field}: {formatPropertyHistoryValue(entry.old_value)} →{" "}
              {formatPropertyHistoryValue(entry.new_value)}
            </span>
          ) : entry.old_value != null || entry.new_value != null ? (
            <span className="text-xs text-muted break-words">
              {formatPropertyHistoryValue(entry.old_value)} →{" "}
              {formatPropertyHistoryValue(entry.new_value)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
