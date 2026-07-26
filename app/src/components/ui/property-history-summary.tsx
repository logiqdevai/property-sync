import { PropertyHistoryChangeLabel } from "@/components/ui/property-history-change-label";
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
        <li key={entry.id} className="min-w-0 text-sm">
          <PropertyHistoryChangeLabel
            entry={entry}
            className="text-foreground"
          />
        </li>
      ))}
    </ul>
  );
}
