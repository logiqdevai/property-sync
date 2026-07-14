import { z } from "zod";

export const createGenerationRunFormSchema = z.object({
  source_agency_id: z.string().min(1, "Agency is required"),
  scraper_id: z.string().optional(),
  prompt: z.string().optional(),
});

export type CreateGenerationRunFormValues = z.infer<typeof createGenerationRunFormSchema>;
