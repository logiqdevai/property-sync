import { z } from "zod";
import {
  TranslationProviders,
  type TranslationProvider,
} from "@/features/platform-config/interfaces/platform-config.interfaces";

export const CrawlerConfigGroups = {
  LISTING_CRAWL: "listing_crawl",
  DETAIL_ENRICHMENT: "detail_enrichment",
  WORKER: "worker",
  AI_AND_COSTS: "ai_and_costs",
} as const;

export type CrawlerConfigGroup = (typeof CrawlerConfigGroups)[keyof typeof CrawlerConfigGroups];

export const CRAWLER_CONFIG_GROUP_ORDER: {
  id: CrawlerConfigGroup;
  label: string;
  description: string;
}[] = [
  {
    id: CrawlerConfigGroups.LISTING_CRAWL,
    label: "Listing crawl",
    description: "Pagination, timeouts, and scroll behavior for listing pages.",
  },
  {
    id: CrawlerConfigGroups.DETAIL_ENRICHMENT,
    label: "Detail enrichment",
    description: "Concurrency and pacing when opening individual listing detail pages.",
  },
  {
    id: CrawlerConfigGroups.WORKER,
    label: "Crawl worker",
    description: "Job throughput, timeouts, and Chromium process recycling.",
  },
  {
    id: CrawlerConfigGroups.AI_AND_COSTS,
    label: "AI & costs",
    description: "Normalization AI input limits, translation provider, and cost attribution.",
  },
];

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
    | "normalization_ai_raw_description_max_chars"
    | "dewatermark_cost_per_image"
    | "google_translate_cost_per_million_chars"
    | "azure_translate_cost_per_million_chars";
  group: CrawlerConfigGroup;
  label: string;
  defaultValue: number;
  min: number;
  hint: string;
  isDecimal?: boolean;
  step?: number;
}

export const CRAWLER_CONFIG_FIELDS: CrawlerConfigFieldDef[] = [
  {
    key: "crawler_max_pages",
    group: CrawlerConfigGroups.LISTING_CRAWL,
    label: "Max pages",
    defaultValue: 50,
    min: 1,
    hint: "Max listing pages to paginate through per crawl.",
  },
  {
    key: "crawler_page_timeout_ms",
    group: CrawlerConfigGroups.LISTING_CRAWL,
    label: "Page timeout (ms)",
    defaultValue: 30_000,
    min: 1,
    hint: "Timeout for page navigation/load.",
  },
  {
    key: "crawler_selector_timeout_ms",
    group: CrawlerConfigGroups.LISTING_CRAWL,
    label: "Selector timeout (ms)",
    defaultValue: 15_000,
    min: 1,
    hint: "Timeout waiting for the listing selector to appear.",
  },
  {
    key: "crawler_scroll_pause_ms",
    group: CrawlerConfigGroups.LISTING_CRAWL,
    label: "Scroll pause (ms)",
    defaultValue: 1_500,
    min: 0,
    hint: "Pause between infinite-scroll/load-more steps.",
  },
  {
    key: "crawler_detail_concurrency",
    group: CrawlerConfigGroups.DETAIL_ENRICHMENT,
    label: "Detail concurrency",
    defaultValue: 3,
    min: 1,
    hint: "Number of detail pages enriched concurrently.",
  },
  {
    key: "crawler_detail_delay_ms",
    group: CrawlerConfigGroups.DETAIL_ENRICHMENT,
    label: "Detail delay (ms)",
    defaultValue: 500,
    min: 0,
    hint: "Delay between detail-enrichment batches.",
  },
  {
    key: "crawler_worker_concurrency",
    group: CrawlerConfigGroups.WORKER,
    label: "Crawl worker concurrency",
    defaultValue: 5,
    min: 1,
    hint: "Number of crawl jobs processed concurrently by the worker.",
  },
  {
    key: "crawler_job_timeout_ms",
    group: CrawlerConfigGroups.WORKER,
    label: "Crawl job timeout (ms)",
    defaultValue: 1_800_000,
    min: 1,
    hint: "Timeout for a single crawl/enrichment job.",
  },
  {
    key: "crawler_chromium_max_contexts_before_restart",
    group: CrawlerConfigGroups.WORKER,
    label: "Chromium max contexts before restart",
    defaultValue: 250,
    min: 1,
    hint: "Browser contexts created before recycling the shared Chromium instance.",
  },
  {
    key: "normalization_ai_raw_description_max_chars",
    group: CrawlerConfigGroups.AI_AND_COSTS,
    label: "AI raw description max chars",
    defaultValue: 2000,
    min: 100,
    hint: "Max characters of scraped description sent to AI for field extraction. Full text is still stored on the property.",
  },
  {
    key: "dewatermark_cost_per_image",
    group: CrawlerConfigGroups.AI_AND_COSTS,
    label: "Dewatermark cost per image (USD)",
    defaultValue: 0.02,
    min: 0,
    hint: "Cost attributed per dewatermarked image in the cost log.",
    isDecimal: true,
    step: 0.01,
  },
  {
    key: "google_translate_cost_per_million_chars",
    group: CrawlerConfigGroups.AI_AND_COSTS,
    label: "Google Translate cost per million chars (USD)",
    defaultValue: 20,
    min: 0,
    hint: "Google Cloud Translation Basic public rate. Used for TRANSLATION cost logs.",
    isDecimal: true,
    step: 0.01,
  },
  {
    key: "azure_translate_cost_per_million_chars",
    group: CrawlerConfigGroups.AI_AND_COSTS,
    label: "Azure Translator cost per million chars (USD)",
    defaultValue: 10,
    min: 0,
    hint: "Azure Translator S1 standard text translation public rate. Used for TRANSLATION cost logs.",
    isDecimal: true,
    step: 0.01,
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

function optionalDecimalField(min: number) {
  return z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value?.trim()) return true;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= min;
      },
      { message: `Enter a number ≥ ${min}, or leave blank to use the default` },
    );
}

export const crawlerConfigFormSchema = z.object({
  ...(Object.fromEntries(
    CRAWLER_CONFIG_FIELDS.map((field) => [
      field.key,
      field.isDecimal ? optionalDecimalField(field.min) : optionalIntegerField(field.min),
    ]),
  ) as Record<CrawlerConfigFieldDef["key"], ReturnType<typeof optionalIntegerField>>),
  translation_provider: z.enum([
    TranslationProviders.GOOGLE_TRANSLATE,
    TranslationProviders.AZURE,
  ]),
});

export type CrawlerConfigFormValues = z.infer<typeof crawlerConfigFormSchema>;

export const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider =
  TranslationProviders.GOOGLE_TRANSLATE;

export function parseOptionalConfigNumber(
  value: string | undefined,
  isDecimal?: boolean,
): number | null | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (isDecimal ? !Number.isFinite(parsed) : !Number.isInteger(parsed)) return undefined;
  return parsed;
}
