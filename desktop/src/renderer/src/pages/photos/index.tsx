import type { FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Skeleton } from "@heroui/react";
import { PhotoPhases } from "@shared/ipc";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/ui/back-link";
import { Notice } from "@/components/ui/notice";
import { TechnicalDetails } from "@/components/ui/technical-details";
import { BrowserMissingNotice } from "@/components/ui/browser-missing-notice";
import { Routes } from "@/routes/routes";
import { useGetCrawlableAgency } from "@/features/desktop-crawl/hooks/use-desktop-crawl";
import {
  isPhotoRepairActive,
  useDismissPhotoRepair,
  usePhotoRepair,
  useStartPhotoRepair,
  useStopPhotoRepair,
} from "@/features/photo-repair/hooks/use-photo-repair";
import { OpenAgencyInWebAppButton } from "@/components/ui/open-agency-in-web-app-button";
import { PhotoStartCard } from "./components/photo-start-card";
import { PhotoProgressCard } from "./components/photo-progress-card";
import { PhotoResultCard } from "./components/photo-result-card";

const PhotosPage: FC = () => {
  const { agencyId = "" } = useParams();
  const navigate = useNavigate();
  const { data: agency, isPending: agencyPending } = useGetCrawlableAgency({ agencyId });
  const photos = usePhotoRepair();
  const { mutate: startRepair, isPending: isStarting } = useStartPhotoRepair();
  const { mutate: stopRepair, isPending: isStopping } = useStopPhotoRepair();
  const { mutate: dismissRepair } = useDismissPhotoRepair();

  const isThisAgency = photos.agency_id === agencyId && photos.phase !== PhotoPhases.IDLE;
  // One photo check at a time; crawls can keep running next to it.
  const otherTaskRunning = isPhotoRepairActive(photos) && photos.agency_id !== agencyId;
  const agencyName = agency?.agency_name ?? photos.agency_name ?? "this agency";

  const start = () => {
    if (agency) startRepair({ agency_id: agency.agency_id, agency_name: agency.agency_name });
  };

  if (agencyPending && !isThisAgency) {
    return (
      <Card className="gap-3 p-6">
        <Skeleton className="h-5 w-56 rounded-md" />
        <Skeleton className="h-3 w-full rounded-md" />
      </Card>
    );
  }

  if (!agency && !isThisAgency) {
    return (
      <Notice
        status="danger"
        title="Agency not found"
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
        description="Photos in the CRM"
        actions={<OpenAgencyInWebAppButton agencyId={agencyId} agencyName={agencyName} />}
      />
      <BrowserMissingNotice />

      {!isThisAgency ? (
        <PhotoStartCard
          agencyName={agencyName}
          isBlockedByOtherTask={otherTaskRunning}
          isStarting={isStarting}
          onStart={start}
        />
      ) : isPhotoRepairActive(photos) ? (
        <PhotoProgressCard state={photos} isStopping={isStopping} onStop={() => stopRepair()} />
      ) : (
        <PhotoResultCard
          state={photos}
          onAgain={start}
          onBack={() => {
            dismissRepair();
            navigate(Routes.agencies);
          }}
        />
      )}

      {isThisAgency ? <TechnicalDetails lines={photos.log} /> : null}
    </>
  );
};

export default PhotosPage;
