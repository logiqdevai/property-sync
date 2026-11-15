export const ApiRoutes = {
  auth: {
    email: {
      login: "/auth/email/login",
    },
  },
  users: {
    me: "/users/me",
  },
  desktop_crawl: {
    scrapers: "/desktop-crawl/scrapers",
  },
} as const;

/** Pages of the Property Sync web app the crawler links to. */
export const WebAppRoutes = {
  pendingReview: "/dashboard/properties?pending_crm_update=true",
  adminCrawlRun: (id: string) => `/admin/crawl-runs/${id}`,
  adminAgency: (id: string) => `/admin/agencies/${id}`,
} as const;
