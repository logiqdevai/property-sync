import { z } from "zod";

const optionalMaxSteps = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().int().min(1).optional());

export const createGenerationRunFormSchema = z.object({
  source_agency_id: z.string().min(1, "Agency is required"),
  scraper_id: z.string().optional(),
  prompt: z.string().optional(),
  max_steps: optionalMaxSteps,
});

export type CreateGenerationRunFormValues = z.infer<typeof createGenerationRunFormSchema>;
