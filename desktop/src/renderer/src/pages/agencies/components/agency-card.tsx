import { useNavigate } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import { ImageOff, Play } from "lucide-react";
import { Routes } from "@/routes/routes";
import { formatRelative } from "@/lib/date";
import type { CrawlableAgency, CrawlRunSummary } from "@/features/desktop-crawl/interfaces/desktop-crawl.interfaces";
import { AgencyAttentionChip } from "./agency-attention-chip";

interface AgencyCardProps {
  agency: CrawlableAgency;
  /** True while any crawl or photo check is running (only one at a time). */
  isBusy: boolean;
}

function describeRun(run: CrawlRunSummary | null): string {
  if (!run) return "never";
  const when = formatRelative(run.created_at);
  if (run.status === "FAILED") return `${when}, failed`;
  return `${when}, ${run.total_found} listings`;
}

export function AgencyCard({ agency, isBusy }: AgencyCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Card.Title className="truncate text-base">{agency.agency_name}</Card.Title>
          <Card.Description className="truncate text-xs">{agency.agency_url}</Card.Description>
        </div>
        <AgencyAttentionChip reason={agency.attention} />
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

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={isBusy || !agency.has_config}
          onPress={() => navigate(Routes.crawl(agency.scraper_id))}
        >
          <Play className="size-4" />
          Crawl now
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={isBusy}
          onPress={() => navigate(Routes.photos(agency.agency_id))}
        >
          <ImageOff className="size-4" />
          Fix missing photos
        </Button>
        {!agency.has_config ? (
          <span className="self-center text-xs text-muted">Not set up yet. Ask a developer.</span>
        ) : null}
      </div>
    </Card>
  );
}
