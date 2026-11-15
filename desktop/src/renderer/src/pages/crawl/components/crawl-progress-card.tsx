import { Button, Card, useOverlayState } from "@heroui/react";
import { Square } from "lucide-react";
import { CrawlPhases, type CrawlState } from "@shared/ipc";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { NeedsHelpNotice } from "@/components/ui/needs-help-notice";
import { StepList } from "@/components/ui/step-list";
import { TaskProgress } from "@/components/ui/task-progress";
import { StatTile } from "@/components/ui/stat-tile";
import { formatElapsed } from "@/lib/date";
import { useNow } from "@/hooks/use-now";
import { buildCrawlSteps, canStopCrawl } from "../utils/crawl-steps.utils";

interface CrawlProgressCardProps {
  state: CrawlState;
  isStopping: boolean;
  onStop(): void;
}

export function CrawlProgressCard({ state, isStopping, onStop }: CrawlProgressCardProps) {
  const stopDialog = useOverlayState();
  const now = useNow(10_000);

  return (
    <Card className="gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Card.Header className="flex flex-col gap-1 p-0">
          <Card.Title>Crawling {state.agency_name}</Card.Title>
          <Card.Description>
            Running for {formatElapsed(state.started_at, now)}
            {state.resumed ? " (continued from a saved crawl)" : ""}. Leave its Chrome tab open.
          </Card.Description>
        </Card.Header>
        {canStopCrawl(state.phase) ? (
          <Button variant="secondary" size="sm" isDisabled={isStopping} onPress={stopDialog.open}>
            <Square className="size-4" />
            Stop
          </Button>
        ) : null}
      </div>

      <NeedsHelpNotice block={state.block} />

      {state.phase === CrawlPhases.DETAILS ? (
        <TaskProgress label="Reading listings" value={state.details_done} max={state.details_total} />
      ) : state.phase === CrawlPhases.LISTING ? (
        <TaskProgress label="Finding listings" value={0} max={1} isIndeterminate />
      ) : state.phase === CrawlPhases.UPLOADING || state.phase === CrawlPhases.SAVING ? (
        <TaskProgress label="Property Sync is processing the listings" value={0} max={1} isIndeterminate />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Listings found" value={state.listings_found} />
        <StatTile label="Read" value={state.details_done} tone="accent" />
        <StatTile
          label="Could not read"
          value={state.details_failed}
          tone={state.details_failed > 0 ? "warning" : "default"}
          hint="Kept as they were"
        />
        <StatTile label="Checks passed" value={state.captcha_solves} hint="Robot checks solved" />
      </div>

      <StepList steps={buildCrawlSteps(state)} />

      <ConfirmationDialog
        state={stopDialog}
        title="Stop the crawl?"
        description="What has been read so far is saved on this computer. You can continue later from where it stopped."
        confirmLabel="Stop"
        cancelLabel="Keep going"
        isPending={isStopping}
        onConfirm={onStop}
      />
    </Card>
  );
}
