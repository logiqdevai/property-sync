import readline from "node:readline";
import type { BrowserContext } from "playwright";
import { logger } from "../utils/logger.js";

/**
 * Resolves once the user signals they're done — either by pressing Enter in
 * the terminal, or by closing the browser window themselves.
 */
export async function waitForSessionEnd(context: BrowserContext): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    logger.info("Recording started. Log in and navigate the app manually.");
    logger.info("Press Enter in this terminal when done, or just close the browser window.");

    const rl = readline.createInterface({ input: process.stdin });
    rl.once("line", () => {
      rl.close();
      finish();
    });

    context.once("close", () => {
      rl.close();
      finish();
    });
  });
}
