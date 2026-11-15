import { isAxiosError } from "axios";
import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { DesktopCrawlerRelease } from "../interfaces/desktop-crawler.interfaces";

/** null when no version has been published yet (404). */
export const getLatestDesktopCrawler = async (): Promise<DesktopCrawlerRelease | null> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.desktopCrawler.latest);
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return null;
    const message = isAxiosError(error)
      ? (error.response?.data as { message?: string } | undefined)?.message
      : undefined;
    throw new Error(message || "Failed to fetch the desktop app. Please try again.", {
      cause: error,
    });
  }
};
