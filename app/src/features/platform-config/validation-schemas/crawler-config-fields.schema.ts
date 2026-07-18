import { z } from "zod";

export interface CrawlerConfigFieldDef {
  key:
    | "crawler_max_pages"
    | "crawler_page_timeout_ms"
    | "crawler_selector_timeout_ms"
    | "crawler_scroll_pause_ms"
    | "crawler_detail_concurrency"
    | "crawler_detail_delay_ms"
    | "crawler_worker_concurrency"
    | "crawler_job_timeout_ms"
    | "crawler_chromium_max_contexts_before_restart"
    | "normalization_ai_raw_description_max_chars";
  label: string;
  defaultValue: number;
  min: number;
  hint: string;
}

export const CRAWLER_CONFIG_FIELDS: CrawlerConfigFieldDef[] = [
  {
    key: "crawler_max_pages",
    label: "Max pages",
    defaultValue: 50,
    min: 1,
    hint: "Max listing pages to paginate through per crawl.",
  },
  {
    key: "crawler_page_timeout_ms",
    label: "Page timeout (ms)",
    defaultValue: 30_000,
    min: 1,
    hint: "Timeout for page navigation/load.",
  },
  {
    key: "crawler_selector_timeout_ms",
    label: "Selector timeout (ms)",
    defaultValue: 15_000,
    min: 1,
    hint: "Timeout waiting for the listing selector to appear.",
  },
  {
    key: "crawler_scroll_pause_ms",
    label: "Scroll pause (ms)",
    defaultValue: 1_500,
    min: 0,
    hint: "Pause between infinite-scroll/load-more steps.",
  },
  {
    key: "crawler_detail_concurrency",
    label: "Detail concurrency",
    defaultValue: 3,
    min: 1,
    hint: "Number of detail pages enriched concurrently.",
  },
  {
    key: "crawler_detail_delay_ms",
    label: "Detail delay (ms)",
    defaultValue: 500,
    min: 0,
    hint: "Delay between detail-enrichment batches.",
  },
  {
    key: "crawler_worker_concurrency",
    label: "Crawl worker concurrency",
    defaultValue: 5,
    min: 1,
    hint: "Number of crawl jobs processed concurrently by the worker.",
  },
  {
    key: "crawler_job_timeout_ms",
    label: "Crawl job timeout (ms)",
    defaultValue: 1_800_000,
    min: 1,
    hint: "Timeout for a single crawl/enrichment job.",
  },
  {
    key: "crawler_chromium_max_contexts_before_restart",
    label: "Chromium max contexts before restart",
    defaultValue: 250,
    min: 1,
    hint: "Browser contexts created before recycling the shared Chromium instance.",
  },
  {
    key: "normalization_ai_raw_description_max_chars",
    label: "AI raw description max chars",
    defaultValue: 2000,
    min: 100,
    hint: "Max characters of scraped description sent to AI for field extraction. Full text is still stored on the property.",
  },
];

function optionalIntegerField(min: number) {
  return z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value?.trim()) return true;
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= min;
      },
      { message: `Enter a whole number ≥ ${min}, or leave blank to use the default` },
    );
}

export const crawlerConfigFormSchema = z.object(
  Object.fromEntries(
    CRAWLER_CONFIG_FIELDS.map((field) => [field.key, optionalIntegerField(field.min)]),
  ) as Record<CrawlerConfigFieldDef["key"], ReturnType<typeof optionalIntegerField>>,
);

export type CrawlerConfigFormValues = z.infer<typeof crawlerConfigFormSchema>;

export function parseOptionalConfigNumber(value: string | undefined): number | null | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) return undefined;
  return parsed;
}
