import { z } from "zod";

const jsonTextarea = z.string().min(1, "Config is required").refine(
  (value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Enter valid JSON" },
);

export const createScraperFormSchema = z.object({
  source_agency_id: z.string().min(1, "Agency is required"),
  name: z.string().min(1, "Name is required"),
  config: jsonTextarea,
});

export type CreateScraperFormValues = z.infer<typeof createScraperFormSchema>;

export const createScraperVersionFormSchema = z.object({
  config: jsonTextarea,
  notes: z.string().optional(),
});

export type CreateScraperVersionFormValues = z.infer<typeof createScraperVersionFormSchema>;
