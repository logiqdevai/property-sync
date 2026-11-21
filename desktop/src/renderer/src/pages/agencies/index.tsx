import { useMemo, useState, type FC } from "react";
import { Button, Card, Skeleton, useOverlayState } from "@heroui/react";
import { CheckCircle2, SearchX } from "lucide-react";
import { CrawlPhases, type StartCrawlRequest } from "@shared/ipc";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyStatePanel } from "@/components/ui/empty-state-panel";
import { Notice } from "@/components/ui/notice";
import { BrowserMissingNotice } from "@/components/ui/browser-missing-notice";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useStartPhotoRepairs, usePhotoRepairs, isPhotoRepairActive } from "@/features/photo-repair/hooks/use-photo-repair";
import { useGetCrawlableAgencies } from "@/features/desktop-crawl/hooks/use-desktop-crawl";
import type { CrawlableAgency } from "@/features/desktop-crawl/interfaces/desktop-crawl.interfaces";
import {
  isCrawlActive,
  RECOMMENDED_PARALLEL_CRAWLS,
  useActiveCrawls,
  useCrawlSessions,
  useGetCrawlCheckpoints,
  useStartCrawl,
  useStartCrawls,
  useStopCrawl,
} from "@/features/crawl-session/hooks/use-crawl-session";
import { AgencyCard } from "./components/agency-card";
import { AgencyFilters } from "./components/agency-filters";
import { AgencyBulkToolbar } from "./components/agency-bulk-toolbar";
import { useAgencyFilters } from "./hooks/use-agency-filters";
import { useAgencySelection } from "./hooks/use-agency-selection";

const PHOTOS_AFTER_KEY = "photos-after-crawl";

const readPhotosAfter = (): boolean => {
  try {
    return localStorage.getItem(PHOTOS_AFTER_KEY) !== "off";
  } catch {
    return true;
  }
};

const PUSH_AFTER_KEY = "push-after-crawl";

const readPushAfter = (): boolean => {
  try {
    return localStorage.getItem(PUSH_AFTER_KEY) !== "off";
  } catch {
    return true;
  }
};

const toRequest = (
  agency: CrawlableAgency,
  resume: boolean,
  photosAfter: boolean,
  pushAfter: boolean,
): StartCrawlRequest => ({
  scraper_id: agency.scraper_id,
  agency_id: agency.agency_id,
  agency_name: agency.agency_name,
  resume,
  photos_after: photosAfter,
  push_after: pushAfter,
});

const AgenciesPage: FC = () => {
  const filters = useAgencyFilters();
  const { data: agencies, isPending, isError, error, refetch } = useGetCrawlableAgencies(filters.query);
  const crawls = useCrawlSessions();
  const { active } = useActiveCrawls();
  const { data: checkpoints = {} } = useGetCrawlCheckpoints();
  const selection = useAgencySelection();
  const manyDialog = useOverlayState();
  const [photosAfter, setPhotosAfterState] = useState(readPhotosAfter);
  const setPhotosAfter = (value: boolean) => {
    setPhotosAfterState(value);
    try {
      localStorage.setItem(PHOTOS_AFTER_KEY, value ? "on" : "off");
    } catch {
      // not remembered; still applies now
    }
  };
  const [pushAfter, setPushAfterState] = useState(readPushAfter);
  const setPushAfter = (value: boolean) => {
    setPushAfterState(value);
    try {
      localStorage.setItem(PUSH_AFTER_KEY, value ? "on" : "off");
    } catch {
      // not remembered; still applies now
    }
  };
  const [concurrency, setConcurrency] = useState(RECOMMENDED_PARALLEL_CRAWLS);
  const photoStates = usePhotoRepairs();
  const { mutate: startPhotos, isPending: isStartingPhotos } = useStartPhotoRepairs();
  const { mutate: startCrawl } = useStartCrawl();
  const { mutate: startCrawls, isPending: isStartingMany } = useStartCrawls();
  const { mutate: stopCrawl, isPending: isStopping, variables: stoppingId } = useStopCrawl();

  const selectable = useMemo(
    () => (agencies ?? []).filter((a) => a.has_config && !isCrawlActive(crawls[a.scraper_id])),
    [agencies, crawls],
  );
  const selected = selectable.filter((a) => selection.selected.has(a.scraper_id));
  // Including the ones already running: that's what will load the computer. Queued ones wait.
  const runningNow = active.filter((s) => s.phase !== CrawlPhases.QUEUED).length;
  const totalAfterStart = Math.min(selected.length, concurrency) + runningNow;

  const startSelected = () => {
    // Each continues its saved crawl if it has one, otherwise starts fresh.
    startCrawls(
      { requests: selected.map((agency) => toRequest(agency, true, photosAfter, pushAfter)), concurrency },
      { onSuccess: () => selection.clear() },
    );
  };

  const fixPhotosSelected = () => {
    const targets = selected.filter((a) => !isPhotoRepairActive(photoStates[a.agency_id]));
    if (targets.length === 0) return;
    startPhotos(
      { requests: targets.map((a) => ({ agency_id: a.agency_id, agency_name: a.agency_name })), concurrency },
      { onSuccess: () => selection.clear() },
    );
  };

  const onCrawlSelected = () => {
    if (totalAfterStart > RECOMMENDED_PARALLEL_CRAWLS) manyDialog.open();
    else startSelected();
  };

  return (
    <>
      <PageHeader
        title="Agencies"
        description="Agencies whose websites block Property Sync's automatic updates can be updated from here, through Chrome on this computer. Several can run at the same time, each in its own Chrome tab."
      />

      <BrowserMissingNotice />

      <AgencyFilters
        search={filters.search}
        onSearchChange={filters.setSearch}
        onlyAttention={filters.onlyAttention}
        onOnlyAttentionChange={filters.setOnlyAttention}
      />

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="gap-3 p-5">
              <Skeleton className="h-4 w-48 rounded-md" />
              <Skeleton className="h-3 w-64 rounded-md" />
              <Skeleton className="h-8 w-56 rounded-md" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Notice
          status="danger"
          title="The agencies could not be loaded"
          description={error.message}
          actions={
            <Button size="sm" variant="secondary" onPress={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : agencies.length === 0 ? (
        filters.query.only_attention ? (
          <EmptyStatePanel
            icon={CheckCircle2}
            title="Nothing needs a crawl right now"
            description="Every agency is updating automatically. Switch to All agencies to crawl one anyway."
          />
        ) : (
          <EmptyStatePanel icon={SearchX} title="No agencies found" description="Try a different search." />
        )
      ) : (
        <>
          <AgencyBulkToolbar
            selectableCount={selectable.length}
            selectedCount={selected.length}
            onSelectAll={() => selection.selectAll(selectable.map((a) => a.scraper_id))}
            onDeselectAll={selection.clear}
            onCrawlSelected={onCrawlSelected}
            onFixPhotosSelected={fixPhotosSelected}
            isStarting={isStartingMany || isStartingPhotos}
            concurrency={concurrency}
            onConcurrencyChange={setConcurrency}
            photosAfter={photosAfter}
            onPhotosAfterChange={setPhotosAfter}
            pushAfter={pushAfter}
            onPushAfterChange={setPushAfter}
          />
          {totalAfterStart > RECOMMENDED_PARALLEL_CRAWLS ? (
            <Notice
              status="warning"
              title={`${totalAfterStart} crawls at the same time may slow this computer down`}
              description={`Each crawl opens its own Chrome tab. Running more than ${RECOMMENDED_PARALLEL_CRAWLS} at once can make this computer slow, especially with other programs open, and more websites may ask you to prove you're a person at the same time.`}
            />
          ) : null}
          <div className="flex flex-col gap-3">
            {agencies.map((agency) => (
              <AgencyCard
                key={agency.scraper_id}
                agency={agency}
                crawl={crawls[agency.scraper_id] ?? null}
                checkpoint={checkpoints[agency.scraper_id]}
                isSelected={selection.selected.has(agency.scraper_id)}
                onSelectedChange={(isSelected) => selection.toggle(agency.scraper_id, isSelected)}
                onStart={(resume) => startCrawl(toRequest(agency, resume, photosAfter, pushAfter))}
                onStop={() => stopCrawl(agency.scraper_id)}
                isStopping={isStopping && stoppingId === agency.scraper_id}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmationDialog
        state={manyDialog}
        title={`Run ${totalAfterStart} crawls at the same time?`}
        description={
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Each crawl opens its own Chrome tab. Running more than {RECOMMENDED_PARALLEL_CRAWLS} at once can make
              this computer slow, especially with other programs open, and more websites may ask you to prove
              you're a person at the same time.
            </p>
            {active.length > 0 ? (
              <p className="text-muted">
                {runningNow} {runningNow === 1 ? "is" : "are"} already running; this adds {Math.min(selected.length, concurrency)}.
              </p>
            ) : null}
            <p>You can stop any of them at any time; what was read so far is kept.</p>
          </div>
        }
        confirmLabel={`Start ${selected.length} crawl${selected.length === 1 ? "" : "s"}`}
        cancelLabel="Go back"
        confirmVariant="primary"
        onConfirm={startSelected}
      />
    </>
  );
};

export default AgenciesPage;
