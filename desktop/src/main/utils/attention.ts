import { BrowserWindow, Notification } from "electron";

/** Gets the user's attention when they have to do something (a check in Chrome) or a task ended. */
export function notifyUser(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.isFocused()) window.flashFrame(true);
  }
}
