import path from "node:path";
import { createRequire } from "node:module";
import { chromium, type BrowserContext } from "playwright";
import type { CaptureConfig } from "../types/config.types.js";

export async function launchPersistentBrowser(config: CaptureConfig): Promise<BrowserContext> {
  return chromium.launchPersistentContext(path.resolve(config.userDataDir), {
    headless: config.headless,
    viewport: null,
    acceptDownloads: true,
  });
}

export function getPlaywrightVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("playwright/package.json") as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}
