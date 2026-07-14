export const Routes = {
    auth: {
        sign_in: "/auth/sign-in",
        sign_up: "/auth/sign-up",
    },
    dashboard: {
        root: "/dashboard",
        agencies: "/dashboard/agencies",
        properties: {
            list: "/dashboard/properties",
            detail: (id: string) => `/dashboard/properties/${id}`,
        },
    },
    admin: {
        root: "/admin",
        agencies: {
            list: "/admin/agencies",
            detail: (id: string) => `/admin/agencies/${id}`,
        },
        scrapers: {
            list: "/admin/scrapers",
            detail: (id: string) => `/admin/scrapers/${id}`,
        },
        generationRuns: {
            list: "/admin/generation-runs",
            detail: (id: string) => `/admin/generation-runs/${id}`,
        },
        crawlRuns: {
            list: "/admin/crawl-runs",
            detail: (id: string) => `/admin/crawl-runs/${id}`,
        },
        jobs: {
            list: "/admin/jobs",
            detail: (id: string) => `/admin/jobs/${id}`,
        },
        properties: {
            list: "/admin/properties",
            detail: (id: string) => `/admin/properties/${id}`,
        },
        notifications: "/admin/notifications",
    },
};
