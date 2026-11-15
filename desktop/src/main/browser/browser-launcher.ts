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
 *
 * Chrome allows one window per profile, so every task (each agency's crawl, the photo repair)
 * shares that one window and gets its own tab. The window closes when the last tab is released.
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

/** One task's tab in the shared browser window. */
export interface CrawlerPage {
  page: Page;
  /** Closes this tab; the last one to close also closes the window. */
  close(): Promise<void>;
}

interface SharedBrowser {
  context: Promise<BrowserContext>;
  users: number;
}

let shared: SharedBrowser | null = null;
/** Tabs already handed to a task (the window opens with one blank tab we reuse). */
const claimed = new WeakSet<Page>();

function launch(channel: BrowserChannel): Promise<BrowserContext> {
  return chromium
    .launchPersistentContext(join(app.getPath("userData"), "browser-profile"), {
      channel,
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/user data directory is already in use|ProcessSingleton/i.test(message)) {
        throw new Error("The crawler's Chrome window is still open from before. Close it and try again.", {
          cause: error,
        });
      }
      throw error;
    });
}

export async function openCrawlerPage(): Promise<CrawlerPage> {
  const channel = detectBrowserChannel();
  if (!channel) {
    throw new Error("Google Chrome is not installed on this computer. Install it and try again.");
  }

  if (!shared) {
    const created: SharedBrowser = { context: launch(channel), users: 0 };
    shared = created;
    created.context
      .then((context) =>
        // The user closed the whole window: every tab is gone, start fresh next time.
        context.on("close", () => {
          if (shared === created) shared = null;
        }),
      )
      .catch(() => {
        if (shared === created) shared = null;
      });
  }

  const browser = shared;
  browser.users++;
  let context: BrowserContext;
  let page: Page;
  try {
    context = await browser.context;
    const blank = context.pages().find((p) => !claimed.has(p) && p.url() === "about:blank");
    page = blank ?? (await context.newPage());
    claimed.add(page);
  } catch (error) {
    browser.users--;
    throw error;
  }

  let closed = false;
  return {
    page,
    close: async () => {
      if (closed) return;
      closed = true;
      browser.users--;
      if (browser.users <= 0 && shared === browser) {
        shared = null;
        await context.close().catch(() => undefined);
      } else {
        await page.close().catch(() => undefined);
      }
    },
  };
}
