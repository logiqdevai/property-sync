export const Routes = {
    auth: {
        sign_in: "/auth/sign-in",
        sign_up: "/auth/sign-up",
        forgot_password: "/auth/forgot-password",
        set_password: "/auth/set-password",
    },
    dashboard: {
        root: "/dashboard",
        agencies: "/dashboard/agencies",
        properties: {
            list: "/dashboard/properties",
            detail: (id: string) => `/dashboard/properties/${id}`,
        },
        integrations: "/dashboard/integrations",
        crawlRuns: "/dashboard/crawl-runs",
        account: "/dashboard/account",
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
        integrationTargets: {
            list: "/admin/integration-targets",
            detail: (id: string) => `/admin/integration-targets/${id}`,
        },
        users: {
            list: "/admin/users",
            detail: (id: string) => `/admin/users/${id}`,
        },
    },
};
