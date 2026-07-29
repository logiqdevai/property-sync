export const JobQueueFilterOptions = [
  { id: "all", label: "All queues" },
  { id: "crawl", label: "crawl" },
  { id: "generation", label: "generation" },
  { id: "watermark-removal", label: "watermark-removal" },
  { id: "content-production", label: "content-production" },
] as const;
