import { Skeleton } from "@heroui/react";
import { Download, MonitorDown } from "lucide-react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { formatBytes } from "@/lib/bytes";
import { formatDate } from "@/lib/date";
import {
  useDownloadDesktopCrawler,
  useGetLatestDesktopCrawler,
} from "@/features/desktop-crawler/hooks/use-desktop-crawler";

/** Download of the Windows desktop crawler app, for agencies whose sites block the server. */
export function DesktopCrawlerDownloadPanel() {
  const { data: release, isPending, isError } = useGetLatestDesktopCrawler();
  const download = useDownloadDesktopCrawler();

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <MonitorDown className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Desktop crawler app</h2>
          <p className="mt-1 text-sm text-muted">
            Windows app that crawls agencies whose websites block the server, through Chrome on
            the user's own computer.
          </p>
          <div className="mt-2 text-xs text-muted">
            {isPending ? (
              <Skeleton className="h-3 w-48 rounded-md" />
            ) : isError ? (
              "Could not check the latest version."
            ) : release ? (
              `Version ${release.version} · ${formatBytes(release.size_bytes)} · published ${formatDate(release.published_at)}`
            ) : (
              "No version has been published yet."
            )}
          </div>
        </div>
      </div>
      <ActionButtonWithPending
        variant="primary"
        className="shrink-0"
        isPending={download.isPending}
        isDisabled={download.isPending || isPending || !release}
        idleLeading={<Download className="size-4" />}
        onPress={() => download.mutate()}
      >
        Download for Windows
      </ActionButtonWithPending>
    </section>
  );
}
