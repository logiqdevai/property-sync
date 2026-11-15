import type { CrawlCheckpointInfo, StartCrawlRequest } from "@shared/ipc";

/** Thin wrappers over the Electron bridge (the crawl runs in the main process, not over HTTP). */

const failure = (error: unknown, fallback: string) =>
  new Error(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : fallback);

export const startCrawl = async (request: StartCrawlRequest): Promise<void> => {
  try {
    await window.desktop.crawl.start(request);
  } catch (error) {
    throw failure(error, "Could not start the crawl. Please try again.");
  }
};

export const stopCrawl = async (): Promise<void> => {
  await window.desktop.crawl.stop();
};

export const dismissCrawl = async (): Promise<void> => {
  await window.desktop.crawl.dismiss();
};

export const getCrawlCheckpoint = async (scraperId: string): Promise<CrawlCheckpointInfo | null> => {
  try {
    return await window.desktop.crawl.getCheckpoint(scraperId);
  } catch {
    return null;
  }
};

export const bridgeErrorMessage = failure;
