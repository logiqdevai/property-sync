import { z } from "zod";

export const sendTelegramTestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(4096, "Message must be 4096 characters or less"),
});

export type SendTelegramTestFormValues = z.infer<typeof sendTelegramTestSchema>;
