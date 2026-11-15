import { Button, Card, useOverlayState } from "@heroui/react";
import { History, Play, RotateCcw } from "lucide-react";
import type { CrawlCheckpointInfo } from "@shared/ipc";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Notice } from "@/components/ui/notice";
import { formatRelative } from "@/lib/date";

interface CrawlStartCardProps {
  agencyName: string;
  checkpoint: CrawlCheckpointInfo | null | undefined;
  /** Another crawl or photo check is running. */
  isBlockedByOtherTask: boolean;
  isStarting: boolean;
  onStart(resume: boolean): void;
}

export function CrawlStartCard({
  agencyName,
  checkpoint,
  isBlockedByOtherTask,
  isStarting,
  onStart,
}: CrawlStartCardProps) {
  const startOverDialog = useOverlayState();

  return (
    <Card className="gap-5 p-6">
      <Card.Header className="flex flex-col gap-1">
        <Card.Title>Update {agencyName}</Card.Title>
        <Card.Description>
          A Chrome window opens and goes through every listing on the agency's website. Leave that window open
          until the crawl is finished; you can keep using the computer meanwhile. Nothing is sent to the CRM: new
          and changed listings wait for your review in Property Sync.
        </Card.Description>
      </Card.Header>

      {isBlockedByOtherTask ? (
        <Notice status="default" title="Another task is running" description="Wait for it to finish first." />
      ) : null}

      {checkpoint ? (
        <Notice
          status="accent"
          title="An unfinished crawl was saved"
          description={`Saved ${formatRelative(checkpoint.saved_at)}: ${checkpoint.listings} listings found, ${checkpoint.details_done} read. Continue where it stopped, or start over.`}
          actions={
            <>
              <ActionButtonWithPending
                variant="primary"
                size="sm"
                isPending={isStarting}
                isDisabled={isStarting || isBlockedByOtherTask}
                idleLeading={<History className="size-4" />}
                onPress={() => onStart(true)}
              >
                Continue
              </ActionButtonWithPending>
              <Button
                variant="secondary"
                size="sm"
                isDisabled={isStarting || isBlockedByOtherTask}
                onPress={startOverDialog.open}
              >
                <RotateCcw className="size-4" />
                Start over
              </Button>
            </>
          }
        />
      ) : (
        <div>
          <ActionButtonWithPending
            variant="primary"
            isPending={isStarting}
            isDisabled={isStarting || isBlockedByOtherTask}
            idleLeading={<Play className="size-4" />}
            onPress={() => onStart(false)}
          >
            Start crawl
          </ActionButtonWithPending>
        </div>
      )}

      <ConfirmationDialog
        state={startOverDialog}
        title="Start over?"
        description="The saved progress is thrown away and the crawl starts again from the first page."
        confirmLabel="Start over"
        onConfirm={() => onStart(false)}
      />
    </Card>
  );
}
