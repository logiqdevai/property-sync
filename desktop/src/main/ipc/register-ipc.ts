import { app, ipcMain, shell } from "electron";
import {
  IpcChannels,
  type DesktopSession,
  type StartCrawlRequest,
  type StartPhotosRequest,
} from "@shared/ipc";
import { sessionStore } from "../auth/session-store";
import { detectBrowserChannel } from "../browser/browser-launcher";
import { checkpointStore } from "../crawl/checkpoint-store";
import { crawlSessions } from "../crawl/crawl-session";
import { photoRepairSession } from "../photos/photo-repair-session";
import { appUpdater } from "../updates/app-updater";

export function registerIpc(): void {
  ipcMain.handle(IpcChannels.SET_SESSION, (_event, session: DesktopSession | null) => {
    sessionStore.set(session);
    appUpdater.onSession(session);
  });

  ipcMain.handle(IpcChannels.APP_INFO, () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));

  ipcMain.handle(IpcChannels.OPEN_EXTERNAL, (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error("Only web links can be opened.");
    return shell.openExternal(url);
  });

  ipcMain.handle(IpcChannels.BROWSER_CHECK, () => ({ channel: detectBrowserChannel() }));

  // Crawls of different agencies run side by side, each in its own Chrome tab.
  ipcMain.handle(IpcChannels.CRAWL_START, (_event, request: StartCrawlRequest) => crawlSessions.start(request));
  ipcMain.handle(IpcChannels.CRAWL_START_QUEUE, (_event, requests: StartCrawlRequest[], concurrency: number) =>
    crawlSessions.startQueue(requests, concurrency),
  );
  ipcMain.handle(IpcChannels.CRAWL_STOP, (_event, scraperId: string) => crawlSessions.stop(scraperId));
  ipcMain.handle(IpcChannels.CRAWL_DISMISS, (_event, scraperId: string) => crawlSessions.dismiss(scraperId));
  ipcMain.handle(IpcChannels.CRAWL_STATE, () => crawlSessions.getStates());
  ipcMain.handle(IpcChannels.CRAWL_CHECKPOINT, (_event, scraperId: string) => checkpointStore.info(scraperId));
  ipcMain.handle(IpcChannels.CRAWL_CHECKPOINTS, () => checkpointStore.listInfo());

  // Photo checks of different agencies run side by side (and next to crawls), each in its own tab.
  ipcMain.handle(IpcChannels.PHOTOS_START, (_event, request: StartPhotosRequest) =>
    photoRepairSession.start(request),
  );
  ipcMain.handle(IpcChannels.PHOTOS_START_QUEUE, (_event, requests: StartPhotosRequest[], concurrency: number) =>
    photoRepairSession.startQueue(requests, concurrency),
  );
  ipcMain.handle(IpcChannels.PHOTOS_STOP, (_event, agencyId: string) => photoRepairSession.stop(agencyId));
  ipcMain.handle(IpcChannels.PHOTOS_DISMISS, (_event, agencyId: string) =>
    photoRepairSession.dismiss(agencyId),
  );
  ipcMain.handle(IpcChannels.PHOTOS_STATE, () => photoRepairSession.getStates());

  ipcMain.handle(IpcChannels.UPDATE_STATE, () => appUpdater.getState());
  ipcMain.handle(IpcChannels.UPDATE_INSTALL, () => {
    // Restarting mid-crawl would cut it off (it is saved, but the user would have to continue it).
    if (isBusy()) throw new Error("Finish or stop the crawl or photo check first, then restart.");
    appUpdater.install();
  });
}

/** Asked before quitting while a task runs (the crawl itself is saved either way). */
export function isBusy(): boolean {
  return crawlSessions.isRunning() || photoRepairSession.isRunning();
}
