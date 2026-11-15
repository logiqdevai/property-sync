import type { DesktopBridge } from "@shared/ipc";

declare global {
  interface Window {
    /** Exposed by the Electron preload script (src/preload/index.ts). */
    desktop: DesktopBridge;
  }
}

export {};
