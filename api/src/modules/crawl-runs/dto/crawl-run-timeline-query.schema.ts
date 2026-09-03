import { z } from 'zod';
import { CrawlRunStatus } from 'generated/prisma';

// date_from/date_to are absolute instants (ISO datetime) bounding the window,
// computed client-side from the viewer's local calendar day -- the server
// never guesses a timezone.
export const CrawlRunTimelineQuerySchema = z.object({
  date_from: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  date_to: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  status: z.nativeEnum(CrawlRunStatus).optional(),
  agency_id: z.string().uuid().optional(),
  scraper_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

export type CrawlRunTimelineQueryType = z.infer<
  typeof CrawlRunTimelineQuerySchema
>;
