import { Button, Card } from "@heroui/react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { PhotoPhases, type PhotoState } from "@shared/ipc";
import { Notice } from "@/components/ui/notice";
import { StatTile } from "@/components/ui/stat-tile";

interface PhotoResultCardProps {
  state: PhotoState;
  onAgain(): void;
  onBack(): void;
}

function Summary({ state }: { state: PhotoState }) {
  if (state.phase === PhotoPhases.FAILED) {
    return <Notice status="danger" title="Checking photos stopped" description={state.error ?? "Something went wrong."} />;
  }
  if (state.phase === PhotoPhases.STOPPED) {
    return <Notice status="default" title="Stopped" description="Press Check again to run it from the start." />;
  }
  if (state.missing === 0) {
    return (
      <Notice
        status="success"
        title="All listings have photos"
        description={`All ${state.total} listings in the CRM have photos. Nothing to fix.`}
      />
    );
  }
  if (state.still_missing.length === 0) {
    return <Notice status="success" title={`Photos added to ${state.fixed} listings`} description="Every listing now has photos." />;
  }
  return (
    <Notice
      status="warning"
      title={`${state.still_missing.length} listings still have no photos`}
      description="Their photos could not be copied from the website (often the website has none). Tell a developer if they should have photos."
    />
  );
}

export function PhotoResultCard({ state, onAgain, onBack }: PhotoResultCardProps) {
  return (
    <Card className="gap-6 p-6">
      <Summary state={state} />
      {state.check_errors > 0 ? (
        <Notice
          status="warning"
          title={`${state.check_errors} listings could not be read from the CRM`}
          description="Press Check again in a few minutes."
        />
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="In the CRM" value={state.total} />
        <StatTile label="Without photos" value={state.missing} tone={state.missing ? "warning" : "default"} />
        <StatTile label="Fixed" value={state.fixed} tone="success" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onPress={onAgain}>
          <RotateCcw className="size-4" />
          Check again
        </Button>
        <Button variant="ghost" size="sm" onPress={onBack}>
          <ArrowLeft className="size-4" />
          Back to agencies
        </Button>
      </div>
    </Card>
  );
}
