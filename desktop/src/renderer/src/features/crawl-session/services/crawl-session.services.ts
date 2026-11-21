import type { CrawlCheckpointInfo, StartCrawlRequest } from "@shared/ipc";

/** Thin wrappers over the Electron bridge (crawls run in the main process, not over HTTP). */

export const bridgeErrorMessage = (error: unknown, fallback: string) =>
  new Error(
    error instanceof Error
      ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
      : fallback,
    { cause: error },
  );

export const startCrawl = async (request: StartCrawlRequest): Promise<void> => {
  try {
    await window.desktop.crawl.start(request);
  } catch (error) {
    throw bridgeErrorMessage(error, "Could not start the crawl. Please try again.");
  }
};

/** Starts several crawls; returns the agencies that could not be started, with the reason. */
export const startCrawls = async (
  requests: StartCrawlRequest[],
  concurrency: number,
): Promise<Array<{ agency_name: string; reason: string }>> => {
  try {
    return await window.desktop.crawl.startQueue(requests, concurrency);
  } catch (error) {
    throw bridgeErrorMessage(error, "Could not start the crawls.");
  }
};

export const stopCrawl = async (scraperId: string): Promise<void> => {
  await window.desktop.crawl.stop(scraperId);
};

export const dismissCrawl = async (scraperId: string): Promise<void> => {
  await window.desktop.crawl.dismiss(scraperId);
};

export const getCrawlCheckpoint = async (scraperId: string): Promise<CrawlCheckpointInfo | null> => {
  try {
    return await window.desktop.crawl.getCheckpoint(scraperId);
  } catch {
    return null;
  }
};

export const listCrawlCheckpoints = async (): Promise<Record<string, CrawlCheckpointInfo>> => {
  try {
    return await window.desktop.crawl.listCheckpoints();
  } catch {
    return {};
  }
};
