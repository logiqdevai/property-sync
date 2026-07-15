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

export function parseOptionalNormalizeLimit(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

export const createScraperFormSchema = z.object({
  source_agency_id: z.string().min(1, "Agency is required"),
  name: z.string().min(1, "Name is required"),
  normalize_limit: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value?.trim()) return true;
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 1;
      },
      { message: "Enter a whole number ≥ 1, or leave blank for unlimited" },
    ),
  config: optionalJsonTextarea,
});

export type CreateScraperFormValues = z.infer<typeof createScraperFormSchema>;

export const createScraperVersionFormSchema = z.object({
  config: optionalJsonTextarea,
  notes: z.string().optional(),
});

export type CreateScraperVersionFormValues = z.infer<typeof createScraperVersionFormSchema>;
