import type { AppInfo, BrowserCheck } from "@shared/ipc";

export const getAppInfo = (): Promise<AppInfo> => window.desktop.app.info();

export const checkBrowser = (): Promise<BrowserCheck> => window.desktop.app.checkBrowser();

export const openExternal = async (url: string): Promise<void> => {
  try {
    await window.desktop.app.openExternal(url);
  } catch {
    throw new Error("The page could not be opened in your browser.");
  }
};
