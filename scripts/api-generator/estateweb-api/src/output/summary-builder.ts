import type { CaptureEntry, SummaryData } from "../types/capture.types.js";
import { safeHostname } from "../utils/url-utils.js";

const TOP_N = 10;

export function buildSummary(entries: CaptureEntry[]): SummaryData {
  const summary: SummaryData = {
    totalRequests: entries.length,
    successfulRequests: 0,
    failedRequests: 0,
    methods: {},
    domains: {},
    endpoints: {},
    statusCodes: {},
    largestResponses: [],
    slowestRequests: [],
  };

  const responseSizes: Array<{ id: string; url: string; size: number }> = [];
  const durations: Array<{ id: string; url: string; duration: number }> = [];

  for (const entry of entries) {
    increment(summary.methods, entry.request.method);
    increment(summary.domains, safeHostname(entry.request.url));
    increment(summary.endpoints, `${entry.request.method} ${entry.request.path}`);
    durations.push({ id: entry.id, url: entry.request.url, duration: entry.duration });

    if (entry.failed || !entry.response) {
      summary.failedRequests += 1;
      continue;
    }

    increment(summary.statusCodes, String(entry.response.status));
    if (entry.response.status >= 200 && entry.response.status < 400) {
      summary.successfulRequests += 1;
    } else {
      summary.failedRequests += 1;
    }

    responseSizes.push({ id: entry.id, url: entry.request.url, size: entry.response.size });
  }

  summary.largestResponses = responseSizes.sort((a, b) => b.size - a.size).slice(0, TOP_N);
  summary.slowestRequests = durations.sort((a, b) => b.duration - a.duration).slice(0, TOP_N);

  return summary;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}
