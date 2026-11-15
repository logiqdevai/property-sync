import { useEffect } from "react";
import { useCrawlSessionStore } from "@/stores/crawl-session";
import { usePhotoRepairStore } from "@/stores/photo-repair";
import { useAppUpdateStore } from "@/stores/app-update";

/** Keeps the crawl, photo-repair and update stores in sync with the main process. */
export function TaskStateSync() {
  const setCrawlState = useCrawlSessionStore((s) => s.setState);
  const setPhotoState = usePhotoRepairStore((s) => s.setState);
  const setUpdateState = useAppUpdateStore((s) => s.setState);

  useEffect(() => {
    void window.desktop.crawl.getState().then(setCrawlState);
    void window.desktop.photos.getState().then(setPhotoState);
    void window.desktop.update.getState().then(setUpdateState);
    const offCrawl = window.desktop.crawl.onState(setCrawlState);
    const offPhotos = window.desktop.photos.onState(setPhotoState);
    const offUpdate = window.desktop.update.onState(setUpdateState);
    return () => {
      offCrawl();
      offPhotos();
      offUpdate();
    };
  }, [setCrawlState, setPhotoState, setUpdateState]);

  return null;
}
