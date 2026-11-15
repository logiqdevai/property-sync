import { useEffect } from "react";
import { useCrawlSessionStore } from "@/stores/crawl-session";
import { usePhotoRepairStore } from "@/stores/photo-repair";
import { useAppUpdateStore } from "@/stores/app-update";

/** Keeps the crawl, photo-repair and update stores in sync with the main process. */
export function TaskStateSync() {
  const setCrawlStates = useCrawlSessionStore((s) => s.setStates);
  const setPhotoState = usePhotoRepairStore((s) => s.setState);
  const setUpdateState = useAppUpdateStore((s) => s.setState);

  useEffect(() => {
    void window.desktop.crawl.getStates().then(setCrawlStates);
    void window.desktop.photos.getState().then(setPhotoState);
    void window.desktop.update.getState().then(setUpdateState);
    const offCrawl = window.desktop.crawl.onStates(setCrawlStates);
    const offPhotos = window.desktop.photos.onState(setPhotoState);
    const offUpdate = window.desktop.update.onState(setUpdateState);
    return () => {
      offCrawl();
      offPhotos();
      offUpdate();
    };
  }, [setCrawlStates, setPhotoState, setUpdateState]);

  return null;
}
