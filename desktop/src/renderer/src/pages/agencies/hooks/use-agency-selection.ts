import { useCallback, useState } from "react";

/** Which agencies (by scraper id) are ticked for "Crawl selected". UI state only. */
export function useAgencySelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((scraperId: string, isSelected: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(scraperId);
      else next.delete(scraperId);
      return next;
    });
  }, []);

  const selectAll = useCallback((scraperIds: string[]) => setSelected(new Set(scraperIds)), []);
  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, selectAll, clear };
}
