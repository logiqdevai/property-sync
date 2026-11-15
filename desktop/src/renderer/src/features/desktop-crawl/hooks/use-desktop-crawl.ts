import { useQuery } from "@tanstack/react-query";
import { getCrawlableAgencies } from "../services/desktop-crawl.services";
import type { CrawlableAgenciesQuery } from "../interfaces/desktop-crawl.interfaces";

export const CRAWLABLE_AGENCIES_KEY = "crawlable-agencies";

export const useGetCrawlableAgencies = (query?: CrawlableAgenciesQuery) => {
  return useQuery({
    queryKey: [CRAWLABLE_AGENCIES_KEY, query],
    queryFn: () => getCrawlableAgencies(query),
    refetchInterval: 60_000,
  });
};

/** One agency from the full list, by scraper id or by agency id. */
export const useGetCrawlableAgency = (by: { scraperId?: string; agencyId?: string }) => {
  return useQuery({
    queryKey: [CRAWLABLE_AGENCIES_KEY, "all"],
    queryFn: () => getCrawlableAgencies(),
    enabled: !!(by.scraperId || by.agencyId),
    select: (agencies) =>
      agencies.find((a) =>
        by.scraperId ? a.scraper_id === by.scraperId : a.agency_id === by.agencyId,
      ) ?? null,
  });
};
