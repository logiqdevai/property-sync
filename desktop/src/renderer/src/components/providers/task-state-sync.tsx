import { useEffect } from "react";
import { useCrawlSessionStore } from "@/stores/crawl-session";
import { usePhotoRepairStore } from "@/stores/photo-repair";

/** Keeps the crawl and photo-repair stores in sync with the tasks running in the main process. */
export function TaskStateSync() {
  const setCrawlState = useCrawlSessionStore((s) => s.setState);
  const setPhotoState = usePhotoRepairStore((s) => s.setState);

  useEffect(() => {
    void window.desktop.crawl.getState().then(setCrawlState);
    void window.desktop.photos.getState().then(setPhotoState);
    const offCrawl = window.desktop.crawl.onState(setCrawlState);
    const offPhotos = window.desktop.photos.onState(setPhotoState);
    return () => {
      offCrawl();
      offPhotos();
    };
  }, [setCrawlState, setPhotoState]);

  return null;
}
