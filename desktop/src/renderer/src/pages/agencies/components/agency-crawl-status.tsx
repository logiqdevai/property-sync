import { ProgressBar, Spinner } from "@heroui/react";
import { AlertTriangle, CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { BlockStates, CrawlPhases, type CrawlCheckpointInfo, type CrawlState } from "@shared/ipc";
import { formatElapsed, formatRelative } from "@/lib/date";
import { useNow } from "@/hooks/use-now";
import { isCrawlActive } from "@/features/crawl-session/hooks/use-crawl-session";
import { crawlPercent, describeRunningCrawl } from "../utils/crawl-status.utils";

interface AgencyCrawlStatusProps {
  state: CrawlState | null;
  checkpoint: CrawlCheckpointInfo | undefined;
}

function RunningStatus({ state }: { state: CrawlState }) {
  const now = useNow(5_000);
  const percent = crawlPercent(state);
  const needsUser = state.block === BlockStates.NEEDS_USER;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-secondary px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Spinner size="sm" color={needsUser ? "warning" : "accent"} />
          {describeRunningCrawl(state)}
        </span>
        <span className="tabular-nums text-muted">Running {formatElapsed(state.started_at, now)}</span>
      </div>
      {needsUser ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-warning">
          <AlertTriangle className="size-4" />
          Your help is needed: complete the check in this agency's Chrome tab.
        </span>
      ) : state.block === BlockStates.SOLVING ? (
        <span className="text-xs text-muted">Getting past the website's robot check…</span>
      ) : null}
      {percent !== null ? (
        <ProgressBar.Root aria-label="Listings read" value={percent} minValue={0} maxValue={100} color="accent" size="sm">
          <ProgressBar.Track>
            <ProgressBar.Fill className="transition-[width] duration-500 ease-out" />
          </ProgressBar.Track>
        </ProgressBar.Root>
      ) : null}
    </div>
  );
}

/** What the card says about this agency's crawl in the app: running, finished, paused or saved. */
export function AgencyCrawlStatus({ state, checkpoint }: AgencyCrawlStatusProps) {
  if (state && isCrawlActive(state)) return <RunningStatus state={state} />;

  if (state?.phase === CrawlPhases.DONE) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="size-4" />
        {state.result
          ? `Crawl finished: ${state.result.held_for_review ?? 0} listings waiting for review`
          : "Crawl finished"}
      </span>
    );
  }
  if (state?.phase === CrawlPhases.FAILED) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-danger">
        <XCircle className="size-4" />
        {state.error ?? "The crawl stopped."}
      </span>
    );
  }
  if (checkpoint) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted">
        <PauseCircle className="size-4" />
        Paused {formatRelative(checkpoint.saved_at)}: {checkpoint.details_done} of {checkpoint.listings} listings read
      </span>
    );
  }
  return null;
}
