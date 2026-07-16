import { loadConfig } from "./config/config-loader.js";
import { launchPersistentBrowser, getPlaywrightVersion } from "./browser/browser-launcher.js";
import { NetworkRecorder } from "./capture/network-recorder.js";
import { waitForSessionEnd } from "./session/session-controller.js";
import { resolveOutputPaths } from "./output/output-paths.js";
import { writeJsonFile } from "./output/json-writer.js";
import { buildSummary } from "./output/summary-builder.js";
import { logger } from "./utils/logger.js";
import type { SessionData } from "./types/capture.types.js";

async function main(): Promise<void> {
  const configPath = readArg("--config");
  const config = loadConfig(configPath);

  logger.info(`Starting capture session for ${config.startUrl}`);

  const context = await launchPersistentBrowser(config);
  const recorder = new NetworkRecorder(config);
  recorder.attach(context);

  const page = context.pages()[0] ?? (await context.newPage());
  const startedAt = Date.now();

  await page.goto(config.startUrl, { waitUntil: "domcontentloaded" }).catch((error: Error) => {
    logger.warn(`Initial navigation failed: ${error.message}`);
  });

  await waitForSessionEnd(context);

  const durationMs = Date.now() - startedAt;

  await context.close().catch(() => {
    // Already closed by the user.
  });

  const entries = recorder.getEntries();
  const session: SessionData = {
    capturedAt: new Date().toISOString(),
    startUrl: config.startUrl,
    browser: "Chromium",
    playwrightVersion: getPlaywrightVersion(),
    durationMs,
    entryCount: entries.length,
    entries,
  };

  const { sessionPath, summaryPath } = resolveOutputPaths(config.outputFile);
  await writeJsonFile(sessionPath, session);
  await writeJsonFile(summaryPath, buildSummary(entries));

  logger.info(`Captured ${entries.length} request(s).`);
  logger.info(`Session written to ${sessionPath}`);
  logger.info(`Summary written to ${summaryPath}`);
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

main().catch((error: Error) => {
  logger.error(error.stack ?? String(error));
  process.exitCode = 1;
});
