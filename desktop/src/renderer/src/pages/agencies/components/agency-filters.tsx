import { Button, SearchField } from "@heroui/react";

interface AgencyFiltersProps {
  search: string;
  onSearchChange(value: string): void;
  onlyAttention: boolean;
  onOnlyAttentionChange(value: boolean): void;
}

export function AgencyFilters({ search, onSearchChange, onlyAttention, onOnlyAttentionChange }: AgencyFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 rounded-lg bg-surface-secondary p-1" role="group" aria-label="Which agencies">
        <Button
          size="sm"
          variant={onlyAttention ? "primary" : "ghost"}
          aria-pressed={onlyAttention}
          onPress={() => onOnlyAttentionChange(true)}
        >
          Need a crawl
        </Button>
        <Button
          size="sm"
          variant={!onlyAttention ? "primary" : "ghost"}
          aria-pressed={!onlyAttention}
          onPress={() => onOnlyAttentionChange(false)}
        >
          All agencies
        </Button>
      </div>
      <SearchField aria-label="Search agencies" value={search} onChange={onSearchChange} className="w-full sm:w-72">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search by name or website" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
    </div>
  );
}
