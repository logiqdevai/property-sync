import { z } from "zod";

const optionalJsonTextarea = z.string().refine(
  (value) => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Enter valid JSON" },
);

export function parseOptionalJsonConfig(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as Record<string, unknown>;
}

export const createScraperFormSchema = z.object({
  source_agency_id: z.string().min(1, "Agency is required"),
  name: z.string().min(1, "Name is required"),
  config: optionalJsonTextarea,
});

export type CreateScraperFormValues = z.infer<typeof createScraperFormSchema>;

export const createScraperVersionFormSchema = z.object({
  config: optionalJsonTextarea,
  notes: z.string().optional(),
});

export type CreateScraperVersionFormValues = z.infer<typeof createScraperVersionFormSchema>;
