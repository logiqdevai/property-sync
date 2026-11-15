import { Button, Card } from "@heroui/react";
import { ArrowLeft, ExternalLink, History } from "lucide-react";
import { CrawlPhases, type CrawlState } from "@shared/ipc";
import { Notice } from "@/components/ui/notice";
import { StatTile } from "@/components/ui/stat-tile";
import { StepList } from "@/components/ui/step-list";
import { buildCrawlSteps } from "../utils/crawl-steps.utils";

interface CrawlResultCardProps {
  state: CrawlState;
  onOpenReview(): void;
  onResume(): void;
  onBack(): void;
}

export function CrawlResultCard({ state, onOpenReview, onResume, onBack }: CrawlResultCardProps) {
  const result = state.result;

  return (
    <Card className="gap-6 p-6">
      <Card.Header className="flex flex-col gap-1 p-0">
        <Card.Title>{state.agency_name}</Card.Title>
      </Card.Header>

      {state.phase === CrawlPhases.DONE && result ? (
        <>
          <Notice
            status="success"
            title={`Done. ${result.held_for_review ?? 0} listings are waiting for your review.`}
            description="Open the review page in Property Sync, check them, and push the ones you want to the CRM."
            actions={
              <Button variant="primary" size="sm" onPress={onOpenReview}>
                <ExternalLink className="size-4" />
                Open review page
              </Button>
            }
          />
          {result.held_without_photos ? (
            <Notice
              status="warning"
              title={`${result.held_without_photos} of them have no photos on the website`}
              description="You may want to leave those out when you push."
            />
          ) : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="On the website" value={result.total_found} />
            <StatTile label="New" value={result.total_new_listings} tone="success" />
            <StatTile label="Checked again" value={result.total_refreshed_listings} />
            <StatTile label="No longer listed" value={result.total_removed} tone={result.total_removed ? "warning" : "default"} />
          </div>
          <p className="text-sm text-muted">
            After you push the listings, come back and press <strong>Fix missing photos</strong> for this agency.
          </p>
        </>
      ) : null}

      {state.phase === CrawlPhases.DONE && !result && state.error ? (
        <Notice status="accent" title="Almost done" description={state.error} />
      ) : null}

      {state.phase === CrawlPhases.STOPPED ? (
        <Notice
          status="default"
          title="The crawl is paused"
          description={`${state.listings_found} listings found and ${state.details_done} read so far. Everything is saved; continue whenever you like.`}
          actions={
            <Button variant="primary" size="sm" onPress={onResume}>
              <History className="size-4" />
              Continue
            </Button>
          }
        />
      ) : null}

      {state.phase === CrawlPhases.FAILED ? (
        <Notice
          status="danger"
          title="The crawl stopped"
          description={state.error ?? "Something went wrong."}
          actions={
            state.result ? null : (
              <Button variant="primary" size="sm" onPress={onResume}>
                <History className="size-4" />
                Continue
              </Button>
            )
          }
        />
      ) : null}

      {state.phase !== CrawlPhases.DONE ? <StepList steps={buildCrawlSteps(state)} /> : null}

      <div>
        <Button variant="ghost" size="sm" onPress={onBack}>
          <ArrowLeft className="size-4" />
          Back to agencies
        </Button>
      </div>
    </Card>
  );
}
