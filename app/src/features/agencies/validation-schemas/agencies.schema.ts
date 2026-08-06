import { z } from "zod";
import { ContentLanguages } from "@/features/content-publishing/interfaces/content-publishing.interfaces";

const optionalNonNegativeInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().int().min(0).optional());

const blockRuleSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional().nullable(),
  signal: z.enum(["BLOCKED", "CHALLENGE"]),
  source: z.enum([
    "TITLE",
    "TEXT",
    "HTML",
    "PATH",
    "SCRIPT_CONTENT",
    "SELECTOR",
  ]),
  pattern: z.string().min(1, "Pattern is required"),
  is_regex: z.boolean().optional(),
  regex_flags: z.string().optional().nullable(),
  position: z.number().int().optional(),
});

export const agencyFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  base_url: z.string().min(1, "Website URL is required").url("Enter a valid URL"),
  country: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
  content_language: z.enum([
    ContentLanguages.EL,
    ContentLanguages.EN,
    ContentLanguages.DE,
    ContentLanguages.FR,
    ContentLanguages.IT,
    ContentLanguages.RU,
  ]),
  crawl_interval: z
    .string()
    .min(1, "Crawl interval is required")
    .regex(/^(\S+\s+){4}\S+$/, "Enter a valid 5-field cron expression"),
  block_handling_wait_timeout_ms: optionalNonNegativeInt,
  block_handling_min_ready_body_length: optionalNonNegativeInt,
  block_rules: z.array(blockRuleSchema).default([]),
});

export type AgencyFormValues = z.infer<typeof agencyFormSchema>;

export const DefaultAgencyCrawlInterval = "0 6 * * *";

export const EmptyBlockRule = {
  label: "",
  signal: "CHALLENGE" as const,
  source: "PATH" as const,
  pattern: "",
  is_regex: false,
  regex_flags: "",
};

export function toAgencyBlockHandlingPayload(values: AgencyFormValues) {
  return {
    block_handling_wait_timeout_ms:
      values.block_handling_wait_timeout_ms ?? null,
    block_handling_min_ready_body_length:
      values.block_handling_min_ready_body_length ?? null,
    block_rules: values.block_rules.map((rule, index) => ({
      label: rule.label?.trim() || undefined,
      signal: rule.signal,
      source: rule.source,
      pattern: rule.pattern,
      is_regex: rule.is_regex ?? false,
      regex_flags: rule.is_regex
        ? rule.regex_flags?.trim() || undefined
        : undefined,
      position: index,
    })),
  };
}
