export const Routes = {
    auth: {
        sign_in: "/auth/sign-in",
        sign_up: "/auth/sign-up",
    },
    dashboard: {
        root: "/dashboard",
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
    },
};
