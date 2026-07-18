import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  CrawlRun,
  CrawlRunDetail,
  CrawlRunListQuery,
  CrawlRunListResponse,
  DeleteCrawlRunsPayload,
} from "../interfaces/crawl-runs.interfaces";

export const getCrawlRuns = async (
  query?: CrawlRunListQuery,
): Promise<CrawlRunListResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.crawlRuns.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch crawl runs. Please try again.");
  }
};

export const getCrawlRun = async (id: string): Promise<CrawlRunDetail> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.crawlRuns.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch crawl run. Please try again.");
  }
};

export const rerunCrawlRun = async (id: string): Promise<CrawlRun> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.crawlRuns.rerun(id));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to rerun crawl. Please try again.");
  }
};

export const cancelCrawlRun = async (id: string): Promise<CrawlRunDetail> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.crawlRuns.cancel(id));
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to stop crawl. Please try again.",
    );
  }
};

export const deleteCrawlRun = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.crawlRuns.detail(id));
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete crawl run. Please try again.",
    );
  }
};

export const deleteCrawlRuns = async (
  payload: DeleteCrawlRunsPayload,
): Promise<{ deleted: number }> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.crawlRuns.bulkDelete, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete crawl runs. Please try again.",
    );
  }
};
