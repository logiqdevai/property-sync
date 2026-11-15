export const Routes = {
  auth: {
    sign_in: "/sign-in",
  },
  agencies: "/",
  crawl: (scraperId: string) => `/crawl/${scraperId}`,
  photos: (agencyId: string) => `/photos/${agencyId}`,
} as const;
