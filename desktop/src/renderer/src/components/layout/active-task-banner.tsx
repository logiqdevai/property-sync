import { Link, useLocation } from "react-router-dom";
import { Spinner } from "@heroui/react";
import { BlockStates } from "@shared/ipc";
import { Routes } from "@/routes/routes";
import { isCrawlActive, useCrawlSession } from "@/features/crawl-session/hooks/use-crawl-session";
import { isPhotoRepairActive, usePhotoRepair } from "@/features/photo-repair/hooks/use-photo-repair";
import { cn } from "@/lib/utils";

/** Shown on every page while a crawl or photo repair runs, linking back to it. */
export function ActiveTaskBanner() {
  const crawl = useCrawlSession();
  const photos = usePhotoRepair();
  const { pathname } = useLocation();

  let target: { to: string; text: string; needsUser: boolean } | null = null;
  if (isCrawlActive(crawl) && crawl.scraper_id) {
    target = {
      to: Routes.crawl(crawl.scraper_id),
      text: `Crawling ${crawl.agency_name ?? "an agency"}`,
      needsUser: crawl.block === BlockStates.NEEDS_USER,
    };
  } else if (isPhotoRepairActive(photos) && photos.agency_id) {
    target = {
      to: Routes.photos(photos.agency_id),
      text: `Checking photos of ${photos.agency_name ?? "an agency"}`,
      needsUser: photos.block === BlockStates.NEEDS_USER,
    };
  }
  if (!target || pathname === target.to) return null;

  return (
    <Link
      to={target.to}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium",
        target.needsUser ? "bg-warning text-warning-foreground" : "bg-accent-soft text-accent",
      )}
    >
      <Spinner size="sm" color="current" />
      {target.needsUser ? `${target.text}: your help is needed in Chrome` : target.text}
      <span className="underline underline-offset-4">Open</span>
    </Link>
  );
}
