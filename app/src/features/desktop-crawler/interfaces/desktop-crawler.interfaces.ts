/** The latest published installer of the desktop crawler app (desktop/ in the repo). */
export interface DesktopCrawlerRelease {
  version: string;
  file_name: string;
  size_bytes: number;
  published_at: string;
  /** Signed link, valid for a few minutes only: fetch a fresh one right before downloading. */
  download_url: string;
}
