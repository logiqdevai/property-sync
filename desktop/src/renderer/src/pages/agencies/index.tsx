import type { FC } from "react";
import { Button, Card, Skeleton } from "@heroui/react";
import { CheckCircle2, SearchX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyStatePanel } from "@/components/ui/empty-state-panel";
import { Notice } from "@/components/ui/notice";
import { BrowserMissingNotice } from "@/components/ui/browser-missing-notice";
import { useGetCrawlableAgencies } from "@/features/desktop-crawl/hooks/use-desktop-crawl";
import { isCrawlActive, useCrawlSession } from "@/features/crawl-session/hooks/use-crawl-session";
import { isPhotoRepairActive, usePhotoRepair } from "@/features/photo-repair/hooks/use-photo-repair";
import { AgencyCard } from "./components/agency-card";
import { AgencyFilters } from "./components/agency-filters";
import { useAgencyFilters } from "./hooks/use-agency-filters";

const AgenciesPage: FC = () => {
  const filters = useAgencyFilters();
  const { data: agencies, isPending, isError, error, refetch } = useGetCrawlableAgencies(filters.query);
  const crawl = useCrawlSession();
  const photos = usePhotoRepair();
  const isBusy = isCrawlActive(crawl) || isPhotoRepairActive(photos);

  return (
    <>
      <PageHeader
        title="Agencies"
        description="Agencies whose websites block Property Sync's automatic updates can be updated from here, through Chrome on this computer."
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
        <div className="flex flex-col gap-3">
          {agencies.map((agency) => (
            <AgencyCard key={agency.scraper_id} agency={agency} isBusy={isBusy} />
          ))}
        </div>
      )}
    </>
  );
};

export default AgenciesPage;
