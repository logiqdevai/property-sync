import type { IgnoreConfig } from "../types/config.types.js";
import { safeHostname } from "../utils/url-utils.js";

export function shouldIgnoreRequest(url: string, ignore: IgnoreConfig): boolean {
  const hostname = safeHostname(url);
  if (hostname === "unknown") return false;
  return ignore.hostnames.some((pattern) => matchesHostname(hostname, pattern));
}

function matchesHostname(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.com"
    return hostname === pattern.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === pattern || hostname.endsWith(`.${pattern}`);
}
