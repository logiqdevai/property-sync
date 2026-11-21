import { Button, Checkbox, Dropdown, Spinner } from "@heroui/react";
import { ChevronDown, ImageOff, Play } from "lucide-react";

interface AgencyBulkToolbarProps {
  /** Agencies on screen that can be ticked (set up, not already crawling). */
  selectableCount: number;
  selectedCount: number;
  onSelectAll(): void;
  onDeselectAll(): void;
  onCrawlSelected(): void;
  onFixPhotosSelected(): void;
  isStarting: boolean;
  /** How many crawls run at once; the rest wait their turn. */
  concurrency: number;
  onConcurrencyChange(value: number): void;
  photosAfter: boolean;
  onPhotosAfterChange(value: boolean): void;
  pushAfter: boolean;
  onPushAfterChange(value: boolean): void;
}

export function AgencyBulkToolbar({
  selectableCount,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onCrawlSelected,
  onFixPhotosSelected,
  isStarting,
  concurrency,
  onConcurrencyChange,
  photosAfter,
  onPhotosAfterChange,
  pushAfter,
  onPushAfterChange,
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
      <div className="flex flex-wrap items-center gap-3">
      <Checkbox isSelected={photosAfter} onChange={onPhotosAfterChange}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <span className="text-sm text-foreground">Check photos after each crawl</span>
        </Checkbox.Content>
      </Checkbox>
      <Checkbox isSelected={pushAfter} onChange={onPushAfterChange}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <span className="text-sm text-foreground">Push changes to the CRM after each crawl and photo check</span>
        </Checkbox.Content>
      </Checkbox>
      <label className="flex items-center gap-2 text-sm text-muted">
        Run at a time
        <input
          type="number"
          min={1}
          max={20}
          value={concurrency}
          onChange={(e) => onConcurrencyChange(Math.min(20, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
          className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
        />
      </label>
      <Dropdown>
        <Button variant="primary" size="sm" isDisabled={selectedCount === 0 || isStarting}>
          {isStarting ? <Spinner color="current" size="sm" className="shrink-0" /> : null}
          {selectedCount > 0 ? `Actions (${selectedCount})` : "Actions"}
          <ChevronDown className="size-4" />
        </Button>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu
            aria-label="Actions for the selected agencies"
            onAction={(key) => (key === "crawl" ? onCrawlSelected() : onFixPhotosSelected())}
          >
            <Dropdown.Item id="crawl" textValue="Crawl selected">
              <Play className="size-4" />
              Crawl {selectedCount} selected ({concurrency} at a time)
            </Dropdown.Item>
            <Dropdown.Item id="photos" textValue="Fix missing photos">
              <ImageOff className="size-4" />
              Fix missing photos for {selectedCount} selected ({concurrency} at a time)
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      </div>
    </div>
  );
}
