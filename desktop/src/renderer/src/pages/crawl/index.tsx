import type { FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Skeleton } from "@heroui/react";
import { CrawlPhases } from "@shared/ipc";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/ui/back-link";
import { Notice } from "@/components/ui/notice";
import { TechnicalDetails } from "@/components/ui/technical-details";
import { BrowserMissingNotice } from "@/components/ui/browser-missing-notice";
import { environments } from "@/config/environments";
import { WebAppRoutes } from "@/config/api/routes";
import { Routes } from "@/routes/routes";
import { useGetCrawlableAgency } from "@/features/desktop-crawl/hooks/use-desktop-crawl";
import {
  isCrawlActive,
  useCrawlSession,
  useDismissCrawl,
  useGetCrawlCheckpoint,
  useStartCrawl,
  useStopCrawl,
} from "@/features/crawl-session/hooks/use-crawl-session";
import { isPhotoRepairActive, usePhotoRepair } from "@/features/photo-repair/hooks/use-photo-repair";
import { useOpenExternal } from "@/features/desktop-app/hooks/use-desktop-app";
import { CrawlStartCard } from "./components/crawl-start-card";
import { CrawlProgressCard } from "./components/crawl-progress-card";
import { CrawlResultCard } from "./components/crawl-result-card";

const CrawlPage: FC = () => {
  const { scraperId = "" } = useParams();
  const navigate = useNavigate();
  const { data: agency, isPending: agencyPending } = useGetCrawlableAgency({ scraperId });
  const { data: checkpoint } = useGetCrawlCheckpoint(scraperId);
  const crawl = useCrawlSession();
  const photos = usePhotoRepair();
  const { mutate: startCrawl, isPending: isStarting } = useStartCrawl();
  const { mutate: stopCrawl, isPending: isStopping } = useStopCrawl();
  const { mutate: dismissCrawl } = useDismissCrawl();
  const { mutate: openExternal } = useOpenExternal();

  const isThisCrawl = crawl.scraper_id === scraperId && crawl.phase !== CrawlPhases.IDLE;
  const otherTaskRunning =
    (isCrawlActive(crawl) && crawl.scraper_id !== scraperId) || isPhotoRepairActive(photos);
  const agencyName = agency?.agency_name ?? crawl.agency_name ?? "this agency";

  const start = (resume: boolean) => {
    if (!agency) return;
    startCrawl({
      scraper_id: agency.scraper_id,
      agency_id: agency.agency_id,
      agency_name: agency.agency_name,
      resume,
    });
  };

  const back = () => {
    dismissCrawl();
    navigate(Routes.agencies);
  };

  if (agencyPending && !isThisCrawl) {
    return (
      <Card className="gap-3 p-6">
        <Skeleton className="h-5 w-56 rounded-md" />
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </Card>
    );
  }

  if (!agency && !isThisCrawl) {
    return (
      <Notice
        status="danger"
        title="Agency not found"
        description="It may have been removed or switched off in Property Sync."
        actions={
          <Button size="sm" variant="secondary" onPress={() => navigate(Routes.agencies)}>
            Back to agencies
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={<BackLink to={Routes.agencies} label="Agencies" />}
        title={agencyName}
        description={agency?.agency_url}
      />
      <BrowserMissingNotice />

      {!isThisCrawl ? (
        <CrawlStartCard
          agencyName={agencyName}
          checkpoint={checkpoint}
          isBlockedByOtherTask={otherTaskRunning}
          isStarting={isStarting}
          onStart={start}
        />
      ) : isCrawlActive(crawl) ? (
        <CrawlProgressCard state={crawl} isStopping={isStopping} onStop={() => stopCrawl()} />
      ) : (
        <CrawlResultCard
          state={crawl}
          onOpenReview={() => openExternal(`${environments.APP_URL}${WebAppRoutes.pendingReview}`)}
          onResume={() => start(true)}
          onBack={back}
        />
      )}

      {isThisCrawl ? <TechnicalDetails lines={crawl.log} /> : null}
    </>
  );
};

export default CrawlPage;
