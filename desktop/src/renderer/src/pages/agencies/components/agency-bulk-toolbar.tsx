import { Button, Checkbox } from "@heroui/react";
import { Play } from "lucide-react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";

interface AgencyBulkToolbarProps {
  /** Agencies on screen that can be ticked (set up, not already crawling). */
  selectableCount: number;
  selectedCount: number;
  onSelectAll(): void;
  onDeselectAll(): void;
  onCrawlSelected(): void;
  isStarting: boolean;
}

export function AgencyBulkToolbar({
  selectableCount,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onCrawlSelected,
  isStarting,
}: AgencyBulkToolbarProps) {
  const allSelected = selectableCount > 0 && selectedCount === selectableCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
      <div className="flex items-center gap-3">
        <Checkbox
          aria-label={allSelected ? "Deselect all" : "Select all"}
          isSelected={allSelected}
          isIndeterminate={selectedCount > 0 && !allSelected}
          isDisabled={selectableCount === 0}
          onChange={(isSelected) => (isSelected ? onSelectAll() : onDeselectAll())}
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <span className="text-sm text-foreground">
              {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
            </span>
          </Checkbox.Content>
        </Checkbox>
        {selectedCount > 0 && !allSelected ? (
          <Button variant="ghost" size="sm" onPress={onSelectAll}>
            Select all {selectableCount}
          </Button>
        ) : null}
        {selectedCount > 0 ? (
          <Button variant="ghost" size="sm" onPress={onDeselectAll}>
            Deselect all
          </Button>
        ) : null}
      </div>
      <ActionButtonWithPending
        variant="primary"
        size="sm"
        isPending={isStarting}
        isDisabled={selectedCount === 0 || isStarting}
        idleLeading={<Play className="size-4" />}
        onPress={onCrawlSelected}
      >
        {selectedCount > 0 ? `Crawl ${selectedCount} selected` : "Crawl selected"}
      </ActionButtonWithPending>
    </div>
  );
}
