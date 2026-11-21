import { useEffect } from "react";
import { useCrawlSessionStore } from "@/stores/crawl-session";
import { usePhotoRepairStore } from "@/stores/photo-repair";
import { useAppUpdateStore } from "@/stores/app-update";

/** Keeps the crawl, photo-repair and update stores in sync with the main process. */
export function TaskStateSync() {
  const setCrawlStates = useCrawlSessionStore((s) => s.setStates);
  const setPhotoStates = usePhotoRepairStore((s) => s.setStates);
  const setUpdateState = useAppUpdateStore((s) => s.setState);

  useEffect(() => {
    void window.desktop.crawl.getStates().then(setCrawlStates);
    void window.desktop.photos.getStates().then(setPhotoStates);
    void window.desktop.update.getState().then(setUpdateState);
    const offCrawl = window.desktop.crawl.onStates(setCrawlStates);
    const offPhotos = window.desktop.photos.onStates(setPhotoStates);
    const offUpdate = window.desktop.update.onState(setUpdateState);
    return () => {
      offCrawl();
      offPhotos();
      offUpdate();
    };
  }, [setCrawlStates, setPhotoStates, setUpdateState]);

  return null;
}
