import { existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { BrowserChannel } from "@shared/ipc";

/**
 * The crawler drives the Chrome (or Edge) already installed on this computer, not a bundled
 * browser: a real, visible, everyday browser on a home/office connection is exactly what the
 * agencies' bot protection lets through. A persistent profile keeps cookies between runs, so a
 * site that was cleared once usually stays cleared.
 */

const candidates: Record<BrowserChannel, string[]> = {
  chrome: [
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
    join(
      process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  ],
  msedge: [
    join(
      process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
      "Microsoft\\Edge\\Application\\msedge.exe",
    ),
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
  ],
};

export function detectBrowserChannel(): BrowserChannel | null {
  if (process.platform !== "win32") return "chrome"; // let Playwright resolve it on other systems
  for (const channel of ["chrome", "msedge"] as const) {
    if (candidates[channel].some((path) => path && existsSync(path))) return channel;
  }
  return null;
}

export interface CrawlerBrowser {
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

let inUse = false;

/** Opens the visible browser. Only one crawl or photo repair can use it at a time. */
export async function openCrawlerBrowser(): Promise<CrawlerBrowser> {
  if (inUse) throw new Error("The browser is already in use by another task.");
  const channel = detectBrowserChannel();
  if (!channel) {
    throw new Error("Google Chrome is not installed on this computer. Install it and try again.");
  }

  inUse = true;
  try {
    const context = await chromium.launchPersistentContext(
      join(app.getPath("userData"), "browser-profile"),
      {
        channel,
        headless: false,
        viewport: null,
        ignoreDefaultArgs: ["--enable-automation"],
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    );
    const page = context.pages()[0] ?? (await context.newPage());
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      inUse = false;
      await context.close().catch(() => undefined);
    };
    // The user may close the window themselves; free the lock either way.
    context.on("close", () => {
      closed = true;
      inUse = false;
    });
    return { context, page, close };
  } catch (error) {
    inUse = false;
    const message = error instanceof Error ? error.message : String(error);
    if (/user data directory is already in use|ProcessSingleton/i.test(message)) {
      throw new Error("The crawler's browser window is still open. Close it and try again.", {
        cause: error,
      });
    }
    throw error;
  }
}
