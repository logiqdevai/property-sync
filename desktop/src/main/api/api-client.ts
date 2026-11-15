import { gzipSync } from "zlib";
import { sessionStore } from "../auth/session-store";
import type {
  CaptchaKind,
  CaptchaSolveResponse,
  CrawlUpload,
  DesktopCrawlJob,
  DesktopCrawlRunStatus,
  PhotoCheckResult,
  PhotoCheckTarget,
} from "./api.interfaces";

/** API failure with a message that is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

const ApiRoutes = {
  job: (scraperId: string) => `/desktop-crawl/scrapers/${scraperId}/job`,
  runs: (scraperId: string) => `/desktop-crawl/scrapers/${scraperId}/runs`,
  run: (crawlRunId: string) => `/desktop-crawl/runs/${crawlRunId}`,
  solveCaptcha: "/desktop-crawl/captcha/solve",
  reportCaptcha: (taskId: number) => `/desktop-crawl/captcha/${taskId}/report`,
  photoTargets: (agencyId: string) => `/desktop-crawl/agencies/${agencyId}/photos`,
  checkPhotos: (agencyId: string) => `/desktop-crawl/agencies/${agencyId}/photos/check`,
  uploadPhotos: (userPropertyId: string) => `/desktop-crawl/photos/${userPropertyId}`,
} as const;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = sessionStore.get();
  if (!session) throw new ApiError("You are signed out. Sign in again to continue.", 401);

  let response: Response;
  try {
    response = await fetch(`${session.api_url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Request-Id": crypto.randomUUID(),
        "X-Client-Route": "desktop-crawler",
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Can't reach Property Sync. Check the internet connection; the crawl is saved.",
      0,
    );
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(", ");
      else if (body.message) message = body.message;
    } catch {
      /* keep the generic message */
    }
    if (response.status === 401) {
      message = "Your sign-in has expired. Sign in again; the crawl is saved.";
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  getJob: (scraperId: string) => request<DesktopCrawlJob>(ApiRoutes.job(scraperId)),

  /** Sends the whole crawl gzipped (it can be tens of MB as JSON). */
  uploadCrawl: (scraperId: string, upload: CrawlUpload) =>
    request<{ crawl_run_id: string }>(ApiRoutes.runs(scraperId), {
      method: "POST",
      headers: { "Content-Type": "application/gzip" },
      body: new Uint8Array(gzipSync(Buffer.from(JSON.stringify(upload), "utf8"))),
    }),

  getRun: (crawlRunId: string) => request<DesktopCrawlRunStatus>(ApiRoutes.run(crawlRunId)),

  solveCaptcha: (body: { scraper_id: string; kind: CaptchaKind; sitekey: string; url: string }) =>
    request<CaptchaSolveResponse>(ApiRoutes.solveCaptcha, json(body)),

  reportCaptcha: (taskId: number, correct: boolean) =>
    request<{ ok: true }>(ApiRoutes.reportCaptcha(taskId), json({ correct })),

  getPhotoTargets: (agencyId: string) =>
    request<PhotoCheckTarget[]>(ApiRoutes.photoTargets(agencyId)),

  checkPhotos: (agencyId: string, userPropertyIds: string[]) =>
    request<PhotoCheckResult[]>(
      ApiRoutes.checkPhotos(agencyId),
      json({ user_property_ids: userPropertyIds }),
    ),

  uploadPhotos: (userPropertyId: string, photos: Array<{ url: string; bytes: Buffer }>) => {
    const form = new FormData();
    form.append("urls", JSON.stringify(photos.map((p) => p.url)));
    photos.forEach((photo, index) =>
      form.append("files", new Blob([new Uint8Array(photo.bytes)]), `photo-${index + 1}.jpg`),
    );
    return request<{ uploaded: number }>(ApiRoutes.uploadPhotos(userPropertyId), {
      method: "POST",
      body: form,
    });
  },
};
