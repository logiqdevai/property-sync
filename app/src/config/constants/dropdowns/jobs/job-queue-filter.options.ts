export const JobQueueFilterOptions = [
  { id: "all", label: "All queues" },
  { id: "crawl", label: "crawl" },
  { id: "generation", label: "generation" },
  { id: "watermark-removal", label: "watermark-removal" },
  { id: "content-production", label: "content-production" },
  { id: "sales-price-update", label: "sales-price-update" },
  { id: "crm-client-notes-sync", label: "crm-client-notes-sync" },
  { id: "renormalization", label: "renormalization" },
] as const;
