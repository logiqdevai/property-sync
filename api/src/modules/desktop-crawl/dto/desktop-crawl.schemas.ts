import { z } from 'zod';
import { PHOTO_CHECK_BATCH_MAX } from '../constants/desktop-crawl.constants';

export const DesktopCrawlScrapersQuerySchema = z.object({
  search: z.string().trim().optional(),
  only_attention: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type DesktopCrawlScrapersQueryType = z.infer<
  typeof DesktopCrawlScrapersQuerySchema
>;

const DesktopCrawlUploadItemSchema = z.object({
  source_url: z.string().url(),
  raw: z.record(z.unknown()),
  detail: z.record(z.unknown()).nullable().optional(),
  detail_error: z.string().max(2000).nullable().optional(),
  detail_final_url: z.string().max(4000).nullable().optional(),
  detail_body_text_length: z.number().int().nonnegative().nullable().optional(),
});

/** The gzipped JSON body of `POST /desktop-crawl/scrapers/:id/runs`. */
export const DesktopCrawlUploadSchema = z.object({
  /** True when every listing page and every detail page was walked. */
  complete: z.boolean(),
  items: z.array(DesktopCrawlUploadItemSchema).min(1).max(50_000),
  stats: z.record(z.number()).optional(),
});
export type DesktopCrawlUploadDto = z.infer<typeof DesktopCrawlUploadSchema>;

export const SolveCaptchaSchema = z.object({
  scraper_id: z.string().uuid(),
  kind: z.enum(['hcaptcha', 'turnstile', 'recaptcha2']),
  sitekey: z.string().min(1).max(200),
  url: z.string().url().max(4000),
});
export type SolveCaptchaDto = z.infer<typeof SolveCaptchaSchema>;

export const ReportCaptchaSchema = z.object({
  correct: z.boolean(),
});
export type ReportCaptchaDto = z.infer<typeof ReportCaptchaSchema>;

export const CheckPhotosSchema = z.object({
  user_property_ids: z
    .array(z.string().uuid())
    .min(1)
    .max(PHOTO_CHECK_BATCH_MAX),
});
export type CheckPhotosDto = z.infer<typeof CheckPhotosSchema>;

/** Multipart text field `urls`: a JSON array with one source url per uploaded file, same order. */
export const UploadPhotosFieldsSchema = z.object({
  urls: z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'urls must be a JSON array',
        });
        return z.NEVER;
      }
    })
    .pipe(z.array(z.string().url()).min(1)),
});
export type UploadPhotosFieldsDto = z.infer<typeof UploadPhotosFieldsSchema>;
