import type { CaptureConfig } from "../types/config.types.js";

/**
 * Playwright resource types not covered by an explicit capture* flag
 * (document, media, manifest, other, texttrack, eventsource, ...) are
 * captured by default — only the flagged types can be turned off.
 */
export function shouldCaptureResourceType(resourceType: string, config: CaptureConfig): boolean {
  if (config.ignore.resourceTypes.includes(resourceType)) return false;

  switch (resourceType) {
    case "image":
      return config.captureImages;
    case "font":
      return config.captureFonts;
    case "stylesheet":
      return config.captureStylesheets;
    case "script":
      return config.captureScripts;
    case "xhr":
      return config.captureXHR;
    case "fetch":
      return config.captureFetch;
    case "websocket":
      return config.captureWebSockets;
    default:
      return true;
  }
}
