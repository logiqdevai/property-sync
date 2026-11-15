import { useNavigate } from "react-router-dom";
import { Button, Card, Checkbox } from "@heroui/react";
import { ChevronRight, History, ImageOff, Play, Square } from "lucide-react";
import { CrawlPhases, type CrawlCheckpointInfo, type CrawlState } from "@shared/ipc";
import { Routes } from "@/routes/routes";
import { formatRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import { isCrawlActive } from "@/features/crawl-session/hooks/use-crawl-session";
import type { CrawlableAgency, CrawlRunSummary } from "@/features/desktop-crawl/interfaces/desktop-crawl.interfaces";
import { AgencyAttentionChip } from "./agency-attention-chip";
import { AgencyCrawlStatus } from "./agency-crawl-status";
import { OpenAgencyInWebAppButton } from "@/components/ui/open-agency-in-web-app-button";

interface AgencyCardProps {
  agency: CrawlableAgency;
  /** This agency's crawl in the app, if any (running, finished, stopped). */
  crawl: CrawlState | null;
  /** Saved, unfinished crawl on this computer. */
  checkpoint: CrawlCheckpointInfo | undefined;
  isSelected: boolean;
  onSelectedChange(isSelected: boolean): void;
  onStart(resume: boolean): void;
  onStop(): void;
  isStopping: boolean;
}

function describeRun(run: CrawlRunSummary | null): string {
  if (!run) return "never";
  const when = formatRelative(run.created_at);
  if (run.status === "FAILED") return `${when}, failed`;
  return `${when}, ${run.total_found} listings`;
}

export function AgencyCard({
  agency,
  crawl,
  checkpoint,
  isSelected,
  onSelectedChange,
  onStart,
  onStop,
  isStopping,
}: AgencyCardProps) {
  const navigate = useNavigate();
  const running = isCrawlActive(crawl);
  const canStop = !!crawl && running && (crawl.phase === CrawlPhases.PREPARING || crawl.phase === CrawlPhases.LISTING || crawl.phase === CrawlPhases.DETAILS);
  const selectable = agency.has_config && !running;
  const canResume = !running && !!checkpoint;

  return (
    <Card className={cn("gap-4 p-5", isSelected && "ring-2 ring-accent")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox
            aria-label={`Select ${agency.agency_name}`}
            isSelected={isSelected && selectable}
            isDisabled={!selectable}
            onChange={onSelectedChange}
            className="mt-0.5"
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <div className="flex min-w-0 flex-col gap-1">
            <Card.Title className="truncate text-base">{agency.agency_name}</Card.Title>
            <Card.Description className="truncate text-xs">{agency.agency_url}</Card.Description>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <AgencyAttentionChip reason={agency.attention} />
          <OpenAgencyInWebAppButton agencyId={agency.agency_id} agencyName={agency.agency_name} />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted">Automatic update:</dt>
          <dd className="text-foreground">{describeRun(agency.last_server_crawl)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">From this app:</dt>
          <dd className="text-foreground">{describeRun(agency.last_desktop_crawl)}</dd>
        </div>
      </dl>

      <AgencyCrawlStatus state={crawl} checkpoint={checkpoint} />

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          canStop ? (
            <Button variant="secondary" size="sm" isDisabled={isStopping} onPress={onStop}>
              <Square className="size-4" />
              Stop
            </Button>
          ) : null
        ) : canResume ? (
          <Button variant="primary" size="sm" onPress={() => onStart(true)}>
            <History className="size-4" />
            Continue
          </Button>
        ) : (
          <Button variant="primary" size="sm" isDisabled={!agency.has_config} onPress={() => onStart(false)}>
            <Play className="size-4" />
            {crawl?.phase === CrawlPhases.DONE ? "Crawl again" : "Crawl now"}
          </Button>
        )}
        <Button variant="secondary" size="sm" onPress={() => navigate(Routes.photos(agency.agency_id))}>
          <ImageOff className="size-4" />
          Fix missing photos
        </Button>
        {crawl || checkpoint ? (
          <Button variant="ghost" size="sm" onPress={() => navigate(Routes.crawl(agency.scraper_id))}>
            Details
            <ChevronRight className="size-4" />
          </Button>
        ) : null}
        {!agency.has_config ? (
          <span className="text-xs text-muted">Not set up yet. Ask a developer.</span>
        ) : null}
      </div>
    </Card>
  );
}
