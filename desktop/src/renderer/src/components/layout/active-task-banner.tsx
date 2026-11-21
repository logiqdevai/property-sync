import { Link, useLocation } from "react-router-dom";
import { Spinner } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { useActiveCrawls } from "@/features/crawl-session/hooks/use-crawl-session";
import { useActivePhotoRepairs } from "@/features/photo-repair/hooks/use-photo-repair";
import { cn } from "@/lib/utils";

/** Shown on other pages while crawls or a photo check run; points to where the user is needed. */
export function ActiveTaskBanner() {
  const { active, needsUser } = useActiveCrawls();
  const { active: activePhotos, needsUser: photosNeedUser } = useActivePhotoRepairs();
  const { pathname } = useLocation();
  const photosActive = activePhotos.length > 0;

  const parts: string[] = [];
  if (active.length === 1) parts.push(`Crawling ${active[0].agency_name}`);
  else if (active.length > 1) parts.push(`${active.length} crawls running`);
  if (activePhotos.length === 1) parts.push(`checking photos of ${activePhotos[0].agency_name ?? "an agency"}`);
  else if (activePhotos.length > 1) parts.push(`checking photos of ${activePhotos.length} agencies`);
  if (parts.length === 0) return null;

  const helpTarget = needsUser[0];
  const photoHelpTarget = photosNeedUser[0];
  let to: string = Routes.agencies;
  if (helpTarget?.scraper_id) to = Routes.crawl(helpTarget.scraper_id);
  else if (photoHelpTarget?.agency_id) to = Routes.photos(photoHelpTarget.agency_id);
  else if (active.length === 1 && active[0].scraper_id && !photosActive) to = Routes.crawl(active[0].scraper_id);
  else if (active.length === 0 && activePhotos.length === 1 && activePhotos[0].agency_id) {
    to = Routes.photos(activePhotos[0].agency_id);
  }
  if (pathname === to) return null;

  const helpText = helpTarget
    ? `${helpTarget.agency_name} needs your help in Chrome`
    : photoHelpTarget
      ? `${photoHelpTarget.agency_name ?? "a photo check"} needs your help in Chrome`
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
