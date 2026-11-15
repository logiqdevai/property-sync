import { useEffect, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;

/** Search text (debounced) and the "needs attention / all" switch. UI state only. */
export function useAgencyFilters() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  return {
    search,
    setSearch,
    onlyAttention,
    setOnlyAttention,
    query: { search: debouncedSearch, only_attention: onlyAttention && !debouncedSearch },
  };
}
