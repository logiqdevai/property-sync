import type { DiagnosticsMode } from "@/features/scrapers/interfaces/scrapers.interfaces";

export const DiagnosticsArtifactKinds = {
  TRACE: "TRACE",
  SCREENSHOT: "SCREENSHOT",
  HTML_SNAPSHOT: "HTML_SNAPSHOT",
  CONSOLE_LOG: "CONSOLE_LOG",
  NETWORK_HAR: "NETWORK_HAR",
  VIDEO: "VIDEO",
} as const;

export type DiagnosticsArtifactKind =
  (typeof DiagnosticsArtifactKinds)[keyof typeof DiagnosticsArtifactKinds];

export interface DiagnosticsArtifactSummary {
  kind: DiagnosticsArtifactKind;
}

export interface DiagnosticsArtifact extends DiagnosticsArtifactSummary {
  id: string;
  diagnostics_package_id: string;
  path: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  url: string;
}

export interface DiagnosticsPackage {
  id: string;
  crawl_run_id: string;
  scraper_id: string;
  mode: DiagnosticsMode;
  url: string;
  worker_id: string | null;
  browser_version: string | null;
  playwright_version: string | null;
  scraper_version: number | null;
  retry_number: number | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  failure_reason: string | null;
  exception: string | null;
  created_at: string;
  scraper?: { name: string };
  crawl_run?: { source_agency_id: string; status: string };
  artifacts: DiagnosticsArtifactSummary[];
}

export interface DiagnosticsPackageDetail extends Omit<DiagnosticsPackage, "artifacts"> {
  artifacts: DiagnosticsArtifact[];
}

export interface DiagnosticsListQuery {
  page?: number;
  limit?: number;
  scraper_id?: string;
  crawl_run_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}
