import { z } from "zod";

export const mergePropertiesSchema = z.object({
  property_ids: z.array(z.string().uuid()).min(2, "Select at least two properties"),
});

export type MergePropertiesFormData = z.infer<typeof mergePropertiesSchema>;
