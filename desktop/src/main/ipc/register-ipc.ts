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
import { crawlSession } from "../crawl/crawl-session";
import { photoRepairSession } from "../photos/photo-repair-session";

/** Both tasks drive the same browser profile, so only one can run at a time. */
function assertIdle(): void {
  if (crawlSession.isRunning()) throw new Error("A crawl is running. Wait for it to finish or stop it first.");
  if (photoRepairSession.isRunning()) {
    throw new Error("Photos are being fixed. Wait for that to finish or stop it first.");
  }
}

export function registerIpc(): void {
  ipcMain.handle(IpcChannels.SET_SESSION, (_event, session: DesktopSession | null) => {
    sessionStore.set(session);
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

  ipcMain.handle(IpcChannels.CRAWL_START, (_event, request: StartCrawlRequest) => {
    assertIdle();
    crawlSession.start(request);
  });
  ipcMain.handle(IpcChannels.CRAWL_STOP, () => crawlSession.stop());
  ipcMain.handle(IpcChannels.CRAWL_DISMISS, () => crawlSession.dismiss());
  ipcMain.handle(IpcChannels.CRAWL_STATE, () => crawlSession.getState());
  ipcMain.handle(IpcChannels.CRAWL_CHECKPOINT, (_event, scraperId: string) =>
    checkpointStore.info(scraperId),
  );

  ipcMain.handle(IpcChannels.PHOTOS_START, (_event, request: StartPhotosRequest) => {
    assertIdle();
    photoRepairSession.start(request);
  });
  ipcMain.handle(IpcChannels.PHOTOS_STOP, () => photoRepairSession.stop());
  ipcMain.handle(IpcChannels.PHOTOS_DISMISS, () => photoRepairSession.dismiss());
  ipcMain.handle(IpcChannels.PHOTOS_STATE, () => photoRepairSession.getState());
}

/** Asked before quitting while a task runs (the crawl itself is saved either way). */
export function isBusy(): boolean {
  return crawlSession.isRunning() || photoRepairSession.isRunning();
}
