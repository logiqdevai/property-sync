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
  /** Not tied to the ticked agencies: every agency in the list. */
  onCrawlAll(): void;
  onFixPhotosAll(): void;
  /** How many agencies "all" covers right now (the list on screen). */
  crawlAllCount: number;
  photosAllCount: number;
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
  onCrawlAll,
  onFixPhotosAll,
  crawlAllCount,
  photosAllCount,
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
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <LabeledCheckbox
            label={
              selectedCount > 0 ? `${selectedCount} selected` : "Select all"
            }
            ariaLabel={allSelected ? "Deselect all" : "Select all"}
            isSelected={allSelected}
            isIndeterminate={selectedCount > 0 && !allSelected}
            isDisabled={selectableCount === 0}
            onChange={(isSelected) =>
              isSelected ? onSelectAll() : onDeselectAll()
            }
          />
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
          <label className="flex items-center gap-2 text-sm text-muted">
            Run at a time
            <input
              type="number"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) =>
                onConcurrencyChange(
                  Math.min(
                    20,
                    Math.max(1, Math.floor(Number(e.target.value)) || 1),
                  ),
                )
              }
              className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
            />
          </label>
          <Dropdown>
            <Button
              variant="primary"
              size="sm"
              isDisabled={isStarting}
            >
              {isStarting ? (
                <Spinner color="current" size="sm" className="shrink-0" />
              ) : null}
              Actions
              <ChevronDown className="size-4" />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label="Actions for the selected agencies"
                disabledKeys={[
                  ...(selectedCount === 0 ? ["crawl", "photos"] : []),
                  ...(crawlAllCount === 0 ? ["crawl-all"] : []),
                  ...(photosAllCount === 0 ? ["photos-all"] : []),
                ]}
                onAction={(key) => {
                  if (key === "crawl") onCrawlSelected();
                  else if (key === "photos") onFixPhotosSelected();
                  else if (key === "crawl-all") onCrawlAll();
                  else if (key === "photos-all") onFixPhotosAll();
                }}
              >
                <Dropdown.Item id="crawl" textValue="Crawl selected">
                  <Play className="size-4" />
                  Crawl {selectedCount} selected ({concurrency} at a time)
                </Dropdown.Item>
                <Dropdown.Item id="photos" textValue="Fix missing photos">
                  <ImageOff className="size-4" />
                  Fix missing photos for {selectedCount} selected ({concurrency}{" "}
                  at a time)
                </Dropdown.Item>
                <Dropdown.Item id="crawl-all" textValue="Crawl all agencies">
                  <Play className="size-4" />
                  Crawl all {crawlAllCount} agencies ({concurrency} at a time)
                </Dropdown.Item>
                <Dropdown.Item id="photos-all" textValue="Fix photos for all agencies">
                  <ImageOff className="size-4" />
                  Fix missing photos for all {photosAllCount} agencies ({concurrency} at a time)
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3">
        <LabeledCheckbox
          label="Check photos after each crawl"
          isSelected={photosAfter}
          onChange={onPhotosAfterChange}
        />
        <LabeledCheckbox
          label="Push changes to the CRM after each crawl and photo check"
          isSelected={pushAfter}
          onChange={onPushAfterChange}
        />
      </div>
    </div>
  );
}

function LabeledCheckbox({
  label,
  ariaLabel,
  isSelected,
  isIndeterminate,
  isDisabled,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  isSelected: boolean;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  onChange(isSelected: boolean): void;
}) {
  return (
    <Checkbox
      aria-label={ariaLabel ?? label}
      isSelected={isSelected}
      isIndeterminate={isIndeterminate}
      isDisabled={isDisabled}
      onChange={onChange}
      className="flex items-center gap-2"
    >
      <Checkbox.Control className="border-2 border-foreground/45 [[data-selected=true]_&]:border-accent [[data-indeterminate=true]_&]:border-accent">
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>
        <span className="text-sm text-foreground">{label}</span>
      </Checkbox.Content>
    </Checkbox>
  );
}
