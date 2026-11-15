import { Button, Card } from "@heroui/react";
import { Square } from "lucide-react";
import { PhotoPhases, type PhotoState } from "@shared/ipc";
import { NeedsHelpNotice } from "@/components/ui/needs-help-notice";
import { StatTile } from "@/components/ui/stat-tile";
import { TaskProgress } from "@/components/ui/task-progress";

interface PhotoProgressCardProps {
  state: PhotoState;
  isStopping: boolean;
  onStop(): void;
}

export function PhotoProgressCard({ state, isStopping, onStop }: PhotoProgressCardProps) {
  const fixing = state.phase === PhotoPhases.FIXING;
  return (
    <Card className="gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Card.Header className="flex flex-col gap-1 p-0">
          <Card.Title>{fixing ? "Adding the missing photos" : "Checking the listings in the CRM"}</Card.Title>
          <Card.Description>
            {fixing ? "Leave the Chrome window open until this is finished." : "This reads every listing; it takes a few minutes."}
          </Card.Description>
        </Card.Header>
        <Button variant="secondary" size="sm" isDisabled={isStopping} onPress={onStop}>
          <Square className="size-4" />
          Stop
        </Button>
      </div>

      <NeedsHelpNotice block={state.block} />

      {fixing ? (
        <TaskProgress
          label="Listings fixed"
          value={state.fixed + state.still_missing.length}
          max={state.missing}
        />
      ) : (
        <TaskProgress label="Listings checked" value={state.checked} max={state.total} />
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="In the CRM" value={state.total} />
        <StatTile label="Without photos" value={state.missing} tone={state.missing ? "warning" : "default"} />
        <StatTile label="Fixed" value={state.fixed} tone="success" />
      </div>
    </Card>
  );
}
