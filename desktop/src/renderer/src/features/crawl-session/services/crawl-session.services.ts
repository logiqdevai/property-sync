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
): Promise<Array<{ agency_name: string; reason: string }>> => {
  const failures: Array<{ agency_name: string; reason: string }> = [];
  for (const request of requests) {
    try {
      await window.desktop.crawl.start(request);
    } catch (error) {
      failures.push({
        agency_name: request.agency_name,
        reason: bridgeErrorMessage(error, "Could not start").message,
      });
    }
  }
  return failures;
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
