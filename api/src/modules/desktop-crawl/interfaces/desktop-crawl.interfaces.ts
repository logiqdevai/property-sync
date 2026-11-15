import type { ScraperStatus } from 'generated/prisma';
import type { ScraperConfig } from '@/integrations/crawler/interfaces/scraper-config.interface';
import type { DESKTOP_CRAWL_PACING } from '../constants/desktop-crawl.constants';

export const DesktopCrawlAttentionReasons = {
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  EMPTY: 'EMPTY',
  BROKEN: 'BROKEN',
} as const;
export type DesktopCrawlAttentionReason =
  (typeof DesktopCrawlAttentionReasons)[keyof typeof DesktopCrawlAttentionReasons];

export interface DesktopCrawlRunSummary {
  id: string;
  status: string;
  created_at: Date;
  total_found: number;
  error_message: string | null;
}

export interface DesktopCrawlScraperRow {
  scraper_id: string;
  scraper_name: string;
  scraper_status: ScraperStatus;
  agency_id: string;
  agency_name: string;
  agency_url: string;
  /** Why this agency needs a browser crawl; null when its scheduled crawl works. */
  attention: DesktopCrawlAttentionReason | null;
  last_server_crawl: DesktopCrawlRunSummary | null;
  last_desktop_crawl: DesktopCrawlRunSummary | null;
  has_config: boolean;
}

export interface DesktopCrawlJob {
  scraper_id: string;
  scraper_name: string;
  agency_id: string;
  agency_name: string;
  config: ScraperConfig;
  /** Page-side extractor sources, evaluated in the app's Chrome as `(<source>)(arg)`. */
  scripts: {
    listing: string;
    detail: string;
  };
  pacing: typeof DESKTOP_CRAWL_PACING;
  captcha_solver_available: boolean;
}

/** One listing as the desktop app uploads it: the card data plus the raw detail-page result. */
export interface DesktopCrawlUploadItem {
  source_url: string;
  raw: Record<string, unknown>;
  detail?: Record<string, unknown> | null;
  detail_error?: string | null;
  detail_final_url?: string | null;
  detail_body_text_length?: number | null;
}

export const DesktopCrawlPhases = {
  SAVING: 'SAVING',
  NORMALIZING: 'NORMALIZING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;
export type DesktopCrawlPhase =
  (typeof DesktopCrawlPhases)[keyof typeof DesktopCrawlPhases];

/** Kept in CrawlRun.metadata.desktop_crawl. */
export interface DesktopCrawlRunMetadata {
  uploaded_by: string;
  uploaded_items: number;
  complete: boolean;
  phase: DesktopCrawlPhase;
  /** UserTrackedAgency ids whose auto_update_to_crm was switched off for this run. */
  restore_auto_update_ids: string[];
  auto_update_restored_at: string | null;
  /** Set when a later desktop run for the same agency took over the pending restore. */
  restore_handed_to: string | null;
  stats?: Record<string, number>;
}

export interface DesktopCrawlRunStatus {
  crawl_run_id: string;
  agency_id: string;
  phase: DesktopCrawlPhase;
  status: string;
  total_found: number;
  total_new_listings: number;
  total_refreshed_listings: number;
  total_removed: number;
  /** New/changed listings of the agency waiting for review and push. Set once normalization ends. */
  held_for_review: number | null;
  /** Held listings with no source photos (the site has none, or extraction missed them). */
  held_without_photos: number | null;
  auto_update_restored: boolean;
  error_message: string | null;
}

export interface PhotoCheckTarget {
  user_property_id: string;
  title: string | null;
}

export interface PhotoCheckResult {
  user_property_id: string;
  title: string | null;
  /** The listing's page on the agency's website. */
  source_url: string | null;
  /** The listing's id in EstateWeb (its page is https://app.estateweb.gr/app/property/<id>). */
  integration_property_id: string | null;
  /** Login email of the EstateWeb account the listing is in (never the password). */
  crm_account_email: string | null;
  crm_images: number | null;
  missing: boolean;
  error: string | null;
  /** The listing's source photos, to download through the app's Chrome when missing. */
  source_image_urls: string[];
}

/** `latest.json` in the desktop-crawler storage folder. */
export interface DesktopAppManifest {
  version: string;
  file_name: string;
  size_bytes: number;
  published_at: string;
}

export interface DesktopAppRelease extends DesktopAppManifest {
  /** Signed, short-lived link to the installer. */
  download_url: string;
}
