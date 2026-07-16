import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CaptureConfig } from "../types/config.types.js";
import { DEFAULT_IGNORED_HOSTNAMES } from "./default-ignore-list.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(moduleDir, "..", "..");
const DEFAULT_CONFIG_PATH = path.join(PACKAGE_ROOT, "config", "default.config.json");

const BASE_CONFIG: CaptureConfig = {
  startUrl: "https://app.estateweb.gr/login",
  headless: false,
  outputFile: "./captures/session-{{index}}.json",
  userDataDir: "./captures/.browser-profile",
  captureImages: false,
  captureFonts: false,
  captureStylesheets: false,
  captureScripts: true,
  captureXHR: true,
  captureFetch: true,
  captureWebSockets: true,
  maxBodySizeBytes: 5 * 1024 * 1024,
  ignore: { hostnames: DEFAULT_IGNORED_HOSTNAMES, resourceTypes: [] },
};

export function loadConfig(configPath?: string): CaptureConfig {
  const resolvedPath = configPath ? path.resolve(configPath) : DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(resolvedPath)) {
    return BASE_CONFIG;
  }

  const userConfig = JSON.parse(fs.readFileSync(resolvedPath, "utf-8")) as Partial<CaptureConfig>;

  return {
    ...BASE_CONFIG,
    ...userConfig,
    ignore: {
      hostnames: userConfig.ignore?.hostnames ?? BASE_CONFIG.ignore.hostnames,
      resourceTypes: userConfig.ignore?.resourceTypes ?? BASE_CONFIG.ignore.resourceTypes,
    },
  };
}
