import { z } from "zod";

export const agencyFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  base_url: z.string().min(1, "Website URL is required").url("Enter a valid URL"),
  country: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
  crawl_interval: z
    .string()
    .min(1, "Crawl interval is required")
    .regex(/^(\S+\s+){4}\S+$/, "Enter a valid 5-field cron expression"),
});

export type AgencyFormValues = z.infer<typeof agencyFormSchema>;

export const DefaultAgencyCrawlInterval = "0 */6 * * *";
