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
        syncRuns: {
            list: "/dashboard/sync-runs",
            detail: (id: string) => `/dashboard/sync-runs/${id}`,
        },
        account: "/dashboard/account",
        costLogs: {
            list: "/dashboard/cost-logs",
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
        costLogs: {
            list: "/admin/cost-logs",
        },
        syncRuns: {
            list: "/admin/sync-runs",
            detail: (id: string) => `/admin/sync-runs/${id}`,
        },
        jobs: {
            list: "/admin/jobs",
            detail: (id: string) => `/admin/jobs/${id}`,
        },
        diagnostics: {
            list: "/admin/diagnostics",
            detail: (id: string) => `/admin/diagnostics/${id}`,
        },
        properties: {
            list: "/admin/properties",
            sourceList: "/admin/properties?tab=source",
            userList: "/admin/properties?tab=user",
            detail: (id: string) => `/admin/properties/${id}`,
            sourceDetail: (id: string) => `/admin/properties/sources/${id}`,
            userDetail: (id: string) => `/admin/properties/users/${id}`,
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
        crawlerConfig: "/admin/crawler-config",
    },
};
