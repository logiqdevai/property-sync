import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import { apiErrorMessage } from "@/lib/api-error";
import type {
  CrawlableAgenciesQuery,
  CrawlableAgency,
} from "../interfaces/desktop-crawl.interfaces";

export const getCrawlableAgencies = async (
  query?: CrawlableAgenciesQuery,
): Promise<CrawlableAgency[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.desktop_crawl.scrapers, {
      params: {
        search: query?.search || undefined,
        only_attention: query?.only_attention ? "true" : undefined,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(apiErrorMessage(error, "Failed to load the agencies. Please try again."), {
      cause: error,
    });
  }
};
