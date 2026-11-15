import { Link, useLocation } from "react-router-dom";
import { Spinner } from "@heroui/react";
import { BlockStates } from "@shared/ipc";
import { Routes } from "@/routes/routes";
import { useActiveCrawls } from "@/features/crawl-session/hooks/use-crawl-session";
import { isPhotoRepairActive, usePhotoRepair } from "@/features/photo-repair/hooks/use-photo-repair";
import { cn } from "@/lib/utils";

/** Shown on other pages while crawls or a photo check run; points to where the user is needed. */
export function ActiveTaskBanner() {
  const { active, needsUser } = useActiveCrawls();
  const photos = usePhotoRepair();
  const { pathname } = useLocation();
  const photosActive = isPhotoRepairActive(photos);

  const parts: string[] = [];
  if (active.length === 1) parts.push(`Crawling ${active[0].agency_name}`);
  else if (active.length > 1) parts.push(`${active.length} crawls running`);
  if (photosActive) parts.push(`checking photos of ${photos.agency_name ?? "an agency"}`);
  if (parts.length === 0) return null;

  const photosNeedUser = photosActive && photos.block === BlockStates.NEEDS_USER;
  const helpTarget = needsUser[0];
  let to: string = Routes.agencies;
  if (helpTarget?.scraper_id) to = Routes.crawl(helpTarget.scraper_id);
  else if (photosNeedUser && photos.agency_id) to = Routes.photos(photos.agency_id);
  else if (active.length === 1 && active[0].scraper_id && !photosActive) to = Routes.crawl(active[0].scraper_id);
  else if (active.length === 0 && photos.agency_id) to = Routes.photos(photos.agency_id);
  if (pathname === to) return null;

  const helpText = helpTarget
    ? `${helpTarget.agency_name} needs your help in Chrome`
    : photosNeedUser
      ? "the photo check needs your help in Chrome"
      : null;
  const text = parts.join(", ");

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium",
        helpText ? "bg-warning text-warning-foreground" : "bg-accent-soft text-accent",
      )}
    >
      <Spinner size="sm" color="current" />
      {helpText ? `${text}: ${helpText}` : text.charAt(0).toUpperCase() + text.slice(1)}
      <span className="underline underline-offset-4">Open</span>
    </Link>
  );
}
