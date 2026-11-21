import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { IpcChannels, UpdateStatuses, type DesktopSession, type UpdateState } from "@shared/ipc";
import { errorMessage } from "../utils/async.utils";
import { StateChannel } from "../utils/state-channel";

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

type UpdateChannelState = UpdateState & { log: string[] };

/**
 * Keeps the installed app up to date. The feed is the Property Sync API
 * (`GET /desktop-crawl/app/update/latest.yml` and the installer it names), which streams the files
 * published by api/scripts/publish-desktop-crawler.ts from the private bucket, so requests carry
 * the signed-in user's token. Updates download in the background and install on restart, or when
 * the app is next closed.
 */
class AppUpdater {
  private readonly state = new StateChannel<UpdateChannelState>(IpcChannels.UPDATE_STATE, () => ({
    status: UpdateStatuses.IDLE,
    current_version: app.getVersion(),
    new_version: null,
    percent: 0,
    error: null,
    log: [],
  }));
  private timer: NodeJS.Timeout | null = null;
  private wired = false;

  getState(): UpdateState {
    return this.state.get();
  }

  /** Called whenever the UI signs in or out. Updates are checked only while signed in. */
  onSession(session: DesktopSession | null): void {
    // Running from source (npm run dev) there is nothing to update.
    if (!app.isPackaged) return;
    if (!session) {
      this.stopTimer();
      return;
    }

    this.wire();
    autoUpdater.setFeedURL({ provider: "generic", url: `${session.api_url}/desktop-crawl/app/update` });
    autoUpdater.requestHeaders = { Authorization: `Bearer ${session.access_token}` };

    if (!this.timer) {
      void this.check();
      this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
    }
  }

  install(): void {
    if (this.state.get().status !== UpdateStatuses.READY) throw new Error("No update is ready to install.");
    // isSilent=false shows the installer's progress; isForceRunAfter=true reopens the app after.
    autoUpdater.quitAndInstall(false, true);
  }

  private async check(): Promise<void> {
    const status = this.state.get().status;
    if (status === UpdateStatuses.DOWNLOADING || status === UpdateStatuses.READY) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      // Already reported through the "error" event; a failed check is retried on the next tick.
      this.state.log(`update check failed: ${errorMessage(error)}`);
    }
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // The API streams whole files; differential (range) downloads aren't served.
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.logger = null;

    autoUpdater.on("checking-for-update", () =>
      this.state.patch({ status: UpdateStatuses.CHECKING, error: null }),
    );
    autoUpdater.on("update-not-available", () => this.state.patch({ status: UpdateStatuses.UP_TO_DATE }));
    autoUpdater.on("update-available", (info) =>
      this.state.patch({ status: UpdateStatuses.DOWNLOADING, new_version: info.version, percent: 0 }),
    );
    autoUpdater.on("download-progress", (progress) =>
      this.state.patch({ status: UpdateStatuses.DOWNLOADING, percent: Math.round(progress.percent) }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      this.state.patch({ status: UpdateStatuses.READY, new_version: info.version, percent: 100 }),
    );
    autoUpdater.on("error", (error) => {
      // A 404 just means nothing has been published yet; not worth showing.
      const message = errorMessage(error);
      const nothingPublished = /404|not found/i.test(message);
      this.state.patch({
        status: nothingPublished ? UpdateStatuses.UP_TO_DATE : UpdateStatuses.ERROR,
        error: nothingPublished ? null : message.slice(0, 300),
      });
    });
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const appUpdater = new AppUpdater();
