import { Button, Spinner } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { UpdateStatuses } from "@shared/ipc";
import { useAppUpdate, useInstallAppUpdate } from "@/features/app-update/hooks/use-app-update";
import { useActiveCrawls } from "@/features/crawl-session/hooks/use-crawl-session";
import { isPhotoRepairActive, usePhotoRepair } from "@/features/photo-repair/hooks/use-photo-repair";

/** Shows a new version downloading, then offers to restart into it (never mid-crawl). */
export function UpdateBanner() {
  const update = useAppUpdate();
  const { active } = useActiveCrawls();
  const photos = usePhotoRepair();
  const { mutate: install, isPending } = useInstallAppUpdate();
  const busy = active.length > 0 || isPhotoRepairActive(photos);

  if (update.status === UpdateStatuses.DOWNLOADING) {
    return (
      <div className="flex items-center justify-center gap-2 bg-surface-secondary px-4 py-1.5 text-xs text-muted">
        <Spinner size="sm" color="current" />
        Downloading version {update.new_version}… {update.percent}%
      </div>
    );
  }

  if (update.status !== UpdateStatuses.READY) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-accent-soft px-4 py-2 text-sm text-foreground">
      <span>
        Version <strong>{update.new_version}</strong> is ready.
        {busy ? " It installs when the running crawls are finished and you restart." : " Restart to update."}
      </span>
      <Button size="sm" variant="primary" isDisabled={busy || isPending} onPress={() => install()}>
        <RefreshCw className="size-4" />
        Restart now
      </Button>
    </div>
  );
}
