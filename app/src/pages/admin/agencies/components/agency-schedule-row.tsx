import { useState } from "react";
import { Button } from "@heroui/react";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { CrawlIntervalField } from "@/components/ui/crawl-interval-field";
import { formatCrawlIntervalLabel } from "@/config/constants/dropdowns/agencies/crawl-interval-builder.options";
import { useUpdateAgency } from "@/features/agencies/hooks/use-agencies";
import type { AgencyScheduleOverviewItem } from "@/features/agencies/interfaces/agencies.interfaces";

export function AgencyScheduleRow({ agency }: { agency: AgencyScheduleOverviewItem }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(agency.crawl_interval);
  const updateAgency = useUpdateAgency();

  const startEditing = () => {
    setDraft(agency.crawl_interval);
    setIsEditing(true);
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{agency.name}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted truncate">{formatCrawlIntervalLabel(agency.crawl_interval)}</p>
            <span className="font-mono text-[10px] text-muted">{agency.crawl_interval}</span>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-0.5 w-24">
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {agency.user_properties_count}
          </span>
          <span className="text-[10px] text-muted">tracked props</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 min-w-8 px-2"
          aria-label={isEditing ? `Cancel editing ${agency.name} schedule` : `Edit ${agency.name} schedule`}
          onPress={() => (isEditing ? setIsEditing(false) : startEditing())}
        >
          {isEditing ? <X className="size-4" /> : <Pencil className="size-4" />}
        </Button>
      </div>

      {isEditing && (
        <div className={cn("px-3 pb-3 flex flex-col gap-3")}>
          <CrawlIntervalField
            value={draft}
            disabled={updateAgency.isPending}
            onChange={setDraft}
          />
          <div className="flex justify-end">
            <ActionButtonWithPending
              size="sm"
              isPending={updateAgency.isPending}
              isDisabled={draft.trim() === agency.crawl_interval || updateAgency.isPending}
              onPress={() =>
                updateAgency.mutate(
                  { id: agency.id, payload: { crawl_interval: draft.trim() } },
                  { onSuccess: () => setIsEditing(false) },
                )
              }
            >
              Save schedule
            </ActionButtonWithPending>
          </div>
        </div>
      )}
    </div>
  );
}
