import fs from "node:fs";
import path from "node:path";
import { buildPostmanCollection } from "./build-collection.js";
import { writeJsonFile } from "../output/json-writer.js";
import { logger } from "../utils/logger.js";
import type { CaptureEntry, SessionData } from "../types/capture.types.js";

async function main(): Promise<void> {
  const input = readArg("--input") ?? "./captures";
  const output = readArg("--output") ?? "./captures/estateweb.postman_collection.json";
  const name = readArg("--name") ?? "EstateWeb API (captured)";

  const sessionFiles = resolveSessionFiles(input);
  if (sessionFiles.length === 0) {
    logger.error(`No session-*.json files found at ${input}`);
    process.exitCode = 1;
    return;
  }

  const entries: CaptureEntry[] = [];
  for (const file of sessionFiles) {
    const session = JSON.parse(fs.readFileSync(file, "utf-8")) as SessionData;
    entries.push(...session.entries);
    logger.info(`Loaded ${session.entries.length} entrie(s) from ${path.basename(file)}`);
  }

  const collection = buildPostmanCollection(entries, { name });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  await writeJsonFile(output, collection);

  const requestCount = collection.item.reduce((total, folder) => total + ("item" in folder ? folder.item.length : 1), 0);
  logger.info(`Built ${requestCount} request(s) across ${collection.item.length} folder(s).`);
  logger.info(`Postman collection written to ${output}`);
}

function resolveSessionFiles(input: string): string[] {
  const resolved = path.resolve(input);

  if (!fs.existsSync(resolved)) return [];
  if (fs.statSync(resolved).isFile()) return [resolved];

  return fs
    .readdirSync(resolved)
    .filter((file) => /^session-.*\.json$/.test(file))
    .map((file) => path.join(resolved, file))
    .sort();
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

main().catch((error: Error) => {
  logger.error(error.stack ?? String(error));
  process.exitCode = 1;
});
