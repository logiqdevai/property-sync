import { useEffect, useState } from "react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { CrawlIntervalField } from "@/components/ui/crawl-interval-field";

interface AgencyCrawlIntervalPanelProps {
  crawlInterval: string;
  isPending: boolean;
  onSave: (crawlInterval: string) => void;
}

export function AgencyCrawlIntervalPanel({
  crawlInterval,
  isPending,
  onSave,
}: AgencyCrawlIntervalPanelProps) {
  const [draft, setDraft] = useState(crawlInterval);

  useEffect(() => {
    setDraft(crawlInterval);
  }, [crawlInterval]);

  const isDirty = draft.trim() !== crawlInterval;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Crawl schedule</p>
        <p className="text-xs text-muted">
          How often this agency is scraped automatically in production.
        </p>
      </div>

      <CrawlIntervalField value={draft} disabled={isPending} onChange={setDraft} />

      <div className="mt-4 flex justify-end">
        <ActionButtonWithPending
          isPending={isPending}
          isDisabled={!isDirty || isPending}
          onPress={() => onSave(draft.trim())}
        >
          Save schedule
        </ActionButtonWithPending>
      </div>
    </div>
  );
}
